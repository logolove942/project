import { mount, type VueWrapper } from "@vue/test-utils";
import type { Server } from "node:http";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp as createExpressApp } from "../../../src/api/app.js";
import { closeServer, listenOnEphemeralPort } from "../../../src/api/testHelpers.js";
import { createTaskService, type TaskService } from "../../../src/domain/taskService.js";
import { loginForTest, waitFor } from "../testSupport";
import type { Account } from "../types";
import KanbanBoard from "./KanbanBoard.vue";

describe("KanbanBoard - 詳情面板：提醒取消/復原（issue #57）", () => {
  let service: TaskService;
  let server: Server;
  let baseUrl: string;
  let currentAccount: Account;
  let wrapper: VueWrapper | undefined;
  let specId: string;

  beforeEach(async () => {
    service = createTaskService();
    const requirement = service.createRequirement("R", "測試描述");
    const spec = service.createSpec(requirement.id, "S", "測試描述");
    specId = spec.id;
    ({ server, baseUrl } = await listenOnEphemeralPort(createExpressApp(service)));
    currentAccount = await loginForTest(baseUrl, "小美");
  });

  afterEach(async () => {
    wrapper?.unmount();
    await closeServer(server);
  });

  async function mountAndSelect(itemId: string) {
    wrapper = mount(KanbanBoard, { props: { apiBaseUrl: baseUrl, currentAccount } });
    await waitFor(() => !wrapper!.find('[data-testid="loading"]').exists());
    await wrapper.find(`[data-testid="card-${itemId}"]`).trigger("click");
    await waitFor(() => !wrapper!.find('[data-testid="detail-loading"]').exists());
  }

  it("shows the 取消提醒 button for the reminder's creator", async () => {
    const reminder = service.createReminder({ createdBy: "小美", assignedTo: "阿凱", title: "提醒A" });
    await mountAndSelect(reminder.id);

    expect(wrapper!.find('[data-testid="reminder-cancel-btn"]').exists()).toBe(true);
  });

  it("shows the 取消提醒 button for the reminder's assignee", async () => {
    const reminder = service.createReminder({ createdBy: "阿凱", assignedTo: "小美", title: "提醒A" });
    await mountAndSelect(reminder.id);

    expect(wrapper!.find('[data-testid="reminder-cancel-btn"]').exists()).toBe(true);
  });

  it("hides the 取消提醒 button for someone who is neither the creator nor the assignee", async () => {
    const reminder = service.createReminder({ createdBy: "阿凱", assignedTo: "阿明", title: "提醒A" });
    await mountAndSelect(reminder.id);

    expect(wrapper!.find('[data-testid="reminder-cancel-btn"]').exists()).toBe(false);
  });

  it("does not show reminder cancel controls on a task's detail panel", async () => {
    const task = service.createTask(specId, {
      type: "開發任務",
      title: "任務A",
      assignees: [{ person: "小美" }],
    });
    await mountAndSelect(task.id);

    expect(wrapper!.find('[data-testid="reminder-cancel-btn"]').exists()).toBe(false);
  });

  it("cancels a reminder, hiding the status-select and moving it into 剛完成（今天）", async () => {
    const reminder = service.createReminder({ createdBy: "小美", assignedTo: "阿凱", title: "提醒A" });
    await mountAndSelect(reminder.id);

    await wrapper!.find('[data-testid="reminder-cancel-btn"]').trigger("click");
    await waitFor(() => !wrapper!.find(`[data-testid="card-${reminder.id}"]`).exists());

    expect(wrapper!.find('[data-testid="recently-completed"]').text()).toContain("提醒A");
    expect(wrapper!.find('[data-testid="status-select"]').exists()).toBe(false);
    expect(wrapper!.find('[data-testid="status-cancelled-label"]').text()).toBe("已取消");
    expect(wrapper!.find('[data-testid="reminder-restore-btn"]').exists()).toBe(true);
  });

  it("restores a cancelled reminder back to 未處理", async () => {
    const reminder = service.createReminder({ createdBy: "小美", assignedTo: "阿凱", title: "提醒A" });
    service.cancelReminder(reminder.id);

    wrapper = mount(KanbanBoard, { props: { apiBaseUrl: baseUrl, currentAccount } });
    await waitFor(() => !wrapper!.find('[data-testid="loading"]').exists());
    await wrapper.find(`[data-testid="recently-completed-card-${reminder.id}"]`).trigger("click");
    await waitFor(() => !wrapper!.find('[data-testid="detail-loading"]').exists());

    await wrapper.find('[data-testid="reminder-restore-btn"]').trigger("click");
    await waitFor(() => wrapper!.find('[data-testid="column-待處理"]').text().includes("提醒A"));
  });

  it("does not show cancel/restore controls for an already-closed reminder", async () => {
    const reminder = service.createReminder({ createdBy: "小美", assignedTo: "阿凱", title: "提醒A" });
    service.closeReminder(reminder.id);

    wrapper = mount(KanbanBoard, { props: { apiBaseUrl: baseUrl, currentAccount } });
    await waitFor(() => !wrapper!.find('[data-testid="loading"]').exists());
    await wrapper.find(`[data-testid="recently-completed-card-${reminder.id}"]`).trigger("click");
    await waitFor(() => !wrapper!.find('[data-testid="detail-loading"]').exists());

    expect(wrapper!.find('[data-testid="reminder-cancel-btn"]').exists()).toBe(false);
    expect(wrapper!.find('[data-testid="reminder-restore-btn"]').exists()).toBe(false);
  });
});
