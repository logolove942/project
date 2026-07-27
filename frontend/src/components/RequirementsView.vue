<script setup lang="ts">
import { onMounted, reactive, ref } from "vue";
import { createRequirement, createSpec, fetchRequirements } from "../api/client";
import type { RequirementWithSpecs } from "../types";
import QuickAddTask from "./QuickAddTask.vue";

const props = defineProps<{ apiBaseUrl: string }>();

const requirements = ref<RequirementWithSpecs[]>([]);
const loading = ref(true);
const error = ref<string | null>(null);

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

defineExpose({ reload: load });
</script>

<template>
  <div class="requirements-view" data-testid="requirements-view">
    <h2>需求/規格管理</h2>

    <form class="add-form" data-testid="new-requirement-form" @submit.prevent="submitNewRequirement">
      <input
        v-model="newTitle"
        type="text"
        placeholder="新需求標題"
        data-testid="new-requirement-title"
      />
      <button type="submit" :disabled="submitting" data-testid="new-requirement-submit">+ 新增需求</button>
      <p v-if="submitError" data-testid="new-requirement-error">{{ submitError }}</p>
    </form>

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
                :api-base-url="apiBaseUrl"
                :specs="[{ id: spec.id, label: spec.title }]"
                :initial-spec-id="spec.id"
                @created="onTaskCreated"
              />
            </div>
          </li>
        </ul>

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
