<script setup lang="ts">
import { ref } from "vue";
import { createReminder } from "../api/client";
import type { Account, Priority } from "../types";

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
    <button v-if="!showForm" type="button" data-testid="quick-add-reminder-btn" @click="openForm">
      + 新增提醒/雜事
    </button>
    <form v-else class="add-form" data-testid="quick-add-reminder-form" @submit.prevent="submit">
      <input v-model="title" type="text" placeholder="標題" data-testid="quick-add-reminder-title" />
      <select v-model="assignedTo" data-testid="quick-add-reminder-assignee">
        <option v-for="account in accounts" :key="account.id" :value="account.name">
          {{ account.name }}
        </option>
      </select>
      <select v-model="specId" data-testid="quick-add-reminder-spec">
        <option value="">未關聯規格</option>
        <option v-for="spec in specs" :key="spec.id" :value="spec.id">{{ spec.label }}</option>
      </select>
      <select v-model="priority" data-testid="quick-add-reminder-priority">
        <option value="高">高</option>
        <option value="中">中</option>
        <option value="低">低</option>
      </select>
      <input v-model="dueDate" type="date" data-testid="quick-add-reminder-duedate" />
      <div class="form-actions">
        <button type="submit" :disabled="submitting" data-testid="quick-add-reminder-submit">送出</button>
        <button type="button" data-testid="quick-add-reminder-cancel" @click="resetForm">取消</button>
      </div>
      <p v-if="submitError" data-testid="quick-add-reminder-error">{{ submitError }}</p>
    </form>
  </div>
</template>

<style scoped>
.quick-add-reminder button[data-testid="quick-add-reminder-btn"] {
  border: 1px solid #3b5bfd;
  background: transparent;
  color: #3b5bfd;
  border-radius: 6px;
  padding: 4px 10px;
  font-size: 12px;
  cursor: pointer;
}

.add-form {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
}

.add-form input,
.add-form select {
  border: 1px solid #e2e4e9;
  border-radius: 6px;
  padding: 4px 8px;
  font-size: 13px;
}

.form-actions {
  display: flex;
  gap: 6px;
}

.form-actions button[type="submit"] {
  background: #3b5bfd;
  color: #fff;
  border: none;
  border-radius: 6px;
  padding: 4px 12px;
  cursor: pointer;
}

.form-actions button[type="button"] {
  background: transparent;
  border: 1px solid #e2e4e9;
  border-radius: 6px;
  padding: 4px 12px;
  cursor: pointer;
}

[data-testid="quick-add-reminder-error"] {
  color: #b3261e;
  font-size: 12px;
  width: 100%;
  margin: 0;
}
</style>
