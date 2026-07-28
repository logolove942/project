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
      <div class="brand">
        <div class="brand-mark">◆</div>
        <div class="brand-text">
          <div class="brand-name">工作台</div>
          <div class="brand-sub">團隊任務 · 個人雜事</div>
        </div>
      </div>
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
  max-width: 1080px;
  margin: 0 auto;
  padding: 0 20px 60px;
}

.app-header {
  position: sticky;
  top: 0;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 16px;
  padding: 14px 0;
  margin-bottom: 8px;
  background: var(--bg);
  border-bottom: 1px solid var(--border);
}

.brand {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}

.brand-mark {
  width: 32px;
  height: 32px;
  border-radius: 10px;
  background: linear-gradient(135deg, var(--primary), var(--secondary));
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 15px;
  font-weight: 800;
  box-shadow: var(--shadow-sm);
  flex-shrink: 0;
}

.brand-name {
  font-size: 14px;
  font-weight: 700;
  line-height: 1.2;
  color: var(--text);
}

.brand-sub {
  font-size: 11px;
  color: var(--text-faint);
  line-height: 1.2;
}

.app-tabs {
  display: flex;
  gap: 2px;
  background: var(--surface-2);
  padding: 3px;
  border-radius: var(--radius-pill);
  margin-left: auto;
}

.app-tabs button {
  border: none;
  background: transparent;
  color: var(--text-dim);
  border-radius: var(--radius-pill);
  padding: 6px 16px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.12s ease;
}

.app-tabs button:hover {
  color: var(--text);
}

.app-tabs button.active {
  background: var(--surface);
  color: var(--primary);
  box-shadow: var(--shadow-sm);
}

.identity {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
}

.avatar {
  width: 24px;
  height: 24px;
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
  font-size: 10.5px;
  font-weight: 700;
  border: none;
  background: var(--slate-tint);
  border-radius: var(--radius-pill);
  padding: 2px 10px;
  color: var(--slate);
}

.role-badge.admin {
  background: var(--primary-tint);
  color: var(--primary);
}

.identity button {
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text-dim);
  border-radius: var(--radius-sm);
  padding: 5px 12px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.12s ease;
}

.identity button:hover {
  border-color: var(--border-strong);
  color: var(--text);
}

@media (max-width: 720px) {
  .app-header {
    flex-wrap: wrap;
  }
  .app-tabs {
    margin-left: 0;
    order: 3;
    width: 100%;
  }
}
</style>
