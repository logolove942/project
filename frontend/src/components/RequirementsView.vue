<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { createRequirement, createSpec, fetchAccounts, fetchRequirements } from "../api/client";
import type { Account, RequirementWithSpecs } from "../types";
import Modal from "./Modal.vue";
import QuickAddTask from "./QuickAddTask.vue";

const props = defineProps<{ apiBaseUrl: string; currentAccount: Account }>();

// issue #51：需求/規格/任務的建立動作僅限管理職——後端本身已經會擋 403，
// 這裡只是避免非管理職看到一個註定失敗的按鈕。
const isAdmin = computed(() => props.currentAccount.role === "管理職");

const requirements = ref<RequirementWithSpecs[]>([]);
const loading = ref(true);
const error = ref<string | null>(null);
const accountOptions = ref<Account[]>([]);

async function loadAccountOptions() {
  try {
    accountOptions.value = await fetchAccounts(props.apiBaseUrl);
  } catch {
    // 帳號清單載入失敗不影響需求/規格檢視，QuickAddTask 的指派下拉會顯示空清單。
  }
}

async function load() {
  loading.value = true;
  error.value = null;
  try {
    requirements.value = await fetchRequirements(props.apiBaseUrl);
  } catch (e) {
    error.value = e instanceof Error ? e.message : "載入需求清單失敗";
  } finally {
    loading.value = false;
  }
}

// 新增需求：彈窗表單（issue：新增動作改用彈窗，操作比行內展開表單更明確）。
const showNewRequirement = ref(false);
const newTitle = ref("");
const submitting = ref(false);
const submitError = ref<string | null>(null);

function openNewRequirement() {
  showNewRequirement.value = true;
}

function closeNewRequirement() {
  showNewRequirement.value = false;
  newTitle.value = "";
  submitError.value = null;
}

async function submitNewRequirement() {
  submitError.value = null;
  if (!newTitle.value) {
    submitError.value = "請填寫標題";
    return;
  }
  submitting.value = true;
  try {
    await createRequirement(props.apiBaseUrl, newTitle.value);
    closeNewRequirement();
    await load();
  } catch (e) {
    submitError.value = e instanceof Error ? e.message : "新增需求失敗";
  } finally {
    submitting.value = false;
  }
}

// 新增規格：彈窗會自動帶入是在哪個需求底下開的（情境預選），不用再選一次需求。
const newSpecRequirementId = ref<string | null>(null);
const newSpecTitle = ref("");
const newSpecSubmitting = ref(false);
const newSpecError = ref<string | null>(null);

function openNewSpec(requirementId: string) {
  newSpecRequirementId.value = requirementId;
  newSpecTitle.value = "";
  newSpecError.value = null;
}

function closeNewSpec() {
  newSpecRequirementId.value = null;
}

async function submitNewSpec() {
  if (!newSpecRequirementId.value) return;
  newSpecError.value = null;
  if (!newSpecTitle.value) {
    newSpecError.value = "請填寫標題";
    return;
  }
  newSpecSubmitting.value = true;
  try {
    await createSpec(props.apiBaseUrl, newSpecRequirementId.value, newSpecTitle.value);
    closeNewSpec();
    await load();
  } catch (e) {
    newSpecError.value = e instanceof Error ? e.message : "新增規格失敗";
  } finally {
    newSpecSubmitting.value = false;
  }
}

// 需求/規格管理頁不列出任務，只需要在新增任務成功後重新整理該需求的規格清單
// （SpecWithTasks 底下的 tasks 目前沒有用到，但重新載入能確保之後若顯示任務數量會是最新的）。
function onTaskCreated() {
  load();
}

onMounted(load);
onMounted(loadAccountOptions);

defineExpose({ reload: load });
</script>

<template>
  <div class="requirements-view" data-testid="requirements-view">
    <div class="view-header">
      <h2>需求/規格管理</h2>
      <button v-if="isAdmin" type="button" class="btn-primary" data-testid="new-requirement-btn" @click="openNewRequirement">
        + 新增需求
      </button>
    </div>
    <p v-if="!isAdmin" class="readonly-note" data-testid="requirements-readonly-note">
      僅管理職可以新增需求、規格與任務；可以檢視進度、建立提醒與報工。
    </p>

    <Modal v-if="showNewRequirement" title="新增需求" @close="closeNewRequirement">
      <form data-testid="new-requirement-form" @submit.prevent="submitNewRequirement">
        <label class="field">
          標題
          <input v-model="newTitle" type="text" placeholder="新需求標題" data-testid="new-requirement-title" />
        </label>
        <p v-if="submitError" class="form-error" data-testid="new-requirement-error">{{ submitError }}</p>
        <div class="form-actions">
          <button type="button" class="btn-ghost" @click="closeNewRequirement">取消</button>
          <button type="submit" class="btn-primary" :disabled="submitting" data-testid="new-requirement-submit">
            送出
          </button>
        </div>
      </form>
    </Modal>

    <Modal v-if="newSpecRequirementId" title="新增規格" @close="closeNewSpec">
      <form data-testid="new-spec-form" @submit.prevent="submitNewSpec">
        <label class="field">
          標題
          <input v-model="newSpecTitle" type="text" placeholder="新規格標題" data-testid="new-spec-title" />
        </label>
        <p v-if="newSpecError" class="form-error" data-testid="new-spec-error">{{ newSpecError }}</p>
        <div class="form-actions">
          <button type="button" class="btn-ghost" data-testid="new-spec-cancel" @click="closeNewSpec">取消</button>
          <button type="submit" class="btn-primary" :disabled="newSpecSubmitting" data-testid="new-spec-submit">
            送出
          </button>
        </div>
      </form>
    </Modal>

    <p v-if="loading" data-testid="requirements-loading">載入中…</p>
    <p v-else-if="error" data-testid="requirements-error">{{ error }}</p>
    <ul v-else class="requirement-list" data-testid="requirement-list">
      <li
        v-for="requirement in requirements"
        :key="requirement.id"
        class="requirement-row"
        :data-testid="`requirement-${requirement.id}`"
      >
        <div class="requirement-title">{{ requirement.title }}</div>
        <ul v-if="requirement.specs.length" class="spec-list">
          <li v-for="spec in requirement.specs" :key="spec.id" :data-testid="`spec-${spec.id}`">
            <div class="spec-row">
              <span>{{ spec.title }}</span>
              <QuickAddTask
                v-if="isAdmin"
                :api-base-url="apiBaseUrl"
                :specs="[{ id: spec.id, label: spec.title }]"
                :accounts="accountOptions"
                :initial-spec-id="spec.id"
                @created="onTaskCreated"
              />
            </div>
          </li>
        </ul>

        <button
          v-if="isAdmin"
          type="button"
          class="add-inline-btn"
          :data-testid="`new-spec-btn-${requirement.id}`"
          @click="openNewSpec(requirement.id)"
        >
          + 新增規格
        </button>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.requirements-view {
  padding: 20px 0;
  font-size: 13px;
}

.view-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14px;
}

.requirements-view h2 {
  font-size: 16px;
  font-weight: 700;
  margin: 0;
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

.field {
  display: flex;
  flex-direction: column;
  gap: 5px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-dim);
  margin-bottom: 14px;
}

.field input {
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 8px 11px;
  font-size: 13px;
  background: var(--bg);
  color: var(--text);
  outline: none;
}

.field input:focus {
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

.readonly-note {
  background: var(--surface-2);
  border: 1px dashed var(--border-strong);
  border-radius: var(--radius-md);
  padding: 10px 14px;
  color: var(--text-dim);
  margin-bottom: 16px;
}

.requirement-list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.requirement-row {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: 12px 16px;
  margin-bottom: 10px;
  box-shadow: var(--shadow-sm);
}

.requirement-title {
  font-weight: 700;
  color: var(--text);
}

.spec-list {
  list-style: none;
  margin: 8px 0 0;
  padding: 0;
  color: var(--text-dim);
}

.spec-list li {
  padding: 6px 0;
  border-top: 1px solid var(--border);
}

.spec-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.add-inline-btn {
  border: 1px dashed var(--border-strong);
  background: transparent;
  color: var(--primary);
  font-size: 12px;
  font-weight: 600;
  padding: 6px 12px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  margin-top: 10px;
}

.add-inline-btn:hover {
  background: var(--primary-tint);
}
</style>
