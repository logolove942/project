import { mount, type VueWrapper } from "@vue/test-utils";
import type { Server } from "node:http";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp as createExpressApp } from "../../../src/api/app.js";
import { closeServer, listenOnEphemeralPort } from "../../../src/api/testHelpers.js";
import { createTaskService, type TaskService } from "../../../src/domain/taskService.js";
import { loginForTest, waitFor } from "../testSupport";
import type { Account } from "../types";
import KanbanBoard from "./KanbanBoard.vue";

describe("KanbanBoard - 類型篩選（全部/任務/提醒/雜事）", () => {
  let service: TaskService;
  let server: Server;
  let baseUrl: string;
  let currentAccount: Account;
  let wrapper: VueWrapper | undefined;
  let taskId: string;
  let reminderId: string;
  let choreId: string;

  beforeEach(async () => {
    service = createTaskService();
    const requirement = service.createRequirement("R", "測試描述");
    const spec = service.createSpec(requirement.id, "S", "測試描述");
    const task = service.createTask(spec.id, {
      type: "開發任務",
      title: "任務A",
      assignees: [{ person: "小美" }],
    });
    taskId = task.id;
    const reminder = service.createReminder({
      createdBy: "小美",
      assignedTo: "阿凱",
      title: "提醒B",
    });
    reminderId = reminder.id;
    const chore = service.createReminder({ createdBy: "小美", assignedTo: "小美", title: "雜事C" });
    choreId = chore.id;
    service.logReminderWork(chore.id, { person: "小美", date: "2026-07-27", hours: 1 }); // 讓雜事在全觀下可見

    ({ server, baseUrl } = await listenOnEphemeralPort(createExpressApp(service)));
    currentAccount = await loginForTest(baseUrl);
    wrapper = mount(KanbanBoard, { props: { apiBaseUrl: baseUrl, currentAccount } });
    await waitFor(() => !wrapper!.find('[data-testid="loading"]').exists());
  });

  afterEach(async () => {
    wrapper?.unmount();
    await closeServer(server);
  });

  it("shows everything under 全部 (the default)", () => {
    expect(wrapper!.find(`[data-testid="card-${taskId}"]`).exists()).toBe(true);
    expect(wrapper!.find(`[data-testid="card-${reminderId}"]`).exists()).toBe(true);
    expect(wrapper!.find(`[data-testid="card-${choreId}"]`).exists()).toBe(true);
  });

  it("shows only tasks under 任務", async () => {
    await wrapper!.find('[data-testid="type-filter-任務"]').trigger("click");

    expect(wrapper!.find(`[data-testid="card-${taskId}"]`).exists()).toBe(true);
    expect(wrapper!.find(`[data-testid="card-${reminderId}"]`).exists()).toBe(false);
    expect(wrapper!.find(`[data-testid="card-${choreId}"]`).exists()).toBe(false);
  });

  it("shows only non-chore reminders under 提醒", async () => {
    await wrapper!.find('[data-testid="type-filter-提醒"]').trigger("click");

    expect(wrapper!.find(`[data-testid="card-${reminderId}"]`).exists()).toBe(true);
    expect(wrapper!.find(`[data-testid="card-${taskId}"]`).exists()).toBe(false);
    expect(wrapper!.find(`[data-testid="card-${choreId}"]`).exists()).toBe(false);
  });

  it("shows only chores under 雜事", async () => {
    await wrapper!.find('[data-testid="type-filter-雜事"]').trigger("click");

    expect(wrapper!.find(`[data-testid="card-${choreId}"]`).exists()).toBe(true);
    expect(wrapper!.find(`[data-testid="card-${taskId}"]`).exists()).toBe(false);
    expect(wrapper!.find(`[data-testid="card-${reminderId}"]`).exists()).toBe(false);
  });
});
