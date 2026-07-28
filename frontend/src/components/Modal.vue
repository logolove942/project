<script setup lang="ts">
import { onMounted, onUnmounted } from "vue";

defineProps<{ title: string }>();
const emit = defineEmits<{ close: [] }>();

// Esc 視為取消，跟按鈕行為一致；點擊背景遮罩刻意不關閉——這些都是填資料的
// 表單，防止誤觸遺失輸入內容比「點哪都能關」的便利性重要（見 CONTEXT 討論）。
function onKeydown(e: KeyboardEvent) {
  if (e.key === "Escape") emit("close");
}

onMounted(() => window.addEventListener("keydown", onKeydown));
onUnmounted(() => window.removeEventListener("keydown", onKeydown));
</script>

<template>
  <Teleport to="body">
    <div class="modal-backdrop" data-testid="modal-backdrop">
      <div class="modal-card" role="dialog" aria-modal="true" :aria-label="title">
        <div class="modal-header">
          <h2>{{ title }}</h2>
          <button type="button" class="modal-close" data-testid="modal-close" @click="emit('close')">✕</button>
        </div>
        <div class="modal-body">
          <slot />
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.45);
  backdrop-filter: blur(2px);
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

.modal-card {
  width: 420px;
  max-width: 100%;
  max-height: 90vh;
  overflow-y: auto;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  padding: 20px 22px;
  animation: modal-in 0.15s ease;
}

@keyframes modal-in {
  from {
    transform: translateY(8px);
    opacity: 0;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14px;
  gap: 10px;
}

.modal-header h2 {
  font-size: 15px;
  font-weight: 700;
  margin: 0;
  color: var(--text);
}

.modal-close {
  border: none;
  background: var(--surface-2);
  color: var(--text-dim);
  width: 26px;
  height: 26px;
  border-radius: 50%;
  cursor: pointer;
  font-size: 13px;
  flex-shrink: 0;
}

.modal-close:hover {
  background: var(--danger-tint);
  color: var(--danger);
}

.modal-body {
  font-size: 13px;
  color: var(--text);
}
</style>
