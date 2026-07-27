import { mount, type VueWrapper } from "@vue/test-utils";
import type { Server } from "node:http";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp as createExpressApp } from "../../../src/api/app.js";
import { closeServer, listenOnEphemeralPort } from "../../../src/api/testHelpers.js";
import { createTaskService, type TaskService } from "../../../src/domain/taskService.js";
import { waitFor } from "../testSupport";
import KanbanBoard from "./KanbanBoard.vue";

describe("KanbanBoard - 拖曳卡片改狀態", () => {
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

  async function mountAndWait() {
    wrapper = mount(KanbanBoard, { props: { apiBaseUrl: baseUrl } });
    await waitFor(() => !wrapper!.find('[data-testid="loading"]').exists());
  }

  async function drag(cardTestId: string, columnTestId: string) {
    await wrapper!.find(`[data-testid="${cardTestId}"]`).trigger("dragstart");
    await wrapper!.find(`[data-testid="${columnTestId}"]`).trigger("drop");
  }

  it("dragging a 待處理 task to 進行中 starts it", async () => {
    const task = service.createTask(specId, {
      type: "開發任務",
      title: "任務A",
      assignees: [{ person: "小美" }],
    });
    await mountAndWait();

    await drag(`card-${task.id}`, "column-進行中");
    await waitFor(() => wrapper!.find(`[data-testid="column-進行中"]`).text().includes("任務A"));

    expect(wrapper!.find(`[data-testid="column-待處理"]`).text()).not.toContain("任務A");
  });

  it("dragging a 進行中 task to 暫停 pauses it", async () => {
    const task = service.createTask(specId, {
      type: "開發任務",
      title: "任務A",
      assignees: [{ person: "小美" }],
    });
    service.startTask(task.id);
    await mountAndWait();

    await drag(`card-${task.id}`, "column-暫停");
    await waitFor(() => wrapper!.find(`[data-testid="column-暫停"]`).text().includes("任務A"));

    expect(wrapper!.find(`[data-testid="column-進行中"]`).text()).not.toContain("任務A");
  });

  it("dragging a 暫停 task (paused from 進行中) back to 進行中 resumes it", async () => {
    const task = service.createTask(specId, {
      type: "開發任務",
      title: "任務A",
      assignees: [{ person: "小美" }],
    });
    service.startTask(task.id);
    service.pauseTask(task.id);
    await mountAndWait();

    await drag(`card-${task.id}`, "column-進行中");
    await waitFor(() => wrapper!.find(`[data-testid="column-進行中"]`).text().includes("任務A"));
  });

  it("ignores an illegal drag (進行中 straight to 待處理) — the card stays put", async () => {
    const task = service.createTask(specId, {
      type: "開發任務",
      title: "任務A",
      assignees: [{ person: "小美" }],
    });
    service.startTask(task.id);
    await mountAndWait();

    await drag(`card-${task.id}`, "column-待處理");

    // no API call should have succeeded/changed anything — card remains in 進行中
    expect(wrapper!.find(`[data-testid="column-進行中"]`).text()).toContain("任務A");
    expect(wrapper!.find(`[data-testid="column-待處理"]`).text()).not.toContain("任務A");
  });

  it("does not allow dragging a reminder card", async () => {
    service.createReminder({ createdBy: "小美", assignedTo: "阿凱", title: "提醒A" });
    await mountAndWait();

    const card = wrapper!.findAll(".card").find((c) => c.text().includes("提醒A"))!;
    expect(card.attributes("draggable")).toBe("false");
  });

  it("shows a complete button on 進行中 tasks and completing removes it from the board", async () => {
    const task = service.createTask(specId, {
      type: "開發任務",
      title: "任務A",
      assignees: [{ person: "小美" }],
    });
    service.startTask(task.id);
    await mountAndWait();

    await wrapper!.find(`[data-testid="complete-${task.id}"]`).trigger("click");
    await waitFor(() => !wrapper!.find(`[data-testid="card-${task.id}"]`).exists());
  });
});
