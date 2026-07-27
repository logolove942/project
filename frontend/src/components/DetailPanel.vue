<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import {
  closeReminder,
  completeTask,
  fetchReminder,
  fetchReminderWorkLogs,
  fetchTask,
  fetchTaskWorkLogs,
  logReminderWork,
  logTaskWork,
  pauseTask,
  promoteReminderToTask,
  resumeTask,
  startTask,
} from "../api/client";
import type { Reminder, Task, WorkLogEntry } from "../types";

const props = defineProps<{
  apiBaseUrl: string;
  itemId: string;
  kind: "task" | "reminder";
}>();
const emit = defineEmits<{ close: []; changed: []; promoted: [taskId: string] }>();

const detail = ref<Task | Reminder | null>(null);
const workLogs = ref<WorkLogEntry[]>([]);
const loading = ref(true);
const error = ref<string | null>(null);
const statusError = ref<string | null>(null);

const person = ref("");
const date = ref("");
const hours = ref<number | null>(null);
const note = ref("");
const submitError = ref<string | null>(null);

const statusOptions = computed(() =>
  props.kind === "task" ? ["待處理", "進行中", "暫停", "完成"] : ["未處理", "已結案"],
);

// 沒有通用的「設狀態」endpoint，只有離散的動作（start/pause/resume/complete/close）；
// 依目前狀態決定要呼叫哪一個，呼叫不到的組合直接回報錯誤，不假裝成功。
async function onStatusChange(newStatus: string) {
  statusError.value = null;
  if (!detail.value || newStatus === detail.value.status) return;
  const id = props.itemId;
  const current = detail.value.status;

  try {
    if (props.kind === "task") {
      if (newStatus === "進行中" && current === "待處理") await startTask(props.apiBaseUrl, id);
      else if (newStatus === "進行中" && current === "暫停") await resumeTask(props.apiBaseUrl, id);
      else if (newStatus === "暫停" && (current === "待處理" || current === "進行中"))
        await pauseTask(props.apiBaseUrl, id);
      else if (newStatus === "待處理" && current === "暫停") await resumeTask(props.apiBaseUrl, id);
      else if (newStatus === "完成" && current === "進行中") await completeTask(props.apiBaseUrl, id);
      else throw new Error(`無法從「${current}」轉換到「${newStatus}」`);
    } else {
      if (newStatus === "已結案" && current === "未處理") await closeReminder(props.apiBaseUrl, id);
      else throw new Error(`無法從「${current}」轉換到「${newStatus}」`);
    }
    await load();
    emit("changed");
  } catch (e) {
    statusError.value = e instanceof Error ? e.message : "更新狀態失敗";
    await load(); // 重新載入，讓下拉選單回到真實的目前狀態
  }
}

// 只有第一次載入（或切換到不同項目）顯示滿版載入中；報工/改狀態後的
// 重新整理靜靜更新資料，面板不會因為每次動作而整個消失又出現。
const hasLoadedOnce = ref(false);

async function load() {
  if (!hasLoadedOnce.value) loading.value = true;
  error.value = null;
  try {
    if (props.kind === "task") {
      detail.value = await fetchTask(props.apiBaseUrl, props.itemId);
      workLogs.value = await fetchTaskWorkLogs(props.apiBaseUrl, props.itemId);
    } else {
      detail.value = await fetchReminder(props.apiBaseUrl, props.itemId);
      workLogs.value = await fetchReminderWorkLogs(props.apiBaseUrl, props.itemId);
    }
    hasLoadedOnce.value = true;
  } catch (e) {
    error.value = e instanceof Error ? e.message : "載入詳情失敗";
  } finally {
    loading.value = false;
  }
}

const showPromoteForm = ref(false);
const promoteSpecId = ref("");
const promoteType = ref<"開發任務" | "測試任務">("開發任務");
const promoteAssignee = ref("");
const promoteError = ref<string | null>(null);

async function submitPromote() {
  promoteError.value = null;
  if (!promoteSpecId.value || !promoteAssignee.value) {
    promoteError.value = "請填寫規格與負責人";
    return;
  }
  try {
    const task = await promoteReminderToTask(props.apiBaseUrl, props.itemId, {
      specId: promoteSpecId.value,
      type: promoteType.value,
      assignees: [{ person: promoteAssignee.value }],
    });
    showPromoteForm.value = false;
    emit("promoted", task.id);
    emit("changed");
  } catch (e) {
    promoteError.value = e instanceof Error ? e.message : "升級為正式任務失敗";
  }
}

async function submitWorkLog() {
  submitError.value = null;
  if (!person.value || !date.value || hours.value == null) {
    submitError.value = "請填寫人員、日期、時數";
    return;
  }
  try {
    const entry = {
      person: person.value,
      date: date.value,
      hours: hours.value,
      note: note.value || undefined,
    };
    if (props.kind === "task") {
      await logTaskWork(props.apiBaseUrl, props.itemId, entry);
    } else {
      await logReminderWork(props.apiBaseUrl, props.itemId, entry);
    }
    person.value = "";
    hours.value = null;
    note.value = "";
    await load();
  } catch (e) {
    submitError.value = e instanceof Error ? e.message : "新增報工失敗";
  }
}

onMounted(load);
watch(
  () => [props.itemId, props.kind],
  () => {
    hasLoadedOnce.value = false; // 換了一個新項目，重新顯示滿版載入中
    load();
  },
);

defineExpose({ reload: load });
</script>

<template>
  <div class="detail-panel" data-testid="detail-panel">
    <button type="button" class="close-btn" data-testid="detail-close" @click="emit('close')">✕</button>
    <p v-if="loading" data-testid="detail-loading">載入中…</p>
    <p v-else-if="error" data-testid="detail-error">{{ error }}</p>
    <template v-else-if="detail">
      <h2>{{ detail.title }}</h2>
      <p v-if="detail.specId" data-testid="detail-spec">📎 規格：{{ detail.specId }}</p>
      <p v-else data-testid="detail-no-spec">未掛勾規格</p>

      <h3>狀態</h3>
      <select
        :value="detail.status"
        data-testid="status-select"
        @change="onStatusChange(($event.target as HTMLSelectElement).value)"
      >
        <option v-for="option in statusOptions" :key="option" :value="option">{{ option }}</option>
      </select>
      <p v-if="statusError" data-testid="status-error">{{ statusError }}</p>

      <template v-if="kind === 'reminder'">
        <button
          v-if="!showPromoteForm"
          type="button"
          data-testid="promote-btn"
          @click="showPromoteForm = true"
        >
          升級為正式任務
        </button>
        <form v-else class="promote-form" data-testid="promote-form" @submit.prevent="submitPromote">
          <input v-model="promoteSpecId" type="text" placeholder="規格 id" data-testid="promote-spec" />
          <select v-model="promoteType" data-testid="promote-type">
            <option value="開發任務">開發任務</option>
            <option value="測試任務">測試任務</option>
          </select>
          <input
            v-model="promoteAssignee"
            type="text"
            placeholder="負責人"
            data-testid="promote-assignee"
          />
          <button type="submit" data-testid="promote-submit">確認升級</button>
        </form>
        <p v-if="promoteError" data-testid="promote-error">{{ promoteError }}</p>
      </template>

      <h3>報工紀錄</h3>
      <p v-if="!workLogs.length" data-testid="worklog-empty">尚無報工紀錄</p>
      <ul v-else data-testid="worklog-list">
        <li v-for="log in workLogs" :key="log.id" :data-testid="`worklog-${log.id}`">
          {{ log.date }}｜{{ log.person }}｜{{ log.hours }} 小時<span v-if="log.note">｜{{ log.note }}</span>
        </li>
      </ul>

      <h3>新增報工</h3>
      <form @submit.prevent="submitWorkLog">
        <input v-model="person" type="text" placeholder="人員" data-testid="worklog-person" />
        <input v-model="date" type="date" data-testid="worklog-date" />
        <input
          v-model.number="hours"
          type="number"
          step="0.5"
          placeholder="時數"
          data-testid="worklog-hours"
        />
        <input v-model="note" type="text" placeholder="備註" data-testid="worklog-note" />
        <button type="submit" data-testid="worklog-submit">送出報工</button>
      </form>
      <p v-if="submitError" data-testid="worklog-error">{{ submitError }}</p>
    </template>
  </div>
</template>

<style scoped>
.detail-panel {
  position: relative;
  background: #ffffff;
  border: 1px solid #e2e4e9;
  border-radius: 10px;
  padding: 16px;
  font-size: 13px;
}

.detail-panel h2 {
  font-size: 15px;
  margin: 0 20px 8px 0;
}

.detail-panel h3 {
  font-size: 13px;
  margin: 16px 0 6px;
  color: #6b7280;
}

.close-btn {
  position: absolute;
  top: 12px;
  right: 12px;
  border: none;
  background: transparent;
  cursor: pointer;
  font-size: 14px;
}

.detail-panel ul {
  list-style: none;
  margin: 0;
  padding: 0;
  font-size: 12px;
  color: #6b7280;
}

.detail-panel li {
  border-top: 1px solid #e2e4e9;
  padding: 6px 0;
}

.detail-panel form {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.detail-panel form input {
  border: 1px solid #e2e4e9;
  border-radius: 6px;
  padding: 4px 8px;
  font-size: 13px;
}

.detail-panel form button {
  align-self: flex-start;
  background: #3b5bfd;
  color: #fff;
  border: none;
  border-radius: 6px;
  padding: 6px 14px;
  cursor: pointer;
}

[data-testid="promote-btn"] {
  border: 1px solid #3b5bfd;
  background: transparent;
  color: #3b5bfd;
  border-radius: 6px;
  padding: 4px 10px;
  font-size: 12px;
  cursor: pointer;
}
</style>
