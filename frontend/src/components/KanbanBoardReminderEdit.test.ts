import { mount, type VueWrapper } from "@vue/test-utils";
import type { Server } from "node:http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp as createExpressApp } from "../../../src/api/app.js";
import { closeServer, listenOnEphemeralPort } from "../../../src/api/testHelpers.js";
import { createTaskService, type TaskService } from "../../../src/domain/taskService.js";
import { loginForTest, registerAccountForTest, waitFor } from "../testSupport";
import type { Account } from "../types";
import KanbanBoard from "./KanbanBoard.vue";

describe("KanbanBoard - 詳情面板：提醒編輯（issue #58）", () => {
  let service: TaskService;
  let server: Server;
  let baseUrl: string;
  let currentAccount: Account;
  let wrapper: VueWrapper | undefined;
  let specId: string;
  let otherSpecId: string;

  beforeEach(async () => {
    service = createTaskService();
    const requirement = service.createRequirement("R", "測試描述");
    const spec = service.createSpec(requirement.id, "S", "測試描述");
    specId = spec.id;
    const otherSpec = service.createSpec(requirement.id, "另一個規格", "測試描述");
    otherSpecId = otherSpec.id;
    ({ server, baseUrl } = await listenOnEphemeralPort(createExpressApp(service)));
    currentAccount = await loginForTest(baseUrl, "小美");
    await registerAccountForTest(baseUrl, "阿凱");
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

  async function openEditForm() {
    await waitFor(() => wrapper!.find('[data-testid="reminder-edit-btn"]').exists());
    await wrapper!.find('[data-testid="reminder-edit-btn"]').trigger("click");
    await waitFor(() => wrapper!.find('[data-testid="reminder-edit-spec"]').findAll("option").length > 1);
  }

  it("shows the 編輯提醒 button for the reminder's creator", async () => {
    const reminder = service.createReminder({ createdBy: "小美", assignedTo: "阿凱", title: "提醒A" });
    await mountAndSelect(reminder.id);

    expect(wrapper!.find('[data-testid="reminder-edit-btn"]').exists()).toBe(true);
  });

  it("shows the 編輯提醒 button for the reminder's assignee", async () => {
    const reminder = service.createReminder({ createdBy: "阿凱", assignedTo: "小美", title: "提醒A" });
    await mountAndSelect(reminder.id);

    expect(wrapper!.find('[data-testid="reminder-edit-btn"]').exists()).toBe(true);
  });

  it("hides the 編輯提醒 button for someone who is neither the creator nor the assignee", async () => {
    const reminder = service.createReminder({ createdBy: "阿凱", assignedTo: "阿明", title: "提醒A" });
    await mountAndSelect(reminder.id);

    expect(wrapper!.find('[data-testid="reminder-edit-btn"]').exists()).toBe(false);
  });

  it("does not show a 編輯提醒 button on a task's detail panel", async () => {
    const task = service.createTask(specId, {
      type: "開發任務",
      title: "任務A",
      assignees: [{ person: "小美" }],
    });
    await mountAndSelect(task.id);

    expect(wrapper!.find('[data-testid="reminder-edit-btn"]').exists()).toBe(false);
  });

  it("loads the edit form pre-filled with the reminder's current values", async () => {
    const reminder = service.createReminder({
      createdBy: "小美",
      assignedTo: "阿凱",
      title: "提醒A",
      specId,
      priority: "高",
      dueDate: "2026-08-15",
    });
    await mountAndSelect(reminder.id);
    await openEditForm();

    expect((wrapper!.find('[data-testid="reminder-edit-title"]').element as HTMLInputElement).value).toBe("提醒A");
    expect((wrapper!.find('[data-testid="reminder-edit-assignee"]').element as HTMLSelectElement).value).toBe(
      "阿凱",
    );
    expect((wrapper!.find('[data-testid="reminder-edit-spec"]').element as HTMLSelectElement).value).toBe(specId);
    expect((wrapper!.find('[data-testid="reminder-edit-priority"]').element as HTMLSelectElement).value).toBe(
      "高",
    );
    expect((wrapper!.find('[data-testid="reminder-edit-duedate"]').element as HTMLInputElement).value).toBe(
      "2026-08-15",
    );
  });

  it("edits a reminder's title and reflects it live on the board's card", async () => {
    const reminder = service.createReminder({ createdBy: "小美", assignedTo: "阿凱", title: "舊標題" });
    await mountAndSelect(reminder.id);
    await openEditForm();

    await wrapper!.find('[data-testid="reminder-edit-title"]').setValue("新標題");
    await wrapper!.find('[data-testid="reminder-edit-form"]').trigger("submit");

    await waitFor(() => wrapper!.find('[data-testid="column-待處理"]').text().includes("新標題"));
    expect(wrapper!.find('[data-testid="column-待處理"]').text()).not.toContain("舊標題");
  });

  it("reassigns a reminder to a different person", async () => {
    const reminder = service.createReminder({ createdBy: "小美", assignedTo: "小美", title: "提醒A" });
    await mountAndSelect(reminder.id);
    await openEditForm();

    await wrapper!.find('[data-testid="reminder-edit-assignee"]').setValue("阿凱");
    await wrapper!.find('[data-testid="reminder-edit-form"]').trigger("submit");

    await waitFor(() => !wrapper!.find('[data-testid="reminder-edit-form"]').exists());
    expect(service.getReminder(reminder.id).assignedTo).toBe("阿凱");
  });

  it("moves a reminder to a different spec", async () => {
    const reminder = service.createReminder({ createdBy: "小美", assignedTo: "阿凱", title: "提醒A", specId });
    await mountAndSelect(reminder.id);
    await openEditForm();

    await wrapper!.find('[data-testid="reminder-edit-spec"]').setValue(otherSpecId);
    await wrapper!.find('[data-testid="reminder-edit-form"]').trigger("submit");

    await waitFor(() => !wrapper!.find('[data-testid="reminder-edit-form"]').exists());
    expect(service.getReminder(reminder.id).specId).toBe(otherSpecId);
  });

  it("shows an inline error, not a browser alert, when clearing the title", async () => {
    const alertSpy = vi.spyOn(window, "alert");
    const reminder = service.createReminder({ createdBy: "小美", assignedTo: "阿凱", title: "提醒A" });
    await mountAndSelect(reminder.id);
    await openEditForm();

    await wrapper!.find('[data-testid="reminder-edit-title"]').setValue("");
    await wrapper!.find('[data-testid="reminder-edit-form"]').trigger("submit");

    await waitFor(() => wrapper!.find('[data-testid="reminder-edit-error"]').exists());
    expect(alertSpy).not.toHaveBeenCalled();
    expect(service.getReminder(reminder.id).title).toBe("提醒A");
  });

  it("cancels the edit form without saving anything", async () => {
    const reminder = service.createReminder({ createdBy: "小美", assignedTo: "阿凱", title: "提醒A" });
    await mountAndSelect(reminder.id);
    await openEditForm();

    await wrapper!.find('[data-testid="reminder-edit-title"]').setValue("不要儲存");
    await wrapper!.find('[data-testid="reminder-edit-cancel"]').trigger("click");

    expect(wrapper!.find('[data-testid="reminder-edit-form"]').exists()).toBe(false);
    expect(service.getReminder(reminder.id).title).toBe("提醒A");
  });
});
