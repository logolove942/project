import { mount, type VueWrapper } from "@vue/test-utils";
import type { Server } from "node:http";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp as createExpressApp } from "../../../src/api/app.js";
import { closeServer, listenOnEphemeralPort } from "../../../src/api/testHelpers.js";
import { createTaskService, type TaskService } from "../../../src/domain/taskService.js";
import { loginForTest, registerAccountForTest, waitFor } from "../testSupport";
import type { Account } from "../types";
import KanbanBoard from "./KanbanBoard.vue";

describe("KanbanBoard - 快速新增任務（可複選指派）", () => {
  let service: TaskService;
  let server: Server;
  let baseUrl: string;
  let currentAccount: Account;
  let wrapper: VueWrapper | undefined;
  let specId: string;

  beforeEach(async () => {
    service = createTaskService();
    const requirement = service.createRequirement("需求A");
    const spec = service.createSpec(requirement.id, "規格A");
    specId = spec.id;
    ({ server, baseUrl } = await listenOnEphemeralPort(createExpressApp(service)));
    currentAccount = await loginForTest(baseUrl);
    await registerAccountForTest(baseUrl, "阿凱"); // issue #50：指派對象下拉需要真的存在的帳號
    await registerAccountForTest(baseUrl, "小美");
  });

  afterEach(async () => {
    wrapper?.unmount();
    await closeServer(server);
  });

  async function mountAndOpenForm() {
    wrapper = mount(KanbanBoard, {
      props: { apiBaseUrl: baseUrl, currentAccount },
      global: { stubs: { teleport: true } },
    });
    await waitFor(() => !wrapper!.find('[data-testid="loading"]').exists());
    await waitFor(() => wrapper!.find('[data-testid="quick-add-task-btn"]').exists());
    await wrapper!.find('[data-testid="quick-add-task-btn"]').trigger("click");
    await waitFor(() => wrapper!.find('[data-testid="quick-add-task-spec"]').findAll("option").length > 1);
    await waitFor(
      () => wrapper!.find('[data-testid="quick-add-task-assignee-0"]').findAll("option").length > 1,
    );
  }

  it("creates a task with a single assignee under the chosen spec", async () => {
    await mountAndOpenForm();

    await wrapper!.find('[data-testid="quick-add-task-spec"]').setValue(specId);
    await wrapper!.find('[data-testid="quick-add-task-title"]').setValue("撰寫測試案例");
    await wrapper!.find('[data-testid="quick-add-task-assignee-0"]').setValue("阿凱");
    await wrapper!.find('[data-testid="quick-add-task-form"]').trigger("submit");

    await waitFor(() => wrapper!.text().includes("撰寫測試案例"));
    expect(wrapper!.find('[data-testid="quick-add-task-form"]').exists()).toBe(false);

    const tasks = service.getSpecWithTasks(specId).tasks;
    expect(tasks).toHaveLength(1);
    expect(tasks[0].assignees).toEqual([{ person: "阿凱" }]);
  });

  it("creates a task with multiple assignees", async () => {
    await mountAndOpenForm();

    await wrapper!.find('[data-testid="quick-add-task-spec"]').setValue(specId);
    await wrapper!.find('[data-testid="quick-add-task-title"]').setValue("跨人調研");
    await wrapper!.find('[data-testid="quick-add-task-assignee-0"]').setValue("阿凱");
    await wrapper!.find('[data-testid="quick-add-task-add-assignee"]').trigger("click");
    await wrapper!.find('[data-testid="quick-add-task-assignee-1"]').setValue("小美");
    await wrapper!.find('[data-testid="quick-add-task-form"]').trigger("submit");

    await waitFor(() => wrapper!.text().includes("跨人調研"));

    const tasks = service.getSpecWithTasks(specId).tasks;
    const created = tasks.find((t) => t.title === "跨人調研");
    expect(created?.assignees.map((a) => a.person)).toEqual(["阿凱", "小美"]);
  });

  it("shows the backend's validation error when submitting with no assignees", async () => {
    await mountAndOpenForm();

    await wrapper!.find('[data-testid="quick-add-task-spec"]').setValue(specId);
    await wrapper!.find('[data-testid="quick-add-task-title"]').setValue("沒有人負責");
    await wrapper!.find('[data-testid="quick-add-task-form"]').trigger("submit");

    await waitFor(() => wrapper!.find('[data-testid="quick-add-task-error"]').exists());
    expect(service.getSpecWithTasks(specId).tasks).toHaveLength(0);
  });

  it("requires picking a spec before submitting", async () => {
    await mountAndOpenForm();

    await wrapper!.find('[data-testid="quick-add-task-title"]').setValue("沒選規格");
    await wrapper!.find('[data-testid="quick-add-task-assignee-0"]').setValue("阿凱");
    await wrapper!.find('[data-testid="quick-add-task-form"]').trigger("submit");

    await waitFor(() => wrapper!.find('[data-testid="quick-add-task-error"]').exists());
    expect(service.getSpecWithTasks(specId).tasks).toHaveLength(0);
  });

  it("cancels without creating anything", async () => {
    await mountAndOpenForm();

    await wrapper!.find('[data-testid="quick-add-task-title"]').setValue("不要送出");
    await wrapper!.find('[data-testid="quick-add-task-cancel"]').trigger("click");

    expect(wrapper!.find('[data-testid="quick-add-task-form"]').exists()).toBe(false);
    expect(service.getSpecWithTasks(specId).tasks).toHaveLength(0);
  });
});
