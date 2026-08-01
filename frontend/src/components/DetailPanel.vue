<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import {
  cancelTask,
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
  restoreTask,
  resumeTask,
  startTask,
  updateTask,
} from "../api/client";
import { avatarColor, initials } from "../avatarUtils";
import { today } from "../dateUtils";
import type { Account, Priority, Reminder, Task, TaskAssignee, WorkLogEntry } from "../types";

const props = defineProps<{
  apiBaseUrl: string;
  itemId: string;
  kind: "task" | "reminder";
  accounts: Account[];
  specs: { id: string; label: string }[];
  currentAccount: Account;
}>();
const emit = defineEmits<{ close: []; changed: []; promoted: [taskId: string] }>();

const detail = ref<Task | Reminder | null>(null);
const workLogs = ref<WorkLogEntry[]>([]);
const loading = ref(true);
const error = ref<string | null>(null);
const statusError = ref<string | null>(null);

// 報工表單預設：人員＝自己、日期＝今天、時數＝1 小時——大部分報工都是「自己剛做完的事」，
// 讓最常見的情況不用每次都手動填三個欄位；不合用時仍可自由改掉。
function defaultWorkLogPerson() {
  return props.currentAccount.name;
}
const person = ref(defaultWorkLogPerson());
const date = ref(today());
const hours = ref<number | null>(1);
const note = ref("");
const submitError = ref<string | null>(null);

// 取消/復原是管理職專屬（issue #54，ADR-0004）；非管理職的下拉不顯示「已取消」，
// 避免顯示一個點了也只會被後端 403 的選項——後端才是真正的把關者，這裡只是不多此一舉。
const statusOptions = computed(() => {
  if (props.kind !== "task") return ["未處理", "已結案"];
  const base = ["待處理", "進行中", "暫停", "完成"];
  return props.currentAccount.role === "管理職" ? [...base, "已取消"] : base;
});

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
      else if (newStatus === "已取消" && current !== "完成") await cancelTask(props.apiBaseUrl, id);
      // 復原永遠回到取消前的原狀態（cancelledFrom），不是使用者在下拉選了什麼——
      // 跟既有 pause/resume 一樣，選了任何一個選項都送出同一個動作，重新載入後以真實狀態為準。
      else if (current === "已取消") await restoreTask(props.apiBaseUrl, id);
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

// 任務編輯是管理職專屬（issue #55，PATCH /tasks/:id 掛 requireManagement）；
// 跟取消/復原下拉一樣，非管理職直接不顯示「編輯任務」按鈕，避免顯示一個點了只會被後端 403 的選項。
const canEditTask = computed(() => props.kind === "task" && props.currentAccount.role === "管理職");

const editingTask = ref(false);
const editTitle = ref("");
const editType = ref<"開發任務" | "測試任務">("開發任務");
const editSpecId = ref("");
const editAssignees = ref<string[]>([""]);
const editPriority = ref<Priority>("中");
const editDueDate = ref("");
const editError = ref<string | null>(null);
const editSaving = ref(false);

function startEditTask() {
  const task = detail.value as Task;
  editTitle.value = task.title;
  editType.value = task.type;
  editSpecId.value = task.specId;
  editAssignees.value = task.assignees.length ? task.assignees.map((a) => a.person) : [""];
  editPriority.value = task.priority;
  editDueDate.value = task.dueDate ?? "";
  editError.value = null;
  editingTask.value = true;
}

function cancelEditTask() {
  editingTask.value = false;
  editError.value = null;
}

function addEditAssigneeRow() {
  editAssignees.value.push("");
}

function removeEditAssigneeRow(index: number) {
  editAssignees.value.splice(index, 1);
}

async function submitEditTask() {
  editError.value = null;
  if (!editTitle.value || !editSpecId.value) {
    editError.value = "請填寫標題與所屬規格";
    return;
  }
  const cleanAssignees: TaskAssignee[] = editAssignees.value
    .map((person) => person.trim())
    .filter((person) => person.length > 0)
    .map((person) => ({ person }));

  editSaving.value = true;
  try {
    await updateTask(props.apiBaseUrl, props.itemId, {
      title: editTitle.value,
      type: editType.value,
      specId: editSpecId.value,
      assignees: cleanAssignees,
      priority: editPriority.value,
      dueDate: editDueDate.value || undefined,
    });
    editingTask.value = false;
    await load();
    emit("changed");
  } catch (e) {
    editError.value = e instanceof Error ? e.message : "編輯任務失敗";
  } finally {
    editSaving.value = false;
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
    person.value = defaultWorkLogPerson();
    date.value = today();
    hours.value = 1;
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
        class="status-select"
        :value="detail.status"
        data-testid="status-select"
        @change="onStatusChange(($event.target as HTMLSelectElement).value)"
      >
        <option v-for="option in statusOptions" :key="option" :value="option">{{ option }}</option>
      </select>
      <p v-if="statusError" class="inline-error" data-testid="status-error">{{ statusError }}</p>

      <template v-if="canEditTask">
        <button
          v-if="!editingTask"
          type="button"
          class="btn-ghost btn-sm"
          data-testid="task-edit-btn"
          @click="startEditTask"
        >
          編輯任務
        </button>
        <form v-else class="task-edit-form" data-testid="task-edit-form" @submit.prevent="submitEditTask">
          <label class="field">
            標題
            <input v-model="editTitle" type="text" data-testid="task-edit-title" />
          </label>
          <label class="field">
            任務類型
            <select v-model="editType" data-testid="task-edit-type">
              <option value="開發任務">開發任務</option>
              <option value="測試任務">測試任務</option>
            </select>
          </label>
          <label class="field">
            所屬規格
            <select v-model="editSpecId" data-testid="task-edit-spec">
              <option v-for="spec in specs" :key="spec.id" :value="spec.id">{{ spec.label }}</option>
            </select>
          </label>
          <div class="field">
            <span class="field-label">指派對象</span>
            <div class="assignees">
              <div v-for="(_, index) in editAssignees" :key="index" class="assignee-row">
                <select v-model="editAssignees[index]" :data-testid="`task-edit-assignee-${index}`">
                  <option value="">選擇指派對象</option>
                  <option v-for="account in accounts" :key="account.id" :value="account.name">
                    {{ account.name }}
                  </option>
                </select>
                <button
                  v-if="editAssignees.length > 1"
                  type="button"
                  class="icon-btn"
                  :data-testid="`task-edit-remove-assignee-${index}`"
                  @click="removeEditAssigneeRow(index)"
                >
                  −
                </button>
              </div>
              <button
                type="button"
                class="btn-ghost btn-sm"
                data-testid="task-edit-add-assignee"
                @click="addEditAssigneeRow"
              >
                + 新增指派對象
              </button>
            </div>
          </div>
          <label class="field">
            優先級
            <select v-model="editPriority" data-testid="task-edit-priority">
              <option value="高">高</option>
              <option value="中">中</option>
              <option value="低">低</option>
            </select>
          </label>
          <label class="field">
            到期日（選填）
            <input v-model="editDueDate" type="date" data-testid="task-edit-duedate" />
          </label>
          <p v-if="editError" class="inline-error" data-testid="task-edit-error">{{ editError }}</p>
          <div class="form-actions">
            <button type="button" class="btn-ghost" data-testid="task-edit-cancel" @click="cancelEditTask">
              取消
            </button>
            <button type="submit" class="btn-primary" :disabled="editSaving" data-testid="task-edit-submit">
              儲存
            </button>
          </div>
        </form>
      </template>

      <template v-if="kind === 'reminder'">
        <button
          v-if="!showPromoteForm"
          type="button"
          class="btn-ghost btn-sm"
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
          <button type="submit" class="btn-primary btn-sm" data-testid="promote-submit">確認升級</button>
        </form>
        <p v-if="promoteError" class="inline-error" data-testid="promote-error">{{ promoteError }}</p>
      </template>

      <h3>報工紀錄（全體同仁可見）</h3>
      <p v-if="!workLogs.length" class="empty-note" data-testid="worklog-empty">尚無報工紀錄</p>
      <ul v-else data-testid="worklog-list">
        <li v-for="log in workLogs" :key="log.id" :data-testid="`worklog-${log.id}`">
          <span class="avatar-mini" :style="{ background: avatarColor(log.person) }">{{ initials(log.person) }}</span>
          {{ log.date }}｜{{ log.person }}｜{{ log.hours }} 小時<span v-if="log.note">｜{{ log.note }}</span>
        </li>
      </ul>

      <h3>新增報工</h3>
      <form class="worklog-form" @submit.prevent="submitWorkLog">
        <select v-model="person" data-testid="worklog-person">
          <option value="">選擇人員</option>
          <option v-for="account in accounts" :key="account.id" :value="account.name">
            {{ account.name }}
          </option>
        </select>
        <input v-model="date" type="date" data-testid="worklog-date" />
        <input
          v-model.number="hours"
          type="number"
          step="0.5"
          placeholder="時數"
          data-testid="worklog-hours"
        />
        <input v-model="note" type="text" placeholder="備註（選填）" data-testid="worklog-note" />
        <button type="submit" class="btn-primary btn-sm" data-testid="worklog-submit">送出報工</button>
      </form>
      <p v-if="submitError" class="inline-error" data-testid="worklog-error">{{ submitError }}</p>
    </template>
  </div>
</template>

<style scoped>
.detail-panel {
  position: relative;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  padding: 18px;
  font-size: 13px;
}

.detail-panel h2 {
  font-size: 15px;
  font-weight: 700;
  margin: 0 20px 10px 0;
  color: var(--text);
}

.detail-panel h3 {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  margin: 18px 0 8px;
  color: var(--text-faint);
}

.close-btn {
  position: absolute;
  top: 14px;
  right: 14px;
  border: none;
  background: var(--surface-2);
  color: var(--text-dim);
  width: 26px;
  height: 26px;
  border-radius: 50%;
  cursor: pointer;
  font-size: 13px;
}

.close-btn:hover {
  background: var(--danger-tint);
  color: var(--danger);
}

.status-select {
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 6px 10px;
  font-size: 13px;
  background: var(--bg);
  color: var(--text);
}

.detail-panel ul {
  list-style: none;
  margin: 0;
  padding: 0;
  font-size: 12px;
  color: var(--text-dim);
}

.detail-panel li {
  border-top: 1px dashed var(--border);
  padding: 8px 0;
  display: flex;
  align-items: center;
  gap: 6px;
}

.empty-note {
  color: var(--text-faint);
  font-size: 12px;
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
  flex-shrink: 0;
}

.detail-panel form {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
}

.worklog-form {
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: 10px;
}

.detail-panel form input,
.detail-panel form select {
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 6px 9px;
  font-size: 12.5px;
  background: var(--surface);
  color: var(--text);
  outline: none;
}

.detail-panel form input:focus,
.detail-panel form select:focus {
  border-color: var(--primary);
  box-shadow: var(--shadow-focus);
}

.btn-primary {
  background: var(--primary);
  color: #fff;
  border: none;
  border-radius: var(--radius-sm);
  padding: 7px 14px;
  font-size: 12.5px;
  font-weight: 600;
  cursor: pointer;
}

.btn-primary:hover {
  background: var(--primary-hover);
}

.btn-primary.btn-sm {
  padding: 6px 12px;
  font-size: 12px;
}

.btn-ghost {
  border: 1px solid var(--border);
  background: transparent;
  color: var(--text-dim);
  border-radius: var(--radius-sm);
  padding: 7px 14px;
  font-size: 12.5px;
  font-weight: 600;
  cursor: pointer;
}

.btn-ghost:hover {
  border-color: var(--border-strong);
  color: var(--text);
}

.btn-ghost.btn-sm {
  padding: 5px 10px;
  font-size: 12px;
}

[data-testid="promote-btn"] {
  border: 1px solid var(--primary);
  background: transparent;
  color: var(--primary);
}

.inline-error {
  color: var(--danger);
  font-size: 12px;
  margin: 6px 0 0;
}

.task-edit-form {
  flex-direction: column;
  align-items: stretch;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: 12px;
  margin-top: 8px;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 5px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-dim);
  margin-bottom: 10px;
}

.field-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-dim);
}

.assignees {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 6px;
}

.assignee-row {
  display: flex;
  gap: 6px;
}

.assignee-row select {
  flex: 1;
}

.icon-btn {
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text-dim);
  width: 32px;
  height: 32px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  flex-shrink: 0;
}

.icon-btn:hover {
  background: var(--surface-2);
}

.form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 4px;
}
</style>
