<script setup lang="ts">
import { ref, watch } from "vue";
import { createTask } from "../api/client";
import type { Priority, TaskAssignee } from "../types";

const props = withDefaults(
  defineProps<{
    apiBaseUrl: string;
    specs: { id: string; label: string }[];
    initialSpecId?: string;
    startOpen?: boolean;
  }>(),
  { initialSpecId: "", startOpen: false },
);
const emit = defineEmits<{ created: [] }>();

const showForm = ref(props.startOpen);
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
  showForm.value = props.startOpen;
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
    <button v-if="!showForm" type="button" data-testid="quick-add-task-btn" @click="openForm">
      + 新增任務
    </button>
    <form v-else class="add-form" data-testid="quick-add-task-form" @submit.prevent="submit">
      <select v-model="specId" data-testid="quick-add-task-spec">
        <option value="">選擇規格</option>
        <option v-for="spec in specs" :key="spec.id" :value="spec.id">{{ spec.label }}</option>
      </select>
      <select v-model="type" data-testid="quick-add-task-type">
        <option value="開發任務">開發任務</option>
        <option value="測試任務">測試任務</option>
      </select>
      <input v-model="title" type="text" placeholder="標題" data-testid="quick-add-task-title" />

      <div class="assignees">
        <div v-for="(_, index) in assignees" :key="index" class="assignee-row">
          <input
            v-model="assignees[index]"
            type="text"
            placeholder="指派對象"
            :data-testid="`quick-add-task-assignee-${index}`"
          />
          <button
            v-if="assignees.length > 1"
            type="button"
            :data-testid="`quick-add-task-remove-assignee-${index}`"
            @click="removeAssigneeRow(index)"
          >
            −
          </button>
        </div>
        <button type="button" data-testid="quick-add-task-add-assignee" @click="addAssigneeRow">
          + 新增指派對象
        </button>
      </div>

      <select v-model="priority" data-testid="quick-add-task-priority">
        <option value="高">高</option>
        <option value="中">中</option>
        <option value="低">低</option>
      </select>
      <input v-model="dueDate" type="date" data-testid="quick-add-task-duedate" />

      <div class="form-actions">
        <button type="submit" :disabled="submitting" data-testid="quick-add-task-submit">送出</button>
        <button type="button" data-testid="quick-add-task-cancel" @click="resetForm">取消</button>
      </div>
      <p v-if="submitError" data-testid="quick-add-task-error">{{ submitError }}</p>
    </form>
  </div>
</template>

<style scoped>
.quick-add-task button[data-testid="quick-add-task-btn"] {
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
  align-items: flex-start;
}

.add-form input,
.add-form select {
  border: 1px solid #e2e4e9;
  border-radius: 6px;
  padding: 4px 8px;
  font-size: 13px;
}

.assignees {
  display: flex;
  flex-direction: column;
  gap: 4px;
  width: 100%;
}

.assignee-row {
  display: flex;
  gap: 4px;
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

[data-testid="quick-add-task-error"] {
  color: #b3261e;
  font-size: 12px;
  width: 100%;
  margin: 0;
}
</style>
