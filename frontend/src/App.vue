<script setup lang="ts">
import { ref } from "vue";
import KanbanBoard from "./components/KanbanBoard.vue";
import RequirementsView from "./components/RequirementsView.vue";

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "";

const activeView = ref<"board" | "requirements">("board");
</script>

<template>
  <div class="app-tabs">
    <button
      type="button"
      data-testid="view-tab-board"
      :class="{ active: activeView === 'board' }"
      @click="activeView = 'board'"
    >
      看板
    </button>
    <button
      type="button"
      data-testid="view-tab-requirements"
      :class="{ active: activeView === 'requirements' }"
      @click="activeView = 'requirements'"
    >
      需求/規格管理
    </button>
  </div>

  <!-- v-show（不是 v-if）保留看板元件狀態（身分/範圍/篩選），
       在兩個視圖之間切換不會重置這些選擇。 -->
  <KanbanBoard v-show="activeView === 'board'" :apiBaseUrl="apiBaseUrl" />
  <RequirementsView v-show="activeView === 'requirements'" :apiBaseUrl="apiBaseUrl" />
</template>

<style scoped>
.app-tabs {
  display: flex;
  gap: 4px;
  padding: 12px 20px 0;
  font-family:
    -apple-system,
    "Segoe UI",
    "PingFang TC",
    "Microsoft JhengHei",
    sans-serif;
}

.app-tabs button {
  border: 1px solid #e2e4e9;
  background: #fff;
  border-radius: 999px;
  padding: 4px 14px;
  font-size: 13px;
  cursor: pointer;
}

.app-tabs button.active {
  background: #3b5bfd;
  border-color: #3b5bfd;
  color: #fff;
}
</style>
