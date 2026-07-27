import { mount, type VueWrapper } from "@vue/test-utils";
import type { Server } from "node:http";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp as createExpressApp } from "../../../src/api/app.js";
import { closeServer, listenOnEphemeralPort } from "../../../src/api/testHelpers.js";
import { createTaskService, type TaskService } from "../../../src/domain/taskService.js";
import { loginForTest, waitFor } from "../testSupport";
import type { Account } from "../types";
import RequirementsView from "./RequirementsView.vue";

describe("RequirementsView - 需求/規格管理", () => {
  let service: TaskService;
  let server: Server;
  let baseUrl: string;
  let currentAccount: Account;
  let wrapper: VueWrapper | undefined;

  beforeEach(async () => {
    service = createTaskService();
    ({ server, baseUrl } = await listenOnEphemeralPort(createExpressApp(service)));
    currentAccount = await loginForTest(baseUrl); // 第一個註冊的帳號 -> 管理職，看得到新增動作
  });

  afterEach(async () => {
    wrapper?.unmount();
    await closeServer(server);
  });

  it("lists existing requirements with their nested specs", async () => {
    const requirement = service.createRequirement("需求A");
    service.createSpec(requirement.id, "規格A-1");

    wrapper = mount(RequirementsView, { props: { apiBaseUrl: baseUrl, currentAccount } });
    await waitFor(() => !wrapper!.find('[data-testid="requirements-loading"]').exists());

    expect(wrapper.find(`[data-testid="requirement-${requirement.id}"]`).text()).toContain("需求A");
    expect(wrapper.find(`[data-testid="requirement-${requirement.id}"]`).text()).toContain("規格A-1");
  });

  it("creates a new requirement and shows it in the list immediately", async () => {
    wrapper = mount(RequirementsView, { props: { apiBaseUrl: baseUrl, currentAccount } });
    await waitFor(() => !wrapper!.find('[data-testid="requirements-loading"]').exists());

    await wrapper.find('[data-testid="new-requirement-title"]').setValue("新的需求");
    await wrapper.find('[data-testid="new-requirement-form"]').trigger("submit");

    await waitFor(() => wrapper!.text().includes("新的需求"));
    expect(service.listRequirements().some((r) => r.title === "新的需求")).toBe(true);
  });

  it("shows an inline error when submitting without a title", async () => {
    wrapper = mount(RequirementsView, { props: { apiBaseUrl: baseUrl, currentAccount } });
    await waitFor(() => !wrapper!.find('[data-testid="requirements-loading"]').exists());

    await wrapper.find('[data-testid="new-requirement-form"]').trigger("submit");

    await waitFor(() => wrapper!.find('[data-testid="new-requirement-error"]').exists());
    expect(service.listRequirements()).toHaveLength(0);
  });

  // issue #51：非管理職看不到任何新增需求/規格/任務的按鈕。
  it("hides the create-requirement form for a 一般同仁 account and shows a read-only note instead", async () => {
    const requirement = service.createRequirement("需求A");
    const spec = service.createSpec(requirement.id, "規格A-1");
    const member = await loginForTest(baseUrl, "小美"); // 第二個註冊的帳號 -> 一般同仁

    wrapper = mount(RequirementsView, { props: { apiBaseUrl: baseUrl, currentAccount: member } });
    await waitFor(() => !wrapper!.find('[data-testid="requirements-loading"]').exists());
    await waitFor(() => wrapper!.find(`[data-testid="spec-${spec.id}"]`).exists());

    expect(wrapper.find('[data-testid="new-requirement-form"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="requirements-readonly-note"]').exists()).toBe(true);
    expect(wrapper.find(`[data-testid="new-spec-btn-${requirement.id}"]`).exists()).toBe(false);
    expect(wrapper.find(`[data-testid="spec-${spec.id}"] [data-testid="quick-add-task-btn"]`).exists()).toBe(false);
  });
});
