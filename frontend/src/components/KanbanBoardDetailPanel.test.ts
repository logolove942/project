import { mount, type VueWrapper } from "@vue/test-utils";
import type { Server } from "node:http";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp as createExpressApp } from "../../../src/api/app.js";
import { closeServer, listenOnEphemeralPort } from "../../../src/api/testHelpers.js";
import { createTaskService, type TaskService } from "../../../src/domain/taskService.js";
import { today } from "../dateUtils";
import { loginForTest, registerAccountForTest, waitFor } from "../testSupport";
import type { Account } from "../types";
import KanbanBoard from "./KanbanBoard.vue";

describe("KanbanBoard - 詳情面板：檢視資訊＋報工", () => {
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
    currentAccount = await loginForTest(baseUrl);
    await registerAccountForTest(baseUrl, "小美"); // issue #50：報工人員下拉需要真的存在的帳號
  });

  afterEach(async () => {
    wrapper?.unmount();
    await closeServer(server);
  });

  async function mountAndWait() {
    wrapper = mount(KanbanBoard, { props: { apiBaseUrl: baseUrl, currentAccount } });
    await waitFor(() => !wrapper!.find('[data-testid="loading"]').exists());
  }

  it("does not show the detail panel until a card is clicked", async () => {
    service.createTask(specId, {
      type: "開發任務",
      title: "任務A",
      assignees: [{ person: "小美" }],
    });
    await mountAndWait();

    expect(wrapper!.find('[data-testid="detail-panel"]').exists()).toBe(false);
  });

  it("opens the detail panel with the task's info and spec link when a task card is clicked", async () => {
    const task = service.createTask(specId, {
      type: "開發任務",
      title: "任務A",
      assignees: [{ person: "小美" }],
    });
    await mountAndWait();

    await wrapper!.find(`[data-testid="card-${task.id}"]`).trigger("click");
    await waitFor(() => !wrapper!.find('[data-testid="detail-loading"]').exists());

    expect(wrapper!.find('[data-testid="detail-panel"]').text()).toContain("任務A");
    expect(wrapper!.find('[data-testid="detail-spec"]').text()).toContain(specId);
  });

  it("opens the detail panel for a reminder without a spec link", async () => {
    const reminder = service.createReminder({
      createdBy: "小美",
      assignedTo: "阿凱",
      title: "提醒A",
    });
    await mountAndWait();

    await wrapper!.find(`[data-testid="card-${reminder.id}"]`).trigger("click");
    await waitFor(() => !wrapper!.find('[data-testid="detail-loading"]').exists());

    expect(wrapper!.find('[data-testid="detail-panel"]').text()).toContain("提醒A");
    expect(wrapper!.find('[data-testid="detail-no-spec"]').exists()).toBe(true);
  });

  it("shows existing work logs in the panel", async () => {
    const task = service.createTask(specId, {
      type: "開發任務",
      title: "任務A",
      assignees: [{ person: "小美" }],
    });
    service.logWork(task.id, { person: "小美", date: "2026-07-24", hours: 3, note: "初步開發" });
    await mountAndWait();

    await wrapper!.find(`[data-testid="card-${task.id}"]`).trigger("click");
    await waitFor(() => !wrapper!.find('[data-testid="detail-loading"]').exists());

    expect(wrapper!.find('[data-testid="worklog-list"]').text()).toContain("初步開發");
  });

  it("shows a message when there are no work logs yet", async () => {
    const task = service.createTask(specId, {
      type: "開發任務",
      title: "任務A",
      assignees: [{ person: "小美" }],
    });
    await mountAndWait();

    await wrapper!.find(`[data-testid="card-${task.id}"]`).trigger("click");
    await waitFor(() => !wrapper!.find('[data-testid="detail-loading"]').exists());

    expect(wrapper!.find('[data-testid="worklog-empty"]').exists()).toBe(true);
  });

  // 報工表單預設：人員＝自己、日期＝今天、時數＝1 小時（使用者反饋：大部分報工都是「自己剛做完的事」）。
  it("defaults the work-log form to self / today / 1 hour, without touching it", async () => {
    const task = service.createTask(specId, {
      type: "開發任務",
      title: "任務A",
      assignees: [{ person: "小美" }],
    });
    await mountAndWait();

    await wrapper!.find(`[data-testid="card-${task.id}"]`).trigger("click");
    await waitFor(() => !wrapper!.find('[data-testid="detail-loading"]').exists());

    expect((wrapper!.find('[data-testid="worklog-person"]').element as HTMLSelectElement).value).toBe(
      currentAccount.name,
    );
    expect((wrapper!.find('[data-testid="worklog-date"]').element as HTMLInputElement).value).toBe(today());
    expect((wrapper!.find('[data-testid="worklog-hours"]').element as HTMLInputElement).value).toBe("1");
  });

  it("resets the work-log form back to the defaults (not blank) after a successful submit", async () => {
    const task = service.createTask(specId, {
      type: "開發任務",
      title: "任務A",
      assignees: [{ person: "小美" }],
    });
    await mountAndWait();

    await wrapper!.find(`[data-testid="card-${task.id}"]`).trigger("click");
    await waitFor(() => !wrapper!.find('[data-testid="detail-loading"]').exists());

    await wrapper!.find('[data-testid="worklog-person"]').setValue("小美");
    await wrapper!.find('[data-testid="worklog-hours"]').setValue("3");
    await wrapper!.find("form").trigger("submit");
    await waitFor(() => !wrapper!.find('[data-testid="worklog-empty"]').exists());

    expect((wrapper!.find('[data-testid="worklog-person"]').element as HTMLSelectElement).value).toBe(
      currentAccount.name,
    );
    expect((wrapper!.find('[data-testid="worklog-hours"]').element as HTMLInputElement).value).toBe("1");
  });

  it("adds a work log through the form and shows it in the list", async () => {
    const task = service.createTask(specId, {
      type: "開發任務",
      title: "任務A",
      assignees: [{ person: "小美" }],
    });
    await mountAndWait();

    await wrapper!.find(`[data-testid="card-${task.id}"]`).trigger("click");
    await waitFor(() => !wrapper!.find('[data-testid="detail-loading"]').exists());

    await wrapper!.find('[data-testid="worklog-person"]').setValue("小美");
    await wrapper!.find('[data-testid="worklog-date"]').setValue("2026-07-27");
    await wrapper!.find('[data-testid="worklog-hours"]').setValue("2.5");
    await wrapper!.find('[data-testid="worklog-note"]').setValue("加班處理");
    await wrapper!.find("form").trigger("submit");

    await waitFor(() => !wrapper!.find('[data-testid="worklog-empty"]').exists());
    expect(wrapper!.find('[data-testid="worklog-list"]').text()).toContain("加班處理");
  });

  it("closes the detail panel when the close button is clicked", async () => {
    const task = service.createTask(specId, {
      type: "開發任務",
      title: "任務A",
      assignees: [{ person: "小美" }],
    });
    await mountAndWait();

    await wrapper!.find(`[data-testid="card-${task.id}"]`).trigger("click");
    await waitFor(() => wrapper!.find('[data-testid="detail-panel"]').exists());

    await wrapper!.find('[data-testid="detail-close"]').trigger("click");
    expect(wrapper!.find('[data-testid="detail-panel"]').exists()).toBe(false);
  });
});
