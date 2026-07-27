import { mount, type VueWrapper } from "@vue/test-utils";
import type { Server } from "node:http";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp as createExpressApp } from "../../../src/api/app.js";
import { closeServer, listenOnEphemeralPort } from "../../../src/api/testHelpers.js";
import { createTaskService, type TaskService } from "../../../src/domain/taskService.js";
import { loginForTest, waitFor } from "../testSupport";
import type { Account } from "../types";
import KanbanBoard from "./KanbanBoard.vue";

describe("KanbanBoard - 詳情面板：狀態下拉選單改狀態", () => {
  let service: TaskService;
  let server: Server;
  let baseUrl: string;
  let currentAccount: Account;
  let wrapper: VueWrapper | undefined;
  let specId: string;

  beforeEach(async () => {
    service = createTaskService();
    const requirement = service.createRequirement("R");
    const spec = service.createSpec(requirement.id, "S");
    specId = spec.id;
    ({ server, baseUrl } = await listenOnEphemeralPort(createExpressApp(service)));
    currentAccount = await loginForTest(baseUrl);
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

  it("shows the task's four status options in the dropdown", async () => {
    const task = service.createTask(specId, {
      type: "開發任務",
      title: "任務A",
      assignees: [{ person: "小美" }],
    });
    await mountAndSelect(task.id);

    const options = wrapper!.find('[data-testid="status-select"]').findAll("option").map((o) => o.text());
    expect(options).toEqual(["待處理", "進行中", "暫停", "完成"]);
  });

  it("shows the reminder's two status options in the dropdown", async () => {
    const reminder = service.createReminder({ createdBy: "小美", assignedTo: "阿凱", title: "提醒A" });
    await mountAndSelect(reminder.id);

    const options = wrapper!.find('[data-testid="status-select"]').findAll("option").map((o) => o.text());
    expect(options).toEqual(["未處理", "已結案"]);
  });

  it("changes a task's status via the dropdown and reflects it on the board", async () => {
    const task = service.createTask(specId, {
      type: "開發任務",
      title: "任務A",
      assignees: [{ person: "小美" }],
    });
    await mountAndSelect(task.id);

    await wrapper!.find('[data-testid="status-select"]').setValue("進行中");
    await waitFor(() => wrapper!.find('[data-testid="column-進行中"]').text().includes("任務A"));

    expect(wrapper!.find('[data-testid="column-待處理"]').text()).not.toContain("任務A");
  });

  it("shows an error and does not silently succeed for an illegal transition", async () => {
    const task = service.createTask(specId, {
      type: "開發任務",
      title: "任務A",
      assignees: [{ person: "小美" }],
    });
    await mountAndSelect(task.id);

    // 待處理 -> 完成 沒有對應的操作
    await wrapper!.find('[data-testid="status-select"]').setValue("完成");
    await waitFor(() => wrapper!.find('[data-testid="status-error"]').exists());

    expect(wrapper!.find('[data-testid="column-待處理"]').text()).toContain("任務A");
  });

  it("closes a reminder via the dropdown", async () => {
    const reminder = service.createReminder({ createdBy: "小美", assignedTo: "阿凱", title: "提醒A" });
    await mountAndSelect(reminder.id);

    await wrapper!.find('[data-testid="status-select"]').setValue("已結案");
    await waitFor(() => !wrapper!.find(`[data-testid="card-${reminder.id}"]`).exists());
  });
});
