<script setup lang="ts">
import { ref } from "vue";
import { login, register } from "../api/client";
import type { Account } from "../types";

const props = defineProps<{ apiBaseUrl: string }>();
const emit = defineEmits<{ authenticated: [token: string, account: Account] }>();

const mode = ref<"login" | "register">("login");
const name = ref("");
const password = ref("");
const submitting = ref(false);
const error = ref<string | null>(null);

async function submit() {
  error.value = null;
  if (!name.value || !password.value) {
    error.value = "請填寫帳號名稱與密碼";
    return;
  }
  submitting.value = true;
  try {
    if (mode.value === "register") {
      await register(props.apiBaseUrl, name.value, password.value);
    }
    const { token, account } = await login(props.apiBaseUrl, name.value, password.value);
    emit("authenticated", token, account);
  } catch (e) {
    error.value = e instanceof Error ? e.message : mode.value === "login" ? "登入失敗" : "註冊失敗";
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <div class="login-shell" data-testid="login-view">
    <div class="login-card">
      <div class="brand-mark">◆</div>
      <h1>工作台</h1>
      <p class="subtitle">團隊任務 · 個人雜事</p>

      <div class="mode-tabs">
        <button
          type="button"
          data-testid="auth-mode-login"
          :class="{ active: mode === 'login' }"
          @click="mode = 'login'"
        >
          登入
        </button>
        <button
          type="button"
          data-testid="auth-mode-register"
          :class="{ active: mode === 'register' }"
          @click="mode = 'register'"
        >
          註冊
        </button>
      </div>

      <form @submit.prevent="submit">
        <label>
          帳號名稱
          <input v-model="name" type="text" data-testid="login-name" />
        </label>
        <label>
          密碼
          <input v-model="password" type="password" data-testid="login-password" />
        </label>
        <p v-if="error" class="error" data-testid="login-error">{{ error }}</p>
        <button type="submit" :disabled="submitting" data-testid="login-submit">
          {{ mode === "login" ? "登入" : "註冊並登入" }}
        </button>
      </form>
    </div>
  </div>
</template>

<style scoped>
.login-shell {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

.login-card {
  width: 340px;
  max-width: 100%;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  padding: 28px 26px;
}

.brand-mark {
  width: 36px;
  height: 36px;
  margin: 0 auto 12px;
  border-radius: 10px;
  background: linear-gradient(135deg, var(--primary), var(--secondary));
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 17px;
  font-weight: 800;
  box-shadow: var(--shadow-sm);
}

h1 {
  font-size: 18px;
  margin: 0 0 2px;
  text-align: center;
  color: var(--text);
}

.subtitle {
  font-size: 12px;
  color: var(--text-faint);
  text-align: center;
  margin: 0 0 20px;
}

.mode-tabs {
  display: flex;
  gap: 2px;
  margin-bottom: 18px;
  background: var(--surface-2);
  padding: 3px;
  border-radius: var(--radius-pill);
}

.mode-tabs button {
  flex: 1;
  border: none;
  background: transparent;
  color: var(--text-dim);
  border-radius: var(--radius-pill);
  padding: 7px 0;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.12s ease;
}

.mode-tabs button.active {
  background: var(--surface);
  color: var(--primary);
  box-shadow: var(--shadow-sm);
}

form {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

label {
  display: flex;
  flex-direction: column;
  gap: 5px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-dim);
}

input {
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 8px 11px;
  font-size: 13px;
  background: var(--bg);
  color: var(--text);
  outline: none;
  transition: border-color 0.12s ease;
}

input:focus {
  border-color: var(--primary);
  box-shadow: var(--shadow-focus);
}

button[type="submit"] {
  margin-top: 4px;
  background: var(--primary);
  color: #fff;
  border: none;
  border-radius: var(--radius-sm);
  padding: 9px 0;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.12s ease;
}

button[type="submit"]:hover:not(:disabled) {
  background: var(--primary-hover);
}

button[type="submit"]:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.error {
  color: var(--danger);
  font-size: 12px;
  margin: 0;
}
</style>
