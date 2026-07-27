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
  font-family:
    -apple-system,
    "Segoe UI",
    "PingFang TC",
    "Microsoft JhengHei",
    sans-serif;
}

.login-card {
  width: 320px;
  background: #ffffff;
  border: 1px solid #e2e4e9;
  border-radius: 10px;
  padding: 28px 24px;
}

h1 {
  font-size: 18px;
  margin: 0 0 2px;
  text-align: center;
}

.subtitle {
  font-size: 12px;
  color: #6b7280;
  text-align: center;
  margin: 0 0 18px;
}

.mode-tabs {
  display: flex;
  gap: 4px;
  margin-bottom: 16px;
}

.mode-tabs button {
  flex: 1;
  border: 1px solid #e2e4e9;
  background: #fff;
  border-radius: 999px;
  padding: 6px 0;
  font-size: 13px;
  cursor: pointer;
}

.mode-tabs button.active {
  background: #3b5bfd;
  border-color: #3b5bfd;
  color: #fff;
}

form {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
  color: #6b7280;
}

input {
  border: 1px solid #e2e4e9;
  border-radius: 6px;
  padding: 7px 10px;
  font-size: 13px;
  color: #1b1e24;
}

button[type="submit"] {
  margin-top: 4px;
  background: #3b5bfd;
  color: #fff;
  border: none;
  border-radius: 6px;
  padding: 8px 0;
  font-size: 13px;
  cursor: pointer;
}

button[type="submit"]:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.error {
  color: #b3261e;
  font-size: 12px;
  margin: 0;
}
</style>
