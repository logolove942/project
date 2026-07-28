<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import {
  completeTask,
  fetchAccounts,
  fetchMonthlyStats,
  fetchRequirements,
  fetchScopedTodoList,
  pauseTask,
  resumeTask,
  startTask,
  type MonthlyStats,
} from "../api/client";
import { avatarColor, initials } from "../avatarUtils";
import { currentMonth, today } from "../dateUtils";
import type { Account, TodoItem } from "../types";
import DetailPanel from "./DetailPanel.vue";
import QuickAddReminder from "./QuickAddReminder.vue";
import QuickAddTask from "./QuickAddTask.vue";

const props = defineProps<{ apiBaseUrl: string; currentAccount: Account }>();

const items = ref<TodoItem[]>([]);
const loading = ref(true);
const error = ref<string | null>(null);
const actionError = ref<string | null>(null);
const draggedId = ref<string | null>(null);
const selectedItem = ref<{ id: string; kind: "task" | "reminder" } | null>(null);

function selectItem(item: TodoItem) {
  selectedItem.value = { id: item.id, kind: item.kind };
}

// 身分切換：viewer 是誰在問（決定雜事的可見性），scopeMode 決定要看誰的範圍。
// 登入後身分就是登入帳號，不再是自由輸入（issue #49）；「某位同仁」改成從帳號名單選（issue #49）。
const viewerName = computed(() => props.currentAccount.name);
const scopeMode = ref<"self" | "person" | "all">("all");
const scopePersonName = ref("");
const accountOptions = ref<Account[]>([]);

async function loadAccountOptions() {
  try {
    accountOptions.value = await fetchAccounts(props.apiBaseUrl);
  } catch {
    // 帳號清單載入失敗不影響看板主要功能，「某位同仁」下拉會顯示空清單。
  }
}

const scopeParam = computed<"all" | string>(() => {
  if (scopeMode.value === "all") return "all";
  if (scopeMode.value === "self") return viewerName.value;
  return scopePersonName.value;
});

const TYPE_FILTERS = ["全部", "任務", "提醒", "雜事"] as const;
const typeFilter = ref<(typeof TYPE_FILTERS)[number]>("全部");

function matchesTypeFilter(item: TodoItem): boolean {
  if (typeFilter.value === "全部") return true;
  if (typeFilter.value === "任務") return item.kind === "task";
  if (typeFilter.value === "提醒") return item.kind === "reminder" && !item.isChore;
  return item.kind === "reminder" && item.isChore; // 雜事
}

const visibleItems = computed(() => items.value.filter(matchesTypeFilter));

const COLUMNS = ["待處理", "進行中", "暫停"] as const;

// 提醒的「未處理」對應「待處理」欄；完成/已結案的項目不進入任何常駐欄位（ADR-0002）。
function statusColumn(item: TodoItem): string {
  if (item.kind === "task") return item.status;
  return item.status === "已結案" ? "完成" : "待處理";
}

const columns = computed(() =>
  COLUMNS.map((name) => ({
    name,
    items: visibleItems.value.filter((item) => statusColumn(item) === name),
  })),
);

// 今天結案的項目短暫可見；非當天結案的項目完全不出現（隔天連這個區塊也不會再看到），
// 只留在工時統計裡可查（ADR-0002）。
const recentlyCompleted = computed(() =>
  visibleItems.value.filter((item) => statusColumn(item) === "完成" && item.closedDate === today()),
);

// 只有第一次載入顯示滿版的載入中狀態；之後拖曳/完成觸發的重新整理
// 靜靜更新資料，看板本身不會因為每次動作而整個消失又出現。
const hasLoadedOnce = ref(false);
const monthlyStats = ref<MonthlyStats | null>(null);
const statsError = ref<string | null>(null);

// 新增任務/提醒表單用的規格下拉選單資料——只需要 id/顯示文字，
// 用需求標題＋規格標題組合，避免只顯示規格 id 讓人看不懂選的是哪一份。
const specOptions = ref<{ id: string; label: string }[]>([]);

async function loadSpecOptions() {
  try {
    const requirements = await fetchRequirements(props.apiBaseUrl);
    specOptions.value = requirements.flatMap((requirement) =>
      requirement.specs.map((spec) => ({ id: spec.id, label: `${requirement.title} / ${spec.title}` })),
    );
  } catch {
    // 規格清單載入失敗不影響看板主要功能，新增任務表單會顯示空的下拉選單。
  }
}

async function loadStats() {
  try {
    monthlyStats.value = await fetchMonthlyStats(props.apiBaseUrl, scopeParam.value, currentMonth());
    statsError.value = null;
  } catch (e) {
    statsError.value = e instanceof Error ? e.message : "載入月度工時統計失敗";
  }
}

async function load() {
  if (!hasLoadedOnce.value) loading.value = true;
  error.value = null;
  try {
    items.value = await fetchScopedTodoList(props.apiBaseUrl, viewerName.value, scopeParam.value);
    hasLoadedOnce.value = true;
  } catch (e) {
    error.value = e instanceof Error ? e.message : "載入待辦清單失敗";
  } finally {
    loading.value = false;
  }
  await loadStats(); // 隨每次重新整理一起更新，身分/範圍改變時自然跟著重新查詢
}

function onDragStart(item: TodoItem) {
  // 提醒沒有暫停/開始這類狀態轉換，不支援拖曳。
  if (item.kind !== "task") return;
  draggedId.value = item.id;
}

// 拖曳只在待處理/進行中/暫停三欄之間移動——不合法的組合直接忽略，
// 卡片因為沒有被樂觀地搬動，等於自然「彈回」原本的欄位。完成沒有
// 對應的常駐欄位可以拖進去（ADR-0002），改用卡片上的「✓ 完成」按鈕。
async function onDrop(targetColumn: (typeof COLUMNS)[number]) {
  const id = draggedId.value;
  draggedId.value = null;
  if (!id) return;

  const item = items.value.find((i) => i.id === id);
  if (!item || item.kind !== "task" || item.status === targetColumn) return;

  try {
    if (targetColumn === "進行中") {
      if (item.status === "待處理") await startTask(props.apiBaseUrl, id);
      else if (item.status === "暫停") await resumeTask(props.apiBaseUrl, id);
      else return;
    } else if (targetColumn === "暫停") {
      if (item.status === "待處理" || item.status === "進行中") await pauseTask(props.apiBaseUrl, id);
      else return;
    } else if (targetColumn === "待處理") {
      if (item.status === "暫停") await resumeTask(props.apiBaseUrl, id);
      else return; // 進行中 -> 待處理不合法，忽略
    }
    await load();
  } catch (e) {
    actionError.value = e instanceof Error ? e.message : "更新狀態失敗";
  }
}

async function onComplete(item: TodoItem) {
  try {
    await completeTask(props.apiBaseUrl, item.id);
    await load();
  } catch (e) {
    actionError.value = e instanceof Error ? e.message : "完成任務失敗";
  }
}

onMounted(load);
onMounted(loadSpecOptions);
onMounted(loadAccountOptions);

defineExpose({ reload: load });
</script>

<template>
  <div class="kanban-board">
    <div class="identity-bar">
      <span class="viewer-label" data-testid="viewer-name">我是 {{ viewerName }}</span>
      <div class="scope-tabs">
        <button
          type="button"
          data-testid="scope-self"
          :class="{ active: scopeMode === 'self' }"
          @click="scopeMode = 'self'; load()"
        >
          我
        </button>
        <button
          type="button"
          data-testid="scope-all"
          :class="{ active: scopeMode === 'all' }"
          @click="scopeMode = 'all'; load()"
        >
          全觀
        </button>
        <button
          type="button"
          data-testid="scope-person-btn"
          :class="{ active: scopeMode === 'person' }"
          @click="scopeMode = 'person'"
        >
          某位同仁
        </button>
        <select
          v-if="scopeMode === 'person'"
          v-model="scopePersonName"
          data-testid="scope-person-select"
          @change="load"
        >
          <option value="">選擇同仁</option>
          <option v-for="account in accountOptions" :key="account.id" :value="account.name">
            {{ account.name }}
          </option>
        </select>
      </div>
      <div class="type-filters">
        <button
          v-for="filter in TYPE_FILTERS"
          :key="filter"
          type="button"
          :data-testid="`type-filter-${filter}`"
          :class="{ active: typeFilter === filter }"
          @click="typeFilter = filter"
        >
          {{ filter }}
        </button>
      </div>
    </div>

    <div class="quick-add-bar">
      <QuickAddReminder
        :api-base-url="apiBaseUrl"
        :viewer-name="viewerName"
        :specs="specOptions"
        :accounts="accountOptions"
        @created="load"
      />
      <QuickAddTask :api-base-url="apiBaseUrl" :specs="specOptions" :accounts="accountOptions" @created="load" />
    </div>

    <div v-if="monthlyStats" class="monthly-stats" data-testid="monthly-stats">
      <div class="stat-tile">
        <div class="stat-label">本月待處理工時</div>
        <div class="stat-value" data-testid="stat-pending-hours">{{ monthlyStats.pendingHours }}h</div>
      </div>
      <div class="stat-tile">
        <div class="stat-label">本月已投入工時</div>
        <div class="stat-value" data-testid="stat-logged-hours">{{ monthlyStats.loggedHours }}h</div>
      </div>
    </div>
    <p v-else-if="statsError" data-testid="stats-error">{{ statsError }}</p>

    <p v-if="loading" data-testid="loading">載入中…</p>
    <p v-else-if="error" data-testid="error">{{ error }}</p>
    <template v-else>
      <p v-if="actionError" data-testid="action-error" class="action-error">
        {{ actionError }}
        <button type="button" @click="actionError = null">關閉</button>
      </p>
      <div class="board-layout">
        <div class="board-main">
          <div class="columns">
            <div
              v-for="column in columns"
              :key="column.name"
              class="column"
              :data-testid="`column-${column.name}`"
              @dragover.prevent
              @drop="onDrop(column.name)"
            >
              <h3>{{ column.name }} ({{ column.items.length }})</h3>
              <div
                v-for="item in column.items"
                :key="item.id"
                class="card"
                :draggable="item.kind === 'task'"
                :data-testid="`card-${item.id}`"
                @dragstart="onDragStart(item)"
                @click="selectItem(item)"
              >
                <div class="card-title">{{ item.title }}</div>
                <div class="card-meta">
                  <span class="badge">{{ item.kind === "task" ? "任務" : item.isChore ? "雜事" : "提醒" }}</span>
                  <span v-if="scopeMode === 'all'" class="owner" :data-testid="`owner-${item.id}`">
                    <span
                      v-for="owner in item.owners"
                      :key="owner"
                      class="avatar-mini"
                      :style="{ background: avatarColor(owner) }"
                      >{{ initials(owner) }}</span
                    >{{ item.owners.join("、") }}</span
                  >
                  <span class="priority">{{ item.priority }}</span>
                  <span v-if="item.dueDate">{{ item.dueDate }}</span>
                  <span v-if="item.specId">📎 {{ item.specId }}</span>
                </div>
                <button
                  v-if="item.kind === 'task' && item.status === '進行中'"
                  type="button"
                  class="complete-btn"
                  :data-testid="`complete-${item.id}`"
                  @click.stop="onComplete(item)"
                >
                  ✓ 完成
                </button>
              </div>
            </div>
          </div>

          <details v-if="recentlyCompleted.length" class="recently-completed" data-testid="recently-completed">
            <summary>剛完成（今天） ({{ recentlyCompleted.length }})</summary>
            <div
              v-for="item in recentlyCompleted"
              :key="item.id"
              class="card"
              :data-testid="`recently-completed-card-${item.id}`"
              @click="selectItem(item)"
            >
              <div class="card-title">{{ item.title }}</div>
              <div class="card-meta">
                <span class="badge">{{ item.kind === "task" ? "任務" : item.isChore ? "雜事" : "提醒" }}</span>
                <span v-if="scopeMode === 'all'" class="owner">
                  <span
                    v-for="owner in item.owners"
                    :key="owner"
                    class="avatar-mini"
                    :style="{ background: avatarColor(owner) }"
                    >{{ initials(owner) }}</span
                  >{{ item.owners.join("、") }}</span
                >
                <span>{{ item.status }}</span>
              </div>
            </div>
          </details>
        </div>

        <DetailPanel
          v-if="selectedItem"
          :api-base-url="apiBaseUrl"
          :item-id="selectedItem.id"
          :kind="selectedItem.kind"
          :accounts="accountOptions"
          @close="selectedItem = null"
          @changed="load"
          @promoted="(taskId) => (selectedItem = { id: taskId, kind: 'task' })"
        />
      </div>
    </template>
  </div>
</template>

<style scoped>
.kanban-board {
  padding: 20px;
  font-family:
    -apple-system,
    "Segoe UI",
    "PingFang TC",
    "Microsoft JhengHei",
    sans-serif;
}

.board-layout {
  display: grid;
  grid-template-columns: 1fr 320px;
  gap: 16px;
  align-items: start;
}

.columns {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 12px;
  align-items: start;
}

.column {
  background: #f5f6f8;
  border: 1px solid #e2e4e9;
  border-radius: 10px;
  padding: 10px;
}

.column h3 {
  font-size: 13px;
  margin: 0 0 10px;
  color: #6b7280;
}

.card {
  background: #ffffff;
  border: 1px solid #e2e4e9;
  border-radius: 8px;
  padding: 8px 10px;
  margin-bottom: 8px;
  font-size: 13px;
}

.card[draggable="true"] {
  cursor: grab;
}

.complete-btn {
  margin-top: 6px;
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 6px;
  border: 1px solid #2fb344;
  background: transparent;
  color: #2fb344;
  cursor: pointer;
}

.action-error {
  background: #fdecea;
  color: #b3261e;
  border: 1px solid #f5c2c0;
  border-radius: 8px;
  padding: 8px 12px;
  margin-bottom: 12px;
  font-size: 13px;
}

.action-error button {
  margin-left: 8px;
  border: none;
  background: transparent;
  color: inherit;
  text-decoration: underline;
  cursor: pointer;
}

.identity-bar {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 16px;
  font-size: 13px;
}

.monthly-stats {
  display: flex;
  gap: 12px;
  margin-bottom: 16px;
}

.quick-add-bar {
  display: flex;
  gap: 12px;
  margin-bottom: 16px;
  align-items: flex-start;
}

.stat-tile {
  background: #ffffff;
  border: 1px solid #e2e4e9;
  border-radius: 10px;
  padding: 10px 16px;
}

.stat-label {
  font-size: 11px;
  color: #6b7280;
}

.stat-value {
  font-size: 20px;
  font-weight: 600;
}

.viewer-label {
  font-weight: 500;
}

.scope-tabs select {
  border: 1px solid #e2e4e9;
  border-radius: 6px;
  padding: 4px 8px;
  font-size: 12px;
}

.scope-tabs,
.type-filters {
  display: flex;
  gap: 4px;
  align-items: center;
}

.scope-tabs button,
.type-filters button {
  border: 1px solid #e2e4e9;
  background: #fff;
  border-radius: 999px;
  padding: 4px 12px;
  font-size: 12px;
  cursor: pointer;
}

.scope-tabs button.active,
.type-filters button.active {
  background: #3b5bfd;
  border-color: #3b5bfd;
  color: #fff;
}

.owner {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: #4b5563;
}

.avatar-mini {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 8px;
  font-weight: 700;
  color: #ffffff;
  margin-left: -4px;
}

.avatar-mini:first-child {
  margin-left: 0;
}

.card-title {
  font-weight: 500;
  margin-bottom: 4px;
}

.card-meta {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  font-size: 12px;
  color: #6b7280;
}

.badge {
  background: #e6ebff;
  color: #3b5bfd;
  border-radius: 10px;
  padding: 1px 7px;
  font-weight: 600;
}

.recently-completed {
  margin-top: 16px;
}

.recently-completed summary {
  cursor: pointer;
  font-size: 13px;
  font-weight: 600;
  color: #6b7280;
  padding: 6px 0;
}
</style>
