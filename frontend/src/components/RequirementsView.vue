<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import { createRequirement, createSpec, fetchAccounts, fetchRequirements } from "../api/client";
import type { Account, RequirementWithSpecs } from "../types";
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

const newTitle = ref("");
const submitting = ref(false);
const submitError = ref<string | null>(null);

// 每個需求各自獨立的「新增規格」表單狀態，用需求 id 當 key。
interface SpecFormState {
  show: boolean;
  title: string;
  submitting: boolean;
  error: string | null;
}
const specForms = reactive<Record<string, SpecFormState>>({});

function specForm(requirementId: string): SpecFormState {
  if (!specForms[requirementId]) {
    specForms[requirementId] = { show: false, title: "", submitting: false, error: null };
  }
  return specForms[requirementId];
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

async function submitNewRequirement() {
  submitError.value = null;
  if (!newTitle.value) {
    submitError.value = "請填寫標題";
    return;
  }
  submitting.value = true;
  try {
    await createRequirement(props.apiBaseUrl, newTitle.value);
    newTitle.value = "";
    await load();
  } catch (e) {
    submitError.value = e instanceof Error ? e.message : "新增需求失敗";
  } finally {
    submitting.value = false;
  }
}

async function submitNewSpec(requirementId: string) {
  const form = specForm(requirementId);
  form.error = null;
  if (!form.title) {
    form.error = "請填寫標題";
    return;
  }
  form.submitting = true;
  try {
    await createSpec(props.apiBaseUrl, requirementId, form.title);
    form.title = "";
    form.show = false;
    await load();
  } catch (e) {
    form.error = e instanceof Error ? e.message : "新增規格失敗";
  } finally {
    form.submitting = false;
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
    <h2>需求/規格管理</h2>

    <form v-if="isAdmin" class="add-form" data-testid="new-requirement-form" @submit.prevent="submitNewRequirement">
      <input
        v-model="newTitle"
        type="text"
        placeholder="新需求標題"
        data-testid="new-requirement-title"
      />
      <button type="submit" :disabled="submitting" data-testid="new-requirement-submit">+ 新增需求</button>
      <p v-if="submitError" data-testid="new-requirement-error">{{ submitError }}</p>
    </form>
    <p v-else class="readonly-note" data-testid="requirements-readonly-note">
      僅管理職可以新增需求、規格與任務；可以檢視進度、建立提醒與報工。
    </p>

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

        <template v-if="isAdmin">
          <button
            v-if="!specForm(requirement.id).show"
            type="button"
            :data-testid="`new-spec-btn-${requirement.id}`"
            @click="specForm(requirement.id).show = true"
          >
            + 新增規格
          </button>
          <form
            v-else
            class="add-form"
            :data-testid="`new-spec-form-${requirement.id}`"
            @submit.prevent="submitNewSpec(requirement.id)"
          >
            <input
              v-model="specForm(requirement.id).title"
              type="text"
              placeholder="新規格標題"
              :data-testid="`new-spec-title-${requirement.id}`"
            />
            <button
              type="submit"
              :disabled="specForm(requirement.id).submitting"
              :data-testid="`new-spec-submit-${requirement.id}`"
            >
              送出
            </button>
            <button type="button" @click="specForm(requirement.id).show = false">取消</button>
            <p v-if="specForm(requirement.id).error" :data-testid="`new-spec-error-${requirement.id}`">
              {{ specForm(requirement.id).error }}
            </p>
          </form>
        </template>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.requirements-view {
  padding: 20px;
  font-family:
    -apple-system,
    "Segoe UI",
    "PingFang TC",
    "Microsoft JhengHei",
    sans-serif;
  font-size: 13px;
}

.requirements-view h2 {
  font-size: 15px;
  margin: 0 0 12px;
}

.add-form {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-bottom: 16px;
}

.add-form input {
  border: 1px solid #e2e4e9;
  border-radius: 6px;
  padding: 4px 8px;
  font-size: 13px;
}

.add-form button {
  background: #3b5bfd;
  color: #fff;
  border: none;
  border-radius: 6px;
  padding: 4px 12px;
  cursor: pointer;
}

[data-testid="new-requirement-error"] {
  color: #b3261e;
  font-size: 12px;
  margin: 0;
}

.readonly-note {
  background: #f5f6f8;
  border: 1px dashed #cbd5e1;
  border-radius: 8px;
  padding: 10px 14px;
  color: #6b7280;
  margin-bottom: 16px;
}

.requirement-list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.requirement-row {
  background: #f5f6f8;
  border: 1px solid #e2e4e9;
  border-radius: 10px;
  padding: 10px 14px;
  margin-bottom: 10px;
}

.requirement-title {
  font-weight: 600;
}

.spec-list {
  list-style: none;
  margin: 6px 0 0;
  padding: 0 0 0 12px;
  color: #6b7280;
}

.spec-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.requirement-row > button,
.requirement-row > .add-form {
  margin-top: 8px;
}

[data-testid^="new-spec-btn-"] {
  border: 1px solid #3b5bfd;
  background: transparent;
  color: #3b5bfd;
  border-radius: 6px;
  padding: 4px 10px;
  font-size: 12px;
  cursor: pointer;
}
</style>
