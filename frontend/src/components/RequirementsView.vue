<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import {
  createRequirement,
  createSpec,
  fetchAccounts,
  fetchRequirements,
  setRequirementStatus,
  setSpecStatus,
  updateRequirement,
  updateSpec,
} from "../api/client";
import type { Account, RequirementWithSpecs, Spec } from "../types";
import EntityDetailModal from "./EntityDetailModal.vue";
import Modal from "./Modal.vue";
import QuickAddTask from "./QuickAddTask.vue";
import RichTextEditor from "./RichTextEditor.vue";

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
// 描述改為必填（見 CONTEXT 討論：只有標題看不出需求在做什麼）。
const showNewRequirement = ref(false);
const newTitle = ref("");
const newDescription = ref("");
const newDescriptionEditorRef = ref<InstanceType<typeof RichTextEditor>>();
const submitting = ref(false);
const submitError = ref<string | null>(null);

function openNewRequirement() {
  showNewRequirement.value = true;
}

function closeNewRequirement() {
  showNewRequirement.value = false;
  newTitle.value = "";
  newDescription.value = "";
  submitError.value = null;
}

async function submitNewRequirement() {
  submitError.value = null;
  if (!newTitle.value) {
    submitError.value = "請填寫標題";
    return;
  }
  if (newDescriptionEditorRef.value?.isEmpty !== false) {
    submitError.value = "請填寫描述";
    return;
  }
  submitting.value = true;
  try {
    await createRequirement(props.apiBaseUrl, newTitle.value, newDescription.value);
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
const newSpecDescription = ref("");
const newSpecDescriptionEditorRef = ref<InstanceType<typeof RichTextEditor>>();
const newSpecSubmitting = ref(false);
const newSpecError = ref<string | null>(null);

function openNewSpec(requirementId: string) {
  newSpecRequirementId.value = requirementId;
  newSpecTitle.value = "";
  newSpecDescription.value = "";
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
  if (newSpecDescriptionEditorRef.value?.isEmpty !== false) {
    newSpecError.value = "請填寫描述";
    return;
  }
  newSpecSubmitting.value = true;
  try {
    await createSpec(props.apiBaseUrl, newSpecRequirementId.value, newSpecTitle.value, newSpecDescription.value);
    closeNewSpec();
    await load();
  } catch (e) {
    newSpecError.value = e instanceof Error ? e.message : "新增規格失敗";
  } finally {
    newSpecSubmitting.value = false;
  }
}

// 完成/已取消的需求各自收合進獨立區塊，永久可查（不像看板任務只留當天，見 CONTEXT 討論）；
// 取消是軟刪除（ADR-0004），改回其他狀態即等於復原，不需要額外的復原限制。
// 規格完成與否只用狀態標籤呈現，不額外收合（規格本來就是巢狀的次要層級）。
const activeRequirements = computed(() =>
  requirements.value.filter((r) => r.status !== "完成" && r.status !== "已取消"),
);
const completedRequirements = computed(() => requirements.value.filter((r) => r.status === "完成"));
const cancelledRequirements = computed(() => requirements.value.filter((r) => r.status === "已取消"));
const showCompleted = ref(false);
const showCancelled = ref(false);

// 需求/規格詳情彈窗：點標題檢視完整描述（Markdown 渲染），並可在裡面編輯。
const detailTarget = ref<{ kind: "requirement" | "spec"; id: string } | null>(null);
const detailModalRef = ref<InstanceType<typeof EntityDetailModal>>();

function openRequirementDetail(requirementId: string) {
  detailTarget.value = { kind: "requirement", id: requirementId };
}

function openSpecDetail(specId: string) {
  detailTarget.value = { kind: "spec", id: specId };
}

const detailEntity = computed(() => {
  if (!detailTarget.value) return null;
  if (detailTarget.value.kind === "requirement") {
    return requirements.value.find((r) => r.id === detailTarget.value!.id) ?? null;
  }
  for (const requirement of requirements.value) {
    const spec: Spec | undefined = requirement.specs.find((s) => s.id === detailTarget.value!.id);
    if (spec) return spec;
  }
  return null;
});

async function saveDetail(payload: { title: string; description: string; status: RequirementWithSpecs["status"] }) {
  if (!detailTarget.value) return;
  const { title, description, status } = payload;
  try {
    if (detailTarget.value.kind === "requirement") {
      await updateRequirement(props.apiBaseUrl, detailTarget.value.id, { title, description });
      if (status !== detailEntity.value?.status) {
        await setRequirementStatus(props.apiBaseUrl, detailTarget.value.id, status);
      }
    } else {
      await updateSpec(props.apiBaseUrl, detailTarget.value.id, { title, description });
      if (status !== detailEntity.value?.status) {
        await setSpecStatus(props.apiBaseUrl, detailTarget.value.id, status);
      }
    }
    await load();
    detailModalRef.value?.stopEditing();
  } catch (e) {
    detailModalRef.value?.reportSaveError(e instanceof Error ? e.message : "儲存失敗");
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
        <label class="field">
          描述
          <RichTextEditor
            ref="newDescriptionEditorRef"
            v-model="newDescription"
            data-testid="new-requirement-description"
          />
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
        <label class="field">
          描述
          <RichTextEditor
            ref="newSpecDescriptionEditorRef"
            v-model="newSpecDescription"
            data-testid="new-spec-description"
          />
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

    <EntityDetailModal
      v-if="detailEntity && detailTarget"
      ref="detailModalRef"
      :modal-title="detailTarget.kind === 'requirement' ? '需求詳情' : '規格詳情'"
      :title="detailEntity.title"
      :description="detailEntity.description"
      :status="detailEntity.status"
      @close="detailTarget = null"
      @save="saveDetail"
    />

    <p v-if="loading" data-testid="requirements-loading">載入中…</p>
    <p v-else-if="error" data-testid="requirements-error">{{ error }}</p>
    <template v-else>
      <ul class="requirement-list" data-testid="requirement-list">
        <li
          v-for="requirement in activeRequirements"
          :key="requirement.id"
          class="requirement-row"
          :data-testid="`requirement-${requirement.id}`"
        >
          <button
            type="button"
            class="requirement-title"
            :data-testid="`requirement-title-${requirement.id}`"
            @click="openRequirementDetail(requirement.id)"
          >
            {{ requirement.title }}
          </button>
          <ul v-if="requirement.specs.length" class="spec-list">
            <li v-for="spec in requirement.specs" :key="spec.id" :data-testid="`spec-${spec.id}`">
              <div class="spec-row">
                <button
                  type="button"
                  class="spec-title"
                  :class="{ 'spec-done': spec.status === '完成' }"
                  :data-testid="`spec-title-${spec.id}`"
                  @click="openSpecDetail(spec.id)"
                >
                  <span v-if="spec.status === '完成'" class="spec-check">✓</span>
                  {{ spec.title }}
                </button>
                <span
                  v-if="spec.status !== '完成'"
                  class="spec-status-badge"
                  :data-testid="`spec-status-${spec.id}`"
                  >{{ spec.status }}</span
                >
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

      <div v-if="completedRequirements.length" class="completed-section">
        <button
          type="button"
          class="completed-toggle"
          data-testid="completed-requirements-toggle"
          @click="showCompleted = !showCompleted"
        >
          {{ showCompleted ? "▾" : "▸" }} 已完成需求（{{ completedRequirements.length }}）
        </button>
        <ul v-if="showCompleted" class="requirement-list" data-testid="completed-requirement-list">
          <li
            v-for="requirement in completedRequirements"
            :key="requirement.id"
            class="requirement-row requirement-row-done"
            :data-testid="`requirement-${requirement.id}`"
          >
            <button
              type="button"
              class="requirement-title"
              :data-testid="`requirement-title-${requirement.id}`"
              @click="openRequirementDetail(requirement.id)"
            >
              {{ requirement.title }}
            </button>
            <ul v-if="requirement.specs.length" class="spec-list">
              <li v-for="spec in requirement.specs" :key="spec.id" :data-testid="`spec-${spec.id}`">
                <div class="spec-row">
                  <button
                    type="button"
                    class="spec-title"
                    :class="{ 'spec-done': spec.status === '完成' }"
                    :data-testid="`spec-title-${spec.id}`"
                    @click="openSpecDetail(spec.id)"
                  >
                    <span v-if="spec.status === '完成'" class="spec-check">✓</span>
                    {{ spec.title }}
                  </button>
                </div>
              </li>
            </ul>
          </li>
        </ul>
      </div>

      <div v-if="cancelledRequirements.length" class="completed-section">
        <button
          type="button"
          class="completed-toggle"
          data-testid="cancelled-requirements-toggle"
          @click="showCancelled = !showCancelled"
        >
          {{ showCancelled ? "▾" : "▸" }} 已取消需求（{{ cancelledRequirements.length }}）
        </button>
        <ul v-if="showCancelled" class="requirement-list" data-testid="cancelled-requirement-list">
          <li
            v-for="requirement in cancelledRequirements"
            :key="requirement.id"
            class="requirement-row requirement-row-done"
            :data-testid="`requirement-${requirement.id}`"
          >
            <button
              type="button"
              class="requirement-title"
              :data-testid="`requirement-title-${requirement.id}`"
              @click="openRequirementDetail(requirement.id)"
            >
              {{ requirement.title }}
            </button>
            <ul v-if="requirement.specs.length" class="spec-list">
              <li v-for="spec in requirement.specs" :key="spec.id" :data-testid="`spec-${spec.id}`">
                <div class="spec-row">
                  <button
                    type="button"
                    class="spec-title"
                    :class="{ 'spec-done': spec.status === '完成' }"
                    :data-testid="`spec-title-${spec.id}`"
                    @click="openSpecDetail(spec.id)"
                  >
                    <span v-if="spec.status === '完成'" class="spec-check">✓</span>
                    {{ spec.title }}
                  </button>
                  <span
                    v-if="spec.status !== '完成'"
                    class="spec-status-badge"
                    :data-testid="`spec-status-${spec.id}`"
                    >{{ spec.status }}</span
                  >
                </div>
              </li>
            </ul>
          </li>
        </ul>
      </div>
    </template>
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
  font-family: inherit;
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
  background: none;
  border: none;
  padding: 0;
  font-size: inherit;
  cursor: pointer;
  text-align: left;
}

.requirement-title:hover {
  text-decoration: underline;
}

.requirement-row-done {
  opacity: 0.75;
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

.spec-title {
  background: none;
  border: none;
  padding: 0;
  font-size: inherit;
  color: inherit;
  cursor: pointer;
  font-family: inherit;
}

.spec-title:hover {
  text-decoration: underline;
}

.spec-title.spec-done {
  color: var(--text-faint);
  text-decoration: line-through;
}

.spec-check {
  color: var(--success, #16a34a);
  text-decoration: none;
  display: inline-block;
  margin-right: 2px;
}

.spec-status-badge {
  font-size: 11px;
  color: var(--text-faint);
  background: var(--surface-2);
  border-radius: var(--radius-sm);
  padding: 2px 7px;
}

.completed-section {
  margin-top: 6px;
}

.completed-toggle {
  background: none;
  border: none;
  color: var(--text-dim);
  font-size: 12.5px;
  font-weight: 600;
  cursor: pointer;
  padding: 6px 2px;
}

.completed-toggle:hover {
  color: var(--text);
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
