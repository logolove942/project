import { mount, type VueWrapper } from "@vue/test-utils";
import type { Server } from "node:http";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp as createExpressApp } from "../../src/api/app.js";
import { closeServer, listenOnEphemeralPort } from "../../src/api/testHelpers.js";
import { createTaskService, type TaskService } from "../../src/domain/taskService.js";
import App from "./App.vue";
import { waitFor } from "./testSupport";

// issue #48：登入/註冊畫面擋在整個 app 前面——這組測試走「真的登入畫面」，
// 不像其他元件測試那樣直接把 currentAccount 塞進 props。
describe("App - 登入/註冊畫面 + token 串接", () => {
  let service: TaskService;
  let server: Server;
  let baseUrl: string;
  let wrapper: VueWrapper | undefined;

  beforeEach(async () => {
    service = createTaskService();
    ({ server, baseUrl } = await listenOnEphemeralPort(createExpressApp(service)));
  });

  afterEach(async () => {
    wrapper?.unmount();
    await closeServer(server);
  });

  async function mountAndWait() {
    wrapper = mount(App, { props: { apiBaseUrl: baseUrl } });
    await waitFor(() => !wrapper!.find('[data-testid="session-check"]').exists());
  }

  it("shows only the login/register screen when there is no session", async () => {
    await mountAndWait();

    expect(wrapper!.find('[data-testid="login-view"]').exists()).toBe(true);
    expect(wrapper!.find('[data-testid="view-tab-board"]').exists()).toBe(false);
  });

  it("registers a new account, logs in, and shows the board", async () => {
    await mountAndWait();

    await wrapper!.find('[data-testid="auth-mode-register"]').trigger("click");
    await wrapper!.find('[data-testid="login-name"]').setValue("小美");
    await wrapper!.find('[data-testid="login-password"]').setValue("hunter2");
    await wrapper!.find("form").trigger("submit");

    await waitFor(() => wrapper!.find('[data-testid="view-tab-board"]').exists());
    expect(wrapper!.find('[data-testid="current-account-name"]').text()).toBe("小美");
    // 系統裡第一個註冊的帳號自動成為管理職（issue #45）
    expect(wrapper!.find('[data-testid="current-account-role"]').text()).toBe("管理職");
  });

  it("shows a generic error for wrong credentials without leaking which part was wrong", async () => {
    await wrapper?.unmount();
    // 先用一個已存在的帳號，之後用錯誤密碼登入
    await fetch(`${baseUrl}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "小美", password: "hunter2" }),
    });

    await mountAndWait();
    await wrapper!.find('[data-testid="login-name"]').setValue("小美");
    await wrapper!.find('[data-testid="login-password"]').setValue("wrong-password");
    await wrapper!.find("form").trigger("submit");

    await waitFor(() => wrapper!.find('[data-testid="login-error"]').exists());
    expect(wrapper!.find('[data-testid="view-tab-board"]').exists()).toBe(false);
  });

  it("persists the session across a remount (reload) via the stored token", async () => {
    await mountAndWait();
    await wrapper!.find('[data-testid="auth-mode-register"]').trigger("click");
    await wrapper!.find('[data-testid="login-name"]').setValue("阿凱");
    await wrapper!.find('[data-testid="login-password"]').setValue("pw123");
    await wrapper!.find("form").trigger("submit");
    await waitFor(() => wrapper!.find('[data-testid="view-tab-board"]').exists());

    wrapper!.unmount();
    wrapper = mount(App, { props: { apiBaseUrl: baseUrl } });
    await waitFor(() => !wrapper!.find('[data-testid="session-check"]').exists());

    expect(wrapper!.find('[data-testid="view-tab-board"]').exists()).toBe(true);
    expect(wrapper!.find('[data-testid="current-account-name"]').text()).toBe("阿凱");
  });

  it("logs out back to the login screen and clears the session", async () => {
    await mountAndWait();
    await wrapper!.find('[data-testid="auth-mode-register"]').trigger("click");
    await wrapper!.find('[data-testid="login-name"]').setValue("小美");
    await wrapper!.find('[data-testid="login-password"]').setValue("hunter2");
    await wrapper!.find("form").trigger("submit");
    await waitFor(() => wrapper!.find('[data-testid="view-tab-board"]').exists());

    await wrapper!.find('[data-testid="logout-btn"]').trigger("click");
    await waitFor(() => wrapper!.find('[data-testid="login-view"]').exists());

    wrapper!.unmount();
    wrapper = mount(App, { props: { apiBaseUrl: baseUrl } });
    await waitFor(() => !wrapper!.find('[data-testid="session-check"]').exists());
    expect(wrapper!.find('[data-testid="login-view"]').exists()).toBe(true);
  });

  it("hides the 帳號管理 tab for a 一般同仁 account", async () => {
    // 先註冊一個管理職帳號，讓下一個註冊的帳號變成一般同仁
    await fetch(`${baseUrl}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "我", password: "pw1" }),
    });

    await mountAndWait();
    await wrapper!.find('[data-testid="auth-mode-register"]').trigger("click");
    await wrapper!.find('[data-testid="login-name"]').setValue("小美");
    await wrapper!.find('[data-testid="login-password"]').setValue("pw2");
    await wrapper!.find("form").trigger("submit");
    await waitFor(() => wrapper!.find('[data-testid="view-tab-board"]').exists());

    expect(wrapper!.find('[data-testid="current-account-role"]').text()).toBe("一般同仁");
    expect(wrapper!.find('[data-testid="view-tab-accounts"]').exists()).toBe(false);
  });
});
