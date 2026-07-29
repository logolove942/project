import { flushPromises, type VueWrapper } from "@vue/test-utils";
import { setToken } from "./api/client";
import RichTextEditor from "./components/RichTextEditor.vue";
import type { Account } from "./types";

// Real fetch() calls need actual event-loop turns to resolve, not just a
// microtask flush — poll until the predicate holds (or time out).
export async function waitFor(predicate: () => boolean, timeoutMs = 4000): Promise<void> {
  const start = Date.now();
  await flushPromises();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error("waitFor: condition not met within timeout");
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
    await flushPromises();
  }
}

// jsdom 沒有完整實作 contenteditable 需要的 Selection/Range API，測試無法對 RichTextEditor
// 模擬真的打字；改用它暴露出來的 setContent（Tiptap command API）直接寫入內容。
export async function setRichTextContent(
  wrapper: VueWrapper,
  testid: string,
  html: string,
): Promise<void> {
  const editors = wrapper.findAllComponents(RichTextEditor);
  const target = editors.find((editor) => editor.attributes("data-testid") === testid);
  if (!target) throw new Error(`RichTextEditor not found for data-testid="${testid}"`);
  target.vm.setContent(html);
  await flushPromises();
}

// issue #48：既有的元件測試現在都要先登入才能打通任何 API 呼叫——真的呼叫
// /auth/register + /auth/login（不 mock），沿用專案一貫「打真的 HTTP request」的測試風格，
// 並把拿到的 token 存進 localStorage，讓元件內部的 authedFetch 自動帶上。
export async function loginForTest(
  baseUrl: string,
  name = "test-user",
  password = "test-password",
): Promise<Account> {
  await fetch(`${baseUrl}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, password }),
  });
  const res = await fetch(`${baseUrl}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, password }),
  });
  const body = (await res.json()) as { token: string; account: Account };
  setToken(body.token);
  return body.account;
}

// 註冊一個帳號但不登入——用來讓某個人名出現在帳號選單的選項裡（issue #50 的 <select> 需要
// 真的存在的帳號，光是在 domain service 裡建立任務/提醒的 assignee 字串是不夠的）。
export async function registerAccountForTest(
  baseUrl: string,
  name: string,
  password = "test-password",
): Promise<Account> {
  const res = await fetch(`${baseUrl}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, password }),
  });
  return (await res.json()) as Account;
}
