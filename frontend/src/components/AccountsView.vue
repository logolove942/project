<script setup lang="ts">
import { onMounted, ref } from "vue";
import { fetchAccounts, promoteAccount } from "../api/client";
import { avatarColor, initials } from "../avatarUtils";
import type { Account } from "../types";

const props = defineProps<{ apiBaseUrl: string }>();

const accounts = ref<Account[]>([]);
const loading = ref(true);
const error = ref<string | null>(null);
const promotingId = ref<string | null>(null);
const promoteError = ref<string | null>(null);

async function load() {
  loading.value = true;
  error.value = null;
  try {
    accounts.value = await fetchAccounts(props.apiBaseUrl);
  } catch (e) {
    error.value = e instanceof Error ? e.message : "載入帳號清單失敗";
  } finally {
    loading.value = false;
  }
}

async function promote(id: string) {
  promoteError.value = null;
  promotingId.value = id;
  try {
    await promoteAccount(props.apiBaseUrl, id);
    await load();
  } catch (e) {
    promoteError.value = e instanceof Error ? e.message : "升級為管理職失敗";
  } finally {
    promotingId.value = null;
  }
}

onMounted(load);
</script>

<template>
  <div class="accounts-view" data-testid="accounts-view">
    <h2>帳號管理</h2>
    <p v-if="loading" data-testid="accounts-loading">載入中…</p>
    <p v-else-if="error" data-testid="accounts-error">{{ error }}</p>
    <ul v-else class="account-list" data-testid="account-list">
      <li v-for="account in accounts" :key="account.id" :data-testid="`account-${account.id}`">
        <span class="avatar" :style="{ background: avatarColor(account.name) }">{{ initials(account.name) }}</span>
        <span class="account-name">{{ account.name }}</span>
        <span class="role-badge" :class="{ admin: account.role === '管理職' }">{{ account.role }}</span>
        <button
          v-if="account.role === '一般同仁'"
          type="button"
          :disabled="promotingId === account.id"
          :data-testid="`promote-${account.id}`"
          @click="promote(account.id)"
        >
          升級為管理職
        </button>
      </li>
    </ul>
    <p v-if="promoteError" data-testid="promote-account-error">{{ promoteError }}</p>
  </div>
</template>

<style scoped>
.accounts-view {
  padding: 20px 0;
  font-size: 13px;
}

.accounts-view h2 {
  font-size: 16px;
  font-weight: 700;
  margin: 0 0 14px;
  color: var(--text);
}

.account-list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.account-list li {
  display: flex;
  align-items: center;
  gap: 10px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: 10px 14px;
  margin-bottom: 8px;
  box-shadow: var(--shadow-sm);
  transition:
    border-color 0.12s ease,
    box-shadow 0.12s ease;
}

.account-list li:hover {
  border-color: var(--border-strong);
  box-shadow: var(--shadow-md);
}

.avatar {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 700;
  color: #ffffff;
}

.account-name {
  font-weight: 600;
  flex: 1;
  color: var(--text);
}

.role-badge {
  font-size: 11px;
  font-weight: 700;
  background: var(--slate-tint);
  border-radius: var(--radius-pill);
  padding: 2px 10px;
  color: var(--slate);
}

.role-badge.admin {
  background: var(--primary-tint);
  color: var(--primary);
}

.account-list button {
  border: 1px solid var(--primary);
  background: transparent;
  color: var(--primary);
  border-radius: var(--radius-sm);
  padding: 5px 12px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.12s ease;
}

.account-list button:hover:not(:disabled) {
  background: var(--primary);
  color: #fff;
}

.account-list button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

[data-testid="promote-account-error"] {
  color: var(--danger);
  font-size: 12px;
}
</style>
