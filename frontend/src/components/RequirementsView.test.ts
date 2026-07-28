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
    const requirement = service.createRequirement("需求A", "測試描述");
    service.createSpec(requirement.id, "規格A-1", "測試描述");

    wrapper = mount(RequirementsView, {
      props: { apiBaseUrl: baseUrl, currentAccount },
      global: { stubs: { teleport: true } },
    });
    await waitFor(() => !wrapper!.find('[data-testid="requirements-loading"]').exists());

    expect(wrapper.find(`[data-testid="requirement-${requirement.id}"]`).text()).toContain("需求A");
    expect(wrapper.find(`[data-testid="requirement-${requirement.id}"]`).text()).toContain("規格A-1");
  });

  it("creates a new requirement and shows it in the list immediately", async () => {
    wrapper = mount(RequirementsView, {
      props: { apiBaseUrl: baseUrl, currentAccount },
      global: { stubs: { teleport: true } },
    });
    await waitFor(() => !wrapper!.find('[data-testid="requirements-loading"]').exists());

    await wrapper.find('[data-testid="new-requirement-btn"]').trigger("click");
    await wrapper.find('[data-testid="new-requirement-title"]').setValue("新的需求");
    await wrapper.find('[data-testid="new-requirement-description"]').setValue("這個需求要做什麼");
    await wrapper.find('[data-testid="new-requirement-form"]').trigger("submit");

    await waitFor(() => wrapper!.text().includes("新的需求"));
    const created = service.listRequirements().find((r) => r.title === "新的需求");
    expect(created?.description).toBe("這個需求要做什麼");
  });

  it("shows an inline error when submitting without a title", async () => {
    wrapper = mount(RequirementsView, {
      props: { apiBaseUrl: baseUrl, currentAccount },
      global: { stubs: { teleport: true } },
    });
    await waitFor(() => !wrapper!.find('[data-testid="requirements-loading"]').exists());

    await wrapper.find('[data-testid="new-requirement-btn"]').trigger("click");
    await wrapper.find('[data-testid="new-requirement-form"]').trigger("submit");

    await waitFor(() => wrapper!.find('[data-testid="new-requirement-error"]').exists());
    expect(service.listRequirements()).toHaveLength(0);
  });

  it("shows an inline error when submitting a title without a description", async () => {
    wrapper = mount(RequirementsView, {
      props: { apiBaseUrl: baseUrl, currentAccount },
      global: { stubs: { teleport: true } },
    });
    await waitFor(() => !wrapper!.find('[data-testid="requirements-loading"]').exists());

    await wrapper.find('[data-testid="new-requirement-btn"]').trigger("click");
    await wrapper.find('[data-testid="new-requirement-title"]').setValue("沒填描述");
    await wrapper.find('[data-testid="new-requirement-form"]').trigger("submit");

    await waitFor(() => wrapper!.find('[data-testid="new-requirement-error"]').exists());
    expect(service.listRequirements()).toHaveLength(0);
  });

  it("collapses completed requirements into a separate, collapsed-by-default section", async () => {
    const active = service.createRequirement("進行中的需求", "測試描述");
    const done = service.createRequirement("已完成的需求", "測試描述");
    service.setRequirementStatus(done.id, "完成");

    wrapper = mount(RequirementsView, {
      props: { apiBaseUrl: baseUrl, currentAccount },
      global: { stubs: { teleport: true } },
    });
    await waitFor(() => !wrapper!.find('[data-testid="requirements-loading"]').exists());

    expect(wrapper.find(`[data-testid="requirement-${active.id}"]`).exists()).toBe(true);
    expect(wrapper.find(`[data-testid="requirement-${done.id}"]`).exists()).toBe(false);
    expect(wrapper.find('[data-testid="completed-requirements-toggle"]').text()).toContain("1");

    await wrapper.find('[data-testid="completed-requirements-toggle"]').trigger("click");
    expect(wrapper.find(`[data-testid="requirement-${done.id}"]`).text()).toContain("已完成的需求");
  });

  it("opens a requirement's detail modal with its rendered description on click, and can edit it", async () => {
    const requirement = service.createRequirement("需求A", "**重點**內容");

    wrapper = mount(RequirementsView, {
      props: { apiBaseUrl: baseUrl, currentAccount },
      global: { stubs: { teleport: true } },
    });
    await waitFor(() => !wrapper!.find('[data-testid="requirements-loading"]').exists());

    await wrapper.find(`[data-testid="requirement-title-${requirement.id}"]`).trigger("click");
    expect(wrapper.find('[data-testid="entity-detail-description"]').html()).toContain("<strong>重點</strong>");

    await wrapper.find('[data-testid="entity-detail-edit-btn"]').trigger("click");
    await wrapper.find('[data-testid="entity-detail-edit-title"]').setValue("需求A（改過）");
    await wrapper.find('[data-testid="entity-detail-edit-form"]').trigger("submit");

    await waitFor(() => service.getRequirement(requirement.id).title === "需求A（改過）");
  });

  it("marks a requirement 完成 through the detail modal's status field, moving it into the collapsed section", async () => {
    const requirement = service.createRequirement("需求A", "測試描述");

    wrapper = mount(RequirementsView, {
      props: { apiBaseUrl: baseUrl, currentAccount },
      global: { stubs: { teleport: true } },
    });
    await waitFor(() => !wrapper!.find('[data-testid="requirements-loading"]').exists());

    await wrapper.find(`[data-testid="requirement-title-${requirement.id}"]`).trigger("click");
    expect(wrapper.find('[data-testid="entity-detail-status"]').text()).toBe("待處理");

    await wrapper.find('[data-testid="entity-detail-edit-btn"]').trigger("click");
    await wrapper.find('[data-testid="entity-detail-edit-status"]').setValue("完成");
    await wrapper.find('[data-testid="entity-detail-edit-form"]').trigger("submit");

    await waitFor(() => service.getRequirement(requirement.id).status === "完成");
    await waitFor(() => !wrapper!.find(`[data-testid="requirement-${requirement.id}"]`).exists());
    expect(wrapper.find('[data-testid="completed-requirements-toggle"]').exists()).toBe(true);
  });

  // issue #51：非管理職看不到任何新增需求/規格/任務的按鈕。
  it("hides the create-requirement form for a 一般同仁 account and shows a read-only note instead", async () => {
    const requirement = service.createRequirement("需求A", "測試描述");
    const spec = service.createSpec(requirement.id, "規格A-1", "測試描述");
    const member = await loginForTest(baseUrl, "小美"); // 第二個註冊的帳號 -> 一般同仁

    wrapper = mount(RequirementsView, {
      props: { apiBaseUrl: baseUrl, currentAccount: member },
      global: { stubs: { teleport: true } },
    });
    await waitFor(() => !wrapper!.find('[data-testid="requirements-loading"]').exists());
    await waitFor(() => wrapper!.find(`[data-testid="spec-${spec.id}"]`).exists());

    expect(wrapper.find('[data-testid="new-requirement-btn"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="requirements-readonly-note"]').exists()).toBe(true);
    expect(wrapper.find(`[data-testid="new-spec-btn-${requirement.id}"]`).exists()).toBe(false);
    expect(wrapper.find(`[data-testid="spec-${spec.id}"] [data-testid="quick-add-task-btn"]`).exists()).toBe(false);
  });
});
