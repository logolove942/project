import { mount, type VueWrapper } from "@vue/test-utils";
import type { Server } from "node:http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp as createExpressApp } from "../../../src/api/app.js";
import { closeServer, listenOnEphemeralPort } from "../../../src/api/testHelpers.js";
import { createTaskService, type TaskService } from "../../../src/domain/taskService.js";
import { loginForTest, registerAccountForTest, waitFor } from "../testSupport";
import type { Account } from "../types";
import KanbanBoard from "./KanbanBoard.vue";

describe("KanbanBoard - 詳情面板：任務編輯（issue #55）", () => {
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
    currentAccount = await loginForTest(baseUrl); // 第一個註冊的帳號 -> 管理職
    await registerAccountForTest(baseUrl, "阿凱");
    await registerAccountForTest(baseUrl, "小美");
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
    await waitFor(() => wrapper!.find('[data-testid="task-edit-btn"]').exists());
    await wrapper!.find('[data-testid="task-edit-btn"]').trigger("click");
    await waitFor(() => wrapper!.find('[data-testid="task-edit-spec"]').findAll("option").length > 1);
  }

  it("shows the 編輯任務 button for a 管理職 viewer", async () => {
    const task = service.createTask(specId, {
      type: "開發任務",
      title: "任務A",
      assignees: [{ person: "小美" }],
    });
    await mountAndSelect(task.id);

    expect(wrapper!.find('[data-testid="task-edit-btn"]').exists()).toBe(true);
  });

  it("hides the 編輯任務 button for a 一般同仁 viewer", async () => {
    const task = service.createTask(specId, {
      type: "開發任務",
      title: "任務A",
      assignees: [{ person: "小美" }],
    });
    currentAccount = await loginForTest(baseUrl, "小美"); // 第二個註冊的帳號 -> 一般同仁
    await mountAndSelect(task.id);

    expect(wrapper!.find('[data-testid="task-edit-btn"]').exists()).toBe(false);
  });

  it("does not show a 編輯任務 button for a reminder", async () => {
    const reminder = service.createReminder({ createdBy: "小美", assignedTo: "阿凱", title: "提醒A" });
    await mountAndSelect(reminder.id);

    expect(wrapper!.find('[data-testid="task-edit-btn"]').exists()).toBe(false);
  });

  it("loads the edit form pre-filled with the task's current values", async () => {
    const task = service.createTask(specId, {
      type: "開發任務",
      title: "任務A",
      assignees: [{ person: "小美" }],
      priority: "高",
      dueDate: "2026-08-15",
    });
    await mountAndSelect(task.id);
    await openEditForm();

    expect((wrapper!.find('[data-testid="task-edit-title"]').element as HTMLInputElement).value).toBe("任務A");
    expect((wrapper!.find('[data-testid="task-edit-priority"]').element as HTMLSelectElement).value).toBe("高");
    expect((wrapper!.find('[data-testid="task-edit-duedate"]').element as HTMLInputElement).value).toBe(
      "2026-08-15",
    );
    expect((wrapper!.find('[data-testid="task-edit-assignee-0"]').element as HTMLSelectElement).value).toBe(
      "小美",
    );
  });

  it("edits a task's title and reflects it live on the board's card", async () => {
    const task = service.createTask(specId, {
      type: "開發任務",
      title: "舊標題",
      assignees: [{ person: "小美" }],
    });
    await mountAndSelect(task.id);
    await openEditForm();

    await wrapper!.find('[data-testid="task-edit-title"]').setValue("新標題");
    await wrapper!.find('[data-testid="task-edit-form"]').trigger("submit");

    await waitFor(() => wrapper!.find('[data-testid="column-待處理"]').text().includes("新標題"));
    expect(wrapper!.find('[data-testid="column-待處理"]').text()).not.toContain("舊標題");
  });

  it("adds an assignee via the add-row control and saves it", async () => {
    const task = service.createTask(specId, {
      type: "開發任務",
      title: "任務A",
      assignees: [{ person: "小美" }],
    });
    await mountAndSelect(task.id);
    await openEditForm();

    await wrapper!.find('[data-testid="task-edit-add-assignee"]').trigger("click");
    await wrapper!.find('[data-testid="task-edit-assignee-1"]').setValue("阿凱");
    await wrapper!.find('[data-testid="task-edit-form"]').trigger("submit");

    await waitFor(() => !wrapper!.find('[data-testid="task-edit-form"]').exists());
    expect(service.getTask(task.id).assignees.map((a) => a.person)).toEqual(
      expect.arrayContaining(["小美", "阿凱"]),
    );
  });

  it("keeps a removed assignee's work log after saving without them", async () => {
    const task = service.createTask(specId, {
      type: "開發任務",
      title: "任務A",
      assignees: [{ person: "小美" }, { person: "阿凱" }],
    });
    service.logWork(task.id, { person: "小美", date: "2026-07-24", hours: 3 });
    await mountAndSelect(task.id);
    await openEditForm();

    await wrapper!.find('[data-testid="task-edit-remove-assignee-0"]').trigger("click");
    await wrapper!.find('[data-testid="task-edit-form"]').trigger("submit");

    await waitFor(() => !wrapper!.find('[data-testid="task-edit-form"]').exists());
    expect(service.getTask(task.id).assignees.map((a) => a.person)).toEqual(["阿凱"]);
    expect(service.getWorkLogs(task.id).map((l) => l.person)).toEqual(["小美"]);
  });

  it("moves a task to a different spec", async () => {
    const task = service.createTask(specId, {
      type: "開發任務",
      title: "任務A",
      assignees: [{ person: "小美" }],
    });
    await mountAndSelect(task.id);
    await openEditForm();

    await wrapper!.find('[data-testid="task-edit-spec"]').setValue(otherSpecId);
    await wrapper!.find('[data-testid="task-edit-form"]').trigger("submit");

    await waitFor(() => !wrapper!.find('[data-testid="task-edit-form"]').exists());
    expect(service.getTask(task.id).specId).toBe(otherSpecId);
  });

  it("shows an inline error, not a browser alert, when clearing all assignees", async () => {
    const alertSpy = vi.spyOn(window, "alert");
    const task = service.createTask(specId, {
      type: "開發任務",
      title: "任務A",
      assignees: [{ person: "小美" }],
    });
    await mountAndSelect(task.id);
    await openEditForm();

    await wrapper!.find('[data-testid="task-edit-assignee-0"]').setValue("");
    await wrapper!.find('[data-testid="task-edit-form"]').trigger("submit");

    await waitFor(() => wrapper!.find('[data-testid="task-edit-error"]').exists());
    expect(alertSpy).not.toHaveBeenCalled();
    expect(service.getTask(task.id).assignees.map((a) => a.person)).toEqual(["小美"]);
  });

  it("cancels the edit form without saving anything", async () => {
    const task = service.createTask(specId, {
      type: "開發任務",
      title: "任務A",
      assignees: [{ person: "小美" }],
    });
    await mountAndSelect(task.id);
    await openEditForm();

    await wrapper!.find('[data-testid="task-edit-title"]').setValue("不要儲存");
    await wrapper!.find('[data-testid="task-edit-cancel"]').trigger("click");

    expect(wrapper!.find('[data-testid="task-edit-form"]').exists()).toBe(false);
    expect(service.getTask(task.id).title).toBe("任務A");
  });
});
