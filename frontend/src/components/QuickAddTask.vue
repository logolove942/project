<script setup lang="ts">
import { ref, watch } from "vue";
import { createTask } from "../api/client";
import type { Account, Priority, TaskAssignee } from "../types";
import Modal from "./Modal.vue";

const props = withDefaults(
  defineProps<{
    apiBaseUrl: string;
    specs: { id: string; label: string }[];
    accounts: Account[];
    initialSpecId?: string;
  }>(),
  { initialSpecId: "" },
);
const emit = defineEmits<{ created: [] }>();

const showForm = ref(false);
const specId = ref(props.initialSpecId);
const type = ref<"開發任務" | "測試任務">("開發任務");
const title = ref("");
const assignees = ref<string[]>([""]);
const priority = ref<Priority>("中");
const dueDate = ref("");
const submitting = ref(false);
const submitError = ref<string | null>(null);

watch(
  () => props.initialSpecId,
  (value) => {
    if (value) specId.value = value;
  },
);

function openForm() {
  showForm.value = true;
}

function addAssigneeRow() {
  assignees.value.push("");
}

function removeAssigneeRow(index: number) {
  assignees.value.splice(index, 1);
}

function resetForm() {
  specId.value = props.initialSpecId;
  type.value = "開發任務";
  title.value = "";
  assignees.value = [""];
  priority.value = "中";
  dueDate.value = "";
  submitError.value = null;
  showForm.value = false;
}

async function submit() {
  submitError.value = null;
  if (!specId.value || !title.value) {
    submitError.value = "請填寫所屬規格與標題";
    return;
  }
  const cleanAssignees: TaskAssignee[] = assignees.value
    .map((person) => person.trim())
    .filter((person) => person.length > 0)
    .map((person) => ({ person }));

  submitting.value = true;
  try {
    await createTask(props.apiBaseUrl, specId.value, {
      type: type.value,
      title: title.value,
      assignees: cleanAssignees,
      priority: priority.value,
      dueDate: dueDate.value || undefined,
    });
    resetForm();
    emit("created");
  } catch (e) {
    submitError.value = e instanceof Error ? e.message : "新增任務失敗";
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <div class="quick-add-task">
    <button type="button" class="trigger-btn" data-testid="quick-add-task-btn" @click="openForm">+ 新增任務</button>

    <Modal v-if="showForm" title="新增任務" @close="resetForm">
      <form data-testid="quick-add-task-form" @submit.prevent="submit">
        <label v-if="!initialSpecId" class="field">
          所屬規格
          <select v-model="specId" data-testid="quick-add-task-spec">
            <option value="">選擇規格</option>
            <option v-for="spec in specs" :key="spec.id" :value="spec.id">{{ spec.label }}</option>
          </select>
        </label>
        <select v-else v-model="specId" class="hidden-input" data-testid="quick-add-task-spec">
          <option v-for="spec in specs" :key="spec.id" :value="spec.id">{{ spec.label }}</option>
        </select>

        <label class="field">
          任務類型
          <select v-model="type" data-testid="quick-add-task-type">
            <option value="開發任務">開發任務</option>
            <option value="測試任務">測試任務</option>
          </select>
        </label>

        <label class="field">
          標題
          <input v-model="title" type="text" placeholder="例如：登入 API 開發" data-testid="quick-add-task-title" />
        </label>

        <div class="field">
          <span class="field-label">指派對象</span>
          <div class="assignees">
            <div v-for="(_, index) in assignees" :key="index" class="assignee-row">
              <select v-model="assignees[index]" :data-testid="`quick-add-task-assignee-${index}`">
                <option value="">選擇指派對象</option>
                <option v-for="account in accounts" :key="account.id" :value="account.name">
                  {{ account.name }}
                </option>
              </select>
              <button
                v-if="assignees.length > 1"
                type="button"
                class="icon-btn"
                :data-testid="`quick-add-task-remove-assignee-${index}`"
                @click="removeAssigneeRow(index)"
              >
                −
              </button>
            </div>
            <button type="button" class="btn-ghost btn-sm" data-testid="quick-add-task-add-assignee" @click="addAssigneeRow">
              + 新增指派對象
            </button>
          </div>
        </div>

        <label class="field">
          優先級
          <select v-model="priority" data-testid="quick-add-task-priority">
            <option value="高">高</option>
            <option value="中">中</option>
            <option value="低">低</option>
          </select>
        </label>

        <label class="field">
          到期日（選填）
          <input v-model="dueDate" type="date" data-testid="quick-add-task-duedate" />
        </label>

        <p v-if="submitError" class="form-error" data-testid="quick-add-task-error">{{ submitError }}</p>
        <div class="form-actions">
          <button type="button" class="btn-ghost" data-testid="quick-add-task-cancel" @click="resetForm">取消</button>
          <button type="submit" class="btn-primary" :disabled="submitting" data-testid="quick-add-task-submit">
            送出
          </button>
        </div>
      </form>
    </Modal>
  </div>
</template>

<style scoped>
.trigger-btn {
  border: 1px solid var(--primary);
  background: transparent;
  color: var(--primary);
  border-radius: var(--radius-sm);
  padding: 5px 12px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.12s ease;
}

.trigger-btn:hover {
  background: var(--primary-tint);
}

.hidden-input {
  display: none;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 5px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-dim);
  margin-bottom: 14px;
}

.field-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-dim);
}

.field input,
.field select {
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 8px 11px;
  font-size: 13px;
  background: var(--bg);
  color: var(--text);
  outline: none;
}

.field input:focus,
.field select:focus {
  border-color: var(--primary);
  box-shadow: var(--shadow-focus);
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
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 8px 11px;
  font-size: 13px;
  background: var(--bg);
  color: var(--text);
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

.btn-ghost {
  background: transparent;
  border: 1px solid var(--border);
  color: var(--text-dim);
  border-radius: var(--radius-sm);
  padding: 8px 14px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}

.btn-ghost:hover {
  border-color: var(--border-strong);
  color: var(--text);
}

.btn-ghost.btn-sm {
  padding: 6px 10px;
  font-size: 12px;
  align-self: flex-start;
}

.btn-primary {
  background: var(--primary);
  color: #fff;
  border: none;
  border-radius: var(--radius-sm);
  padding: 8px 14px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.12s ease;
}

.btn-primary:hover:not(:disabled) {
  background: var(--primary-hover);
}

.btn-primary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 4px;
}

.form-error {
  color: var(--danger);
  font-size: 12px;
  margin: -6px 0 12px;
}
</style>
