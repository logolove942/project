<script setup lang="ts">
import { onMounted, ref } from "vue";
import { fetchAccounts, promoteAccount } from "../api/client";
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
        <span class="account-name">{{ account.name }}</span>
        <span class="role-badge">{{ account.role }}</span>
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
  padding: 20px;
  font-family:
    -apple-system,
    "Segoe UI",
    "PingFang TC",
    "Microsoft JhengHei",
    sans-serif;
  font-size: 13px;
}

.accounts-view h2 {
  font-size: 15px;
  margin: 0 0 12px;
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
  background: #f5f6f8;
  border: 1px solid #e2e4e9;
  border-radius: 10px;
  padding: 8px 14px;
  margin-bottom: 8px;
}

.account-name {
  font-weight: 600;
  flex: 1;
}

.role-badge {
  font-size: 11px;
  border: 1px solid #e2e4e9;
  border-radius: 999px;
  padding: 1px 8px;
  color: #6b7280;
}

.account-list button {
  border: 1px solid #3b5bfd;
  background: transparent;
  color: #3b5bfd;
  border-radius: 6px;
  padding: 4px 10px;
  font-size: 12px;
  cursor: pointer;
}

[data-testid="promote-account-error"] {
  color: #b3261e;
  font-size: 12px;
}
</style>
