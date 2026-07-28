import { mount, type VueWrapper } from "@vue/test-utils";
import type { Server } from "node:http";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp as createExpressApp } from "../../../src/api/app.js";
import { closeServer, listenOnEphemeralPort } from "../../../src/api/testHelpers.js";
import { createTaskService, type TaskService } from "../../../src/domain/taskService.js";
import { loginForTest, registerAccountForTest, waitFor } from "../testSupport";
import type { Account } from "../types";
import RequirementsView from "./RequirementsView.vue";

describe("RequirementsView - 展開需求下的規格＋新增規格＋新增任務", () => {
  let service: TaskService;
  let server: Server;
  let baseUrl: string;
  let currentAccount: Account;
  let wrapper: VueWrapper | undefined;
  let requirementId: string;

  beforeEach(async () => {
    service = createTaskService();
    const requirement = service.createRequirement("需求A");
    requirementId = requirement.id;
    ({ server, baseUrl } = await listenOnEphemeralPort(createExpressApp(service)));
    currentAccount = await loginForTest(baseUrl); // 第一個註冊的帳號 -> 管理職，看得到新增動作
  });

  afterEach(async () => {
    wrapper?.unmount();
    await closeServer(server);
  });

  async function mountAndWait() {
    wrapper = mount(RequirementsView, {
      props: { apiBaseUrl: baseUrl, currentAccount },
      global: { stubs: { teleport: true } },
    });
    await waitFor(() => !wrapper!.find('[data-testid="requirements-loading"]').exists());
  }

  it("creates a new spec under a requirement and shows it immediately", async () => {
    await mountAndWait();

    await wrapper!.find(`[data-testid="new-spec-btn-${requirementId}"]`).trigger("click");
    await wrapper!.find('[data-testid="new-spec-title"]').setValue("規格A-1");
    await wrapper!.find('[data-testid="new-spec-form"]').trigger("submit");

    await waitFor(() => wrapper!.text().includes("規格A-1"));
    expect(service.getRequirement(requirementId).specs.some((s) => s.title === "規格A-1")).toBe(true);
  });

  it("shows an inline error when submitting a spec without a title", async () => {
    await mountAndWait();

    await wrapper!.find(`[data-testid="new-spec-btn-${requirementId}"]`).trigger("click");
    await wrapper!.find('[data-testid="new-spec-form"]').trigger("submit");

    await waitFor(() => wrapper!.find('[data-testid="new-spec-error"]').exists());
    expect(service.getRequirement(requirementId).specs).toHaveLength(0);
  });

  it("creates a task directly under an existing spec, pre-selected, with no spec picker needed", async () => {
    const spec = service.createSpec(requirementId, "規格A-1");
    await registerAccountForTest(baseUrl, "阿凱"); // issue #50：指派對象下拉需要真的存在的帳號
    await mountAndWait();
    await waitFor(() => wrapper!.find(`[data-testid="spec-${spec.id}"]`).exists());

    await wrapper!.find(`[data-testid="spec-${spec.id}"] [data-testid="quick-add-task-btn"]`).trigger("click");
    // 因為只有這一份規格可選（已預先選定），不需要再手動選規格。
    await wrapper!.find(`[data-testid="spec-${spec.id}"] [data-testid="quick-add-task-title"]`).setValue(
      "撰寫規格文件",
    );
    await waitFor(
      () =>
        wrapper!
          .find(`[data-testid="spec-${spec.id}"] [data-testid="quick-add-task-assignee-0"]`)
          .findAll("option").length > 1,
    );
    await wrapper!
      .find(`[data-testid="spec-${spec.id}"] [data-testid="quick-add-task-assignee-0"]`)
      .setValue("阿凱");
    await wrapper!.find(`[data-testid="spec-${spec.id}"] [data-testid="quick-add-task-form"]`).trigger("submit");

    await waitFor(() => service.getSpecWithTasks(spec.id).tasks.length > 0);
    const tasks = service.getSpecWithTasks(spec.id).tasks;
    expect(tasks[0].title).toBe("撰寫規格文件");
    expect(tasks[0].assignees).toEqual([{ person: "阿凱" }]);
  });
});
