<script setup lang="ts">
import KanbanBoard from "./components/KanbanBoard.vue";

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "";
</script>

<template>
  <KanbanBoard :apiBaseUrl="apiBaseUrl" />
</template>
