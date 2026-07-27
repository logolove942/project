import { mount, type VueWrapper } from "@vue/test-utils";
import type { Server } from "node:http";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp as createExpressApp } from "../../../src/api/app.js";
import { closeServer, listenOnEphemeralPort } from "../../../src/api/testHelpers.js";
import { createTaskService, type TaskService } from "../../../src/domain/taskService.js";
import { waitFor } from "../testSupport";
import KanbanBoard from "./KanbanBoard.vue";

describe("KanbanBoard - 詳情面板：提醒升級為正式任務", () => {
  let service: TaskService;
  let server: Server;
  let baseUrl: string;
  let wrapper: VueWrapper | undefined;
  let specId: string;

  beforeEach(async () => {
    service = createTaskService();
    const requirement = service.createRequirement("R");
    const spec = service.createSpec(requirement.id, "S");
    specId = spec.id;
    ({ server, baseUrl } = await listenOnEphemeralPort(createExpressApp(service)));
  });

  afterEach(async () => {
    wrapper?.unmount();
    await closeServer(server);
  });

  async function mountAndSelect(itemId: string) {
    wrapper = mount(KanbanBoard, { props: { apiBaseUrl: baseUrl } });
    await waitFor(() => !wrapper!.find('[data-testid="loading"]').exists());
    await wrapper.find(`[data-testid="card-${itemId}"]`).trigger("click");
    await waitFor(() => !wrapper!.find('[data-testid="detail-loading"]').exists());
  }

  it("shows the promote button for a reminder", async () => {
    const reminder = service.createReminder({ createdBy: "小美", assignedTo: "阿凱", title: "提醒A" });
    await mountAndSelect(reminder.id);

    expect(wrapper!.find('[data-testid="promote-btn"]').exists()).toBe(true);
  });

  it("does not show the promote button for a task", async () => {
    const task = service.createTask(specId, {
      type: "開發任務",
      title: "任務A",
      assignees: [{ person: "小美" }],
    });
    await mountAndSelect(task.id);

    expect(wrapper!.find('[data-testid="promote-btn"]').exists()).toBe(false);
  });

  it("promotes a reminder into a task and switches the panel to show the new task's status options", async () => {
    const reminder = service.createReminder({
      createdBy: "小美",
      assignedTo: "阿凱",
      title: "規格書欄位代號寫錯",
    });
    await mountAndSelect(reminder.id);

    await wrapper!.find('[data-testid="promote-btn"]').trigger("click");
    await wrapper!.find('[data-testid="promote-spec"]').setValue(specId);
    await wrapper!.find('[data-testid="promote-assignee"]').setValue("阿凱");
    await wrapper!.find('[data-testid="promote-form"]').trigger("submit");

    await waitFor(() => {
      const select = wrapper!.find('[data-testid="status-select"]');
      return select.exists() && select.findAll("option").length === 4;
    });

    const options = wrapper!.find('[data-testid="status-select"]').findAll("option").map((o) => o.text());
    expect(options).toEqual(["待處理", "進行中", "暫停", "完成"]);
  });

  it("removes the original reminder card from the board after promotion", async () => {
    const reminder = service.createReminder({
      createdBy: "小美",
      assignedTo: "阿凱",
      title: "規格書欄位代號寫錯",
    });
    await mountAndSelect(reminder.id);

    await wrapper!.find('[data-testid="promote-btn"]').trigger("click");
    await wrapper!.find('[data-testid="promote-spec"]').setValue(specId);
    await wrapper!.find('[data-testid="promote-assignee"]').setValue("阿凱");
    await wrapper!.find('[data-testid="promote-form"]').trigger("submit");

    await waitFor(() => !wrapper!.find(`[data-testid="card-${reminder.id}"]`).exists());
    expect(wrapper!.find('[data-testid="column-待處理"]').text()).toContain("規格書欄位代號寫錯");
  });

  it("shows an error when promoting into a non-existent spec", async () => {
    const reminder = service.createReminder({ createdBy: "小美", assignedTo: "阿凱", title: "提醒A" });
    await mountAndSelect(reminder.id);

    await wrapper!.find('[data-testid="promote-btn"]').trigger("click");
    await wrapper!.find('[data-testid="promote-spec"]').setValue("missing-spec");
    await wrapper!.find('[data-testid="promote-assignee"]').setValue("阿凱");
    await wrapper!.find('[data-testid="promote-form"]').trigger("submit");

    await waitFor(() => wrapper!.find('[data-testid="promote-error"]').exists());
    // 升級失敗，提醒還在（表單仍展開，不是「未處理」的提醒被換成任務了）
    expect(wrapper!.find('[data-testid="status-select"]').findAll("option")).toHaveLength(2);
  });
});
