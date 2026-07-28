<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { clearToken, fetchAccounts, getToken, logout as apiLogout, setToken } from "./api/client";
import { avatarColor, initials } from "./avatarUtils";
import KanbanBoard from "./components/KanbanBoard.vue";
import LoginView from "./components/LoginView.vue";
import RequirementsView from "./components/RequirementsView.vue";
import AccountsView from "./components/AccountsView.vue";
import type { Account } from "./types";

// apiBaseUrl 可用 prop 覆蓋（測試用真的 Express server），預設沿用建置時的環境變數。
const props = withDefaults(defineProps<{ apiBaseUrl?: string }>(), {});
const apiBaseUrl = props.apiBaseUrl ?? import.meta.env.VITE_API_BASE_URL ?? "";

const activeView = ref<"board" | "requirements" | "accounts">("board");
const currentAccount = ref<Account | null>(null);
const checkingSession = ref(true);

const isAdmin = computed(() => currentAccount.value?.role === "管理職");

const ACCOUNT_ID_STORAGE_KEY = "task-reminder:accountId";

// 重新整理頁面後，只要 localStorage 的 token 還有效就直接回到看板，不用重新登入（issue #48）。
// GET /accounts 本來就會用到，順便拿它來驗證 token 是否仍然有效，同時抓到最新的角色
// （萬一在別的分頁被升級為管理職，重新整理後也能反映）。
onMounted(async () => {
  const token = getToken();
  if (!token) {
    checkingSession.value = false;
    return;
  }
  try {
    const accounts = await fetchAccounts(apiBaseUrl);
    const storedId = localStorage.getItem(ACCOUNT_ID_STORAGE_KEY);
    const restored = accounts.find((a) => a.id === storedId);
    if (restored) {
      currentAccount.value = restored;
    } else {
      clearToken();
    }
  } catch {
    clearToken();
  } finally {
    checkingSession.value = false;
  }
});

function onAuthenticated(token: string, account: Account) {
  setToken(token);
  localStorage.setItem(ACCOUNT_ID_STORAGE_KEY, account.id);
  currentAccount.value = account;
  activeView.value = "board";
}

async function logout() {
  await apiLogout(apiBaseUrl).catch(() => {});
  localStorage.removeItem(ACCOUNT_ID_STORAGE_KEY);
  currentAccount.value = null;
  activeView.value = "board";
}
</script>

<template>
  <div v-if="checkingSession" data-testid="session-check" />
  <LoginView v-else-if="!currentAccount" :api-base-url="apiBaseUrl" @authenticated="onAuthenticated" />
  <div v-else class="app-shell">
    <header class="app-header">
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
        <button
          v-if="isAdmin"
          type="button"
          data-testid="view-tab-accounts"
          :class="{ active: activeView === 'accounts' }"
          @click="activeView = 'accounts'"
        >
          帳號管理
        </button>
      </div>
      <div class="identity">
        <span class="avatar" :style="{ background: avatarColor(currentAccount.name) }">{{
          initials(currentAccount.name)
        }}</span>
        <span data-testid="current-account-name">{{ currentAccount.name }}</span>
        <span
          class="role-badge"
          :class="{ admin: currentAccount.role === '管理職' }"
          data-testid="current-account-role"
          >{{ currentAccount.role }}</span
        >
        <button type="button" data-testid="logout-btn" @click="logout">登出</button>
      </div>
    </header>

    <!-- v-show（不是 v-if）保留看板元件狀態（範圍/篩選），在視圖之間切換不會重置這些選擇。 -->
    <KanbanBoard v-show="activeView === 'board'" :apiBaseUrl="apiBaseUrl" :currentAccount="currentAccount" />
    <RequirementsView
      v-show="activeView === 'requirements'"
      :apiBaseUrl="apiBaseUrl"
      :currentAccount="currentAccount"
    />
    <AccountsView v-if="activeView === 'accounts' && isAdmin" :apiBaseUrl="apiBaseUrl" />
  </div>
</template>

<style scoped>
.app-shell {
  max-width: 980px;
  margin: 0 auto;
  padding: 16px 20px 60px;
  font-family:
    -apple-system,
    "Segoe UI",
    "PingFang TC",
    "Microsoft JhengHei",
    sans-serif;
}

.app-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 4px;
}

.app-tabs {
  display: flex;
  gap: 4px;
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

.identity {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
}

.avatar {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  font-weight: 700;
  color: #ffffff;
}

.role-badge {
  font-size: 11px;
  font-weight: 600;
  border: 1px solid #e2e4e9;
  background: #f5f6f8;
  border-radius: 999px;
  padding: 2px 10px;
  color: #6b7280;
}

.role-badge.admin {
  border-color: transparent;
  background: #e6ebff;
  color: #3b5bfd;
}

.identity button {
  border: 1px solid #e2e4e9;
  background: transparent;
  border-radius: 6px;
  padding: 4px 10px;
  font-size: 12px;
  cursor: pointer;
}
</style>
