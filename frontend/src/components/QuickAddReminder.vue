<script setup lang="ts">
import { ref } from "vue";
import { createReminder } from "../api/client";
import type { Account, Priority } from "../types";
import Modal from "./Modal.vue";

const props = defineProps<{
  apiBaseUrl: string;
  viewerName: string;
  specs: { id: string; label: string }[];
  accounts: Account[];
}>();
const emit = defineEmits<{ created: [] }>();

const showForm = ref(false);
const title = ref("");
const assignedTo = ref(props.viewerName);
const specId = ref("");
const priority = ref<Priority>("中");
const dueDate = ref("");
const submitting = ref(false);
const submitError = ref<string | null>(null);

function openForm() {
  // 每次打開都預設指派給目前的 viewer，符合「個人雜事＝自己建給自己」的預設情境。
  assignedTo.value = props.viewerName;
  showForm.value = true;
}

function resetForm() {
  title.value = "";
  specId.value = "";
  priority.value = "中";
  dueDate.value = "";
  submitError.value = null;
  showForm.value = false;
}

async function submit() {
  submitError.value = null;
  if (!title.value || !assignedTo.value) {
    submitError.value = "請填寫標題與對象";
    return;
  }
  submitting.value = true;
  try {
    await createReminder(props.apiBaseUrl, {
      createdBy: props.viewerName,
      assignedTo: assignedTo.value,
      title: title.value,
      specId: specId.value || undefined,
      priority: priority.value,
      dueDate: dueDate.value || undefined,
    });
    resetForm();
    emit("created");
  } catch (e) {
    submitError.value = e instanceof Error ? e.message : "新增提醒失敗";
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <div class="quick-add-reminder">
    <button type="button" class="trigger-btn" data-testid="quick-add-reminder-btn" @click="openForm">
      + 新增提醒/雜事
    </button>

    <Modal v-if="showForm" title="新增提醒" @close="resetForm">
      <form data-testid="quick-add-reminder-form" @submit.prevent="submit">
        <label class="field">
          標題
          <input v-model="title" type="text" placeholder="例如：幫忙確認測試環境" data-testid="quick-add-reminder-title" />
        </label>
        <label class="field">
          對象
          <select v-model="assignedTo" data-testid="quick-add-reminder-assignee">
            <option v-for="account in accounts" :key="account.id" :value="account.name">
              {{ account.name }}
            </option>
          </select>
        </label>
        <label class="field">
          關聯規格（選填）
          <select v-model="specId" data-testid="quick-add-reminder-spec">
            <option value="">未關聯規格</option>
            <option v-for="spec in specs" :key="spec.id" :value="spec.id">{{ spec.label }}</option>
          </select>
        </label>
        <label class="field">
          優先級
          <select v-model="priority" data-testid="quick-add-reminder-priority">
            <option value="高">高</option>
            <option value="中">中</option>
            <option value="低">低</option>
          </select>
        </label>
        <label class="field">
          到期日（選填）
          <input v-model="dueDate" type="date" data-testid="quick-add-reminder-duedate" />
        </label>

        <p v-if="submitError" class="form-error" data-testid="quick-add-reminder-error">{{ submitError }}</p>
        <div class="form-actions">
          <button type="button" class="btn-ghost" data-testid="quick-add-reminder-cancel" @click="resetForm">
            取消
          </button>
          <button type="submit" class="btn-primary" :disabled="submitting" data-testid="quick-add-reminder-submit">
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

.field {
  display: flex;
  flex-direction: column;
  gap: 5px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-dim);
  margin-bottom: 14px;
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

.form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 4px;
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

.form-error {
  color: var(--danger);
  font-size: 12px;
  margin: -6px 0 12px;
}
</style>
