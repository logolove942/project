<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { renderMarkdown } from "../markdown";
import type { TaskStatus } from "../types";
import Modal from "./Modal.vue";

const STATUS_OPTIONS: TaskStatus[] = ["待處理", "進行中", "暫停", "完成"];

// 需求/規格共用的詳情彈窗：檢視完整描述（Markdown 渲染）＋編輯標題/描述/狀態。
// 建立限管理職，但編輯開放給任何登入帳號（見 CONTEXT 討論），所以這裡不做角色判斷。
const props = defineProps<{
  modalTitle: string;
  title: string;
  description: string;
  status: TaskStatus;
}>();
const emit = defineEmits<{
  close: [];
  save: [{ title: string; description: string; status: TaskStatus }];
}>();

const editing = ref(false);
const draftTitle = ref(props.title);
const draftDescription = ref(props.description);
const draftStatus = ref(props.status);
const saveError = ref<string | null>(null);
const saving = ref(false);

// 換了不同的需求/規格（切換檢視對象）時，重置編輯狀態，不要沿用上一筆的草稿。
watch(
  () => [props.title, props.description, props.status],
  () => {
    editing.value = false;
    draftTitle.value = props.title;
    draftDescription.value = props.description;
    draftStatus.value = props.status;
    saveError.value = null;
  },
);

const rendered = computed(() => renderMarkdown(props.description));

function startEdit() {
  draftTitle.value = props.title;
  draftDescription.value = props.description;
  draftStatus.value = props.status;
  saveError.value = null;
  editing.value = true;
}

function cancelEdit() {
  editing.value = false;
  saveError.value = null;
}

async function submitEdit() {
  saveError.value = null;
  if (!draftTitle.value.trim() || !draftDescription.value.trim()) {
    saveError.value = "請填寫標題與描述";
    return;
  }
  saving.value = true;
  try {
    emit("save", { title: draftTitle.value, description: draftDescription.value, status: draftStatus.value });
  } finally {
    saving.value = false;
  }
}

defineExpose({ reportSaveError: (message: string) => (saveError.value = message), stopEditing: () => (editing.value = false) });
</script>

<template>
  <Modal :title="modalTitle" data-testid="entity-detail-modal" @close="emit('close')">
    <template v-if="!editing">
      <div class="title-row">
        <h3 class="entity-title" data-testid="entity-detail-title">{{ title }}</h3>
        <span class="status-badge" data-testid="entity-detail-status">{{ status }}</span>
      </div>
      <div class="entity-description" data-testid="entity-detail-description" v-html="rendered"></div>
      <div class="form-actions">
        <button type="button" class="btn-primary" data-testid="entity-detail-edit-btn" @click="startEdit">
          編輯
        </button>
      </div>
    </template>
    <form v-else data-testid="entity-detail-edit-form" @submit.prevent="submitEdit">
      <label class="field">
        標題
        <input v-model="draftTitle" type="text" data-testid="entity-detail-edit-title" />
      </label>
      <label class="field">
        描述（支援 Markdown：**粗體**、[文字](網址)、![說明](網址)）
        <textarea
          v-model="draftDescription"
          rows="6"
          data-testid="entity-detail-edit-description"
        ></textarea>
      </label>
      <label class="field">
        狀態
        <select v-model="draftStatus" data-testid="entity-detail-edit-status">
          <option v-for="option in STATUS_OPTIONS" :key="option" :value="option">{{ option }}</option>
        </select>
      </label>
      <p v-if="saveError" class="form-error" data-testid="entity-detail-edit-error">{{ saveError }}</p>
      <div class="form-actions">
        <button type="button" class="btn-ghost" data-testid="entity-detail-edit-cancel" @click="cancelEdit">
          取消
        </button>
        <button type="submit" class="btn-primary" :disabled="saving" data-testid="entity-detail-edit-submit">
          儲存
        </button>
      </div>
    </form>
  </Modal>
</template>

<style scoped>
.title-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
}

.entity-title {
  font-size: 15px;
  font-weight: 700;
  margin: 0;
  color: var(--text);
}

.status-badge {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-dim);
  background: var(--surface-2);
  border-radius: var(--radius-sm);
  padding: 2px 9px;
}

.entity-description {
  font-size: 13px;
  color: var(--text-dim);
  line-height: 1.6;
  word-break: break-word;
}

.entity-description :deep(p) {
  margin: 0 0 10px;
}

.entity-description :deep(p:last-child) {
  margin-bottom: 0;
}

.entity-description :deep(img) {
  max-width: 100%;
  border-radius: var(--radius-sm);
  margin: 6px 0;
}

.entity-description :deep(a) {
  color: var(--primary);
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
.field textarea,
.field select {
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 8px 11px;
  font-size: 13px;
  background: var(--bg);
  color: var(--text);
  outline: none;
  font-family: inherit;
  resize: vertical;
}

.field input:focus,
.field textarea:focus,
.field select:focus {
  border-color: var(--primary);
  box-shadow: var(--shadow-focus);
}

.form-error {
  color: var(--danger);
  font-size: 12px;
  margin: -6px 0 12px;
}

.form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
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
}

.btn-primary:hover:not(:disabled) {
  background: var(--primary-hover);
}

.btn-primary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
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
</style>
