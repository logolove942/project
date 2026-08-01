import { mount, type VueWrapper } from "@vue/test-utils";
import type { Server } from "node:http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp as createExpressApp } from "../../../src/api/app.js";
import { closeServer, listenOnEphemeralPort } from "../../../src/api/testHelpers.js";
import { createTaskService, type TaskService } from "../../../src/domain/taskService.js";
import { loginForTest, waitFor } from "../testSupport";
import type { Account } from "../types";
import KanbanBoard from "./KanbanBoard.vue";

describe("KanbanBoard - 「剛完成（今天）」收合區塊", () => {
  let service: TaskService;
  let server: Server;
  let baseUrl: string;
  let currentAccount: Account;
  let wrapper: VueWrapper | undefined;
  let specId: string;

  beforeEach(async () => {
    // 只假裝 Date，setTimeout 保持真實——waitFor 需要真的計時器輪詢，
    // 而 fetch() 也需要真實的事件迴圈 I/O 才能完成。
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-07-27T10:00:00Z"));
    service = createTaskService();
    const requirement = service.createRequirement("R", "測試描述");
    const spec = service.createSpec(requirement.id, "S", "測試描述");
    specId = spec.id;
    ({ server, baseUrl } = await listenOnEphemeralPort(createExpressApp(service)));
    currentAccount = await loginForTest(baseUrl);
  });

  afterEach(async () => {
    wrapper?.unmount();
    await closeServer(server);
    vi.useRealTimers();
  });

  async function mountAndWait() {
    wrapper = mount(KanbanBoard, { props: { apiBaseUrl: baseUrl, currentAccount } });
    await waitFor(() => !wrapper!.find('[data-testid="loading"]').exists());
  }

  it("does not show the 'recently completed' section when nothing has been completed", async () => {
    service.createTask(specId, {
      type: "開發任務",
      title: "任務A",
      assignees: [{ person: "小美" }],
    });
    await mountAndWait();

    expect(wrapper!.find('[data-testid="recently-completed"]').exists()).toBe(false);
  });

  it("does not put a task completed today in any of the three persistent columns", async () => {
    const task = service.createTask(specId, {
      type: "開發任務",
      title: "任務A",
      assignees: [{ person: "小美" }],
    });
    service.startTask(task.id);
    service.completeTask(task.id);
    await mountAndWait();

    expect(wrapper!.find(`[data-testid="card-${task.id}"]`).exists()).toBe(false);
  });

  it("shows a task completed today inside the 'recently completed' section", async () => {
    const task = service.createTask(specId, {
      type: "開發任務",
      title: "任務A",
      assignees: [{ person: "小美" }],
    });
    service.startTask(task.id);
    service.completeTask(task.id);
    await mountAndWait();

    const section = wrapper!.find('[data-testid="recently-completed"]');
    expect(section.exists()).toBe(true);
    expect(section.text()).toContain("任務A");
  });

  it("shows a closed reminder completed today inside the 'recently completed' section", async () => {
    const reminder = service.createReminder({ createdBy: "小美", assignedTo: "阿凱", title: "提醒A" });
    service.closeReminder(reminder.id);
    await mountAndWait();

    expect(wrapper!.find('[data-testid="recently-completed"]').text()).toContain("提醒A");
  });

  it("shows a cancelled reminder inside the 'recently completed' section, dropping it the day after (issue #57)", async () => {
    const reminder = service.createReminder({ createdBy: "小美", assignedTo: "阿凱", title: "提醒A" });
    service.cancelReminder(reminder.id);
    await mountAndWait();

    expect(wrapper!.find('[data-testid="recently-completed"]').text()).toContain("提醒A");

    vi.setSystemTime(new Date("2026-07-28T10:00:00Z"));
    wrapper!.unmount();
    await mountAndWait();

    expect(wrapper!.find(`[data-testid="card-${reminder.id}"]`).exists()).toBe(false);
    expect(wrapper!.find('[data-testid="recently-completed"]').exists()).toBe(false);
  });

  it("drops the item from both the board and the 'recently completed' section the day after", async () => {
    const task = service.createTask(specId, {
      type: "開發任務",
      title: "任務A",
      assignees: [{ person: "小美" }],
    });
    service.startTask(task.id);
    service.completeTask(task.id);

    vi.setSystemTime(new Date("2026-07-28T10:00:00Z"));
    await mountAndWait();

    expect(wrapper!.find(`[data-testid="card-${task.id}"]`).exists()).toBe(false);
    expect(wrapper!.find('[data-testid="recently-completed"]').exists()).toBe(false);
  });
});
