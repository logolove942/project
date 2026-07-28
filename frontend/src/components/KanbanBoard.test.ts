import { mount, type VueWrapper } from "@vue/test-utils";
import type { Server } from "node:http";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp as createExpressApp } from "../../../src/api/app.js";
import { closeServer, listenOnEphemeralPort } from "../../../src/api/testHelpers.js";
import { createTaskService, type TaskService } from "../../../src/domain/taskService.js";
import { loginForTest, waitFor } from "../testSupport";
import type { Account } from "../types";
import KanbanBoard from "./KanbanBoard.vue";

describe("KanbanBoard", () => {
  let service: TaskService;
  let server: Server;
  let baseUrl: string;
  let currentAccount: Account;
  let wrapper: VueWrapper | undefined;

  beforeEach(async () => {
    service = createTaskService();
    ({ server, baseUrl } = await listenOnEphemeralPort(createExpressApp(service)));
    currentAccount = await loginForTest(baseUrl);
  });

  afterEach(async () => {
    wrapper?.unmount();
    await closeServer(server);
  });

  it("shows a loading state before the todo list arrives", () => {
    wrapper = mount(KanbanBoard, { props: { apiBaseUrl: baseUrl, currentAccount } });
    expect(wrapper.find('[data-testid="loading"]').exists()).toBe(true);
  });

  it("renders three status columns with tasks and reminders grouped correctly", async () => {
    const requirement = service.createRequirement("會員登入", "測試描述");
    const spec = service.createSpec(requirement.id, "會員登入規格", "測試描述");
    const devTask = service.createTask(spec.id, {
      type: "開發任務",
      title: "開發任務A",
      assignees: [{ person: "小美" }],
      priority: "高",
    });
    service.startTask(devTask.id);

    service.createTask(spec.id, {
      type: "測試任務",
      title: "測試任務B",
      assignees: [{ person: "阿凱" }],
    });

    service.createReminder({
      createdBy: "小美",
      assignedTo: "阿凱",
      title: "提醒C",
    });

    wrapper = mount(KanbanBoard, { props: { apiBaseUrl: baseUrl, currentAccount } });
    await waitFor(() => !wrapper!.find('[data-testid="loading"]').exists());

    expect(wrapper.find(`[data-testid="card-${devTask.id}"]`).text()).toContain("開發任務A");
    expect(wrapper.find(`[data-testid="column-進行中"]`).text()).toContain("開發任務A");
    expect(wrapper.find(`[data-testid="column-待處理"]`).text()).toContain("測試任務B");
    expect(wrapper.find(`[data-testid="column-待處理"]`).text()).toContain("提醒C");
  });

  it("shows a spec badge on task cards linked to a spec", async () => {
    const requirement = service.createRequirement("會員登入", "測試描述");
    const spec = service.createSpec(requirement.id, "會員登入規格", "測試描述");
    const task = service.createTask(spec.id, {
      type: "開發任務",
      title: "開發任務A",
      assignees: [{ person: "小美" }],
    });

    wrapper = mount(KanbanBoard, { props: { apiBaseUrl: baseUrl, currentAccount } });
    await waitFor(() => !wrapper!.find('[data-testid="loading"]').exists());

    expect(wrapper.find(`[data-testid="card-${task.id}"]`).text()).toContain(spec.id);
  });

  it("shows an error message when the API call fails", async () => {
    wrapper = mount(KanbanBoard, { props: { apiBaseUrl: "http://localhost:1", currentAccount } });
    await waitFor(() => !wrapper!.find('[data-testid="loading"]').exists());

    expect(wrapper.find('[data-testid="error"]').exists()).toBe(true);
  });
});
