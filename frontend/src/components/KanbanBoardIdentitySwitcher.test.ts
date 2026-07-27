import { mount, type VueWrapper } from "@vue/test-utils";
import type { Server } from "node:http";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp as createExpressApp } from "../../../src/api/app.js";
import { closeServer, listenOnEphemeralPort } from "../../../src/api/testHelpers.js";
import { createTaskService, type TaskService } from "../../../src/domain/taskService.js";
import { loginForTest, registerAccountForTest, waitFor } from "../testSupport";
import KanbanBoard from "./KanbanBoard.vue";

describe("KanbanBoard - 身分切換（我/同仁/全觀）＋全觀擁有者標籤", () => {
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

  // issue #49：身分就是登入帳號——用哪個名字登入，viewerName 就是誰；不再是掛載後可自由輸入的欄位。
  async function mountAndWait(viewerName = "test-user") {
    const currentAccount = await loginForTest(baseUrl, viewerName, "pw");
    wrapper = mount(KanbanBoard, { props: { apiBaseUrl: baseUrl, currentAccount } });
    await waitFor(() => !wrapper!.find('[data-testid="loading"]').exists());
  }

  it("defaults to 全觀 (all) scope, showing everyone's tasks", async () => {
    const xiaomeiTask = service.createTask(specId, {
      type: "開發任務",
      title: "小美的任務",
      assignees: [{ person: "小美" }],
    });
    const aKaiTask = service.createTask(specId, {
      type: "開發任務",
      title: "阿凱的任務",
      assignees: [{ person: "阿凱" }],
    });
    await mountAndWait();

    expect(wrapper!.find(`[data-testid="card-${xiaomeiTask.id}"]`).exists()).toBe(true);
    expect(wrapper!.find(`[data-testid="card-${aKaiTask.id}"]`).exists()).toBe(true);
  });

  it("scopes to a single person when 某位同仁 is selected", async () => {
    const xiaomeiTask = service.createTask(specId, {
      type: "開發任務",
      title: "小美的任務",
      assignees: [{ person: "小美" }],
    });
    const aKaiTask = service.createTask(specId, {
      type: "開發任務",
      title: "阿凱的任務",
      assignees: [{ person: "阿凱" }],
    });
    await registerAccountForTest(baseUrl, "小美"); // issue #49：某位同仁下拉需要真的存在的帳號
    await mountAndWait();

    await wrapper!.find('[data-testid="scope-person-btn"]').trigger("click");
    await waitFor(() => wrapper!.find('[data-testid="scope-person-select"]').findAll("option").length > 1);
    await wrapper!.find('[data-testid="scope-person-select"]').setValue("小美");
    await wrapper!.find('[data-testid="scope-person-select"]').trigger("change");
    // xiaomei 的卡片一開始（全觀）就在，等阿凱的卡片消失才代表重新查詢真的發生了
    await waitFor(() => !wrapper!.find(`[data-testid="card-${aKaiTask.id}"]`).exists());

    expect(wrapper!.find(`[data-testid="card-${xiaomeiTask.id}"]`).exists()).toBe(true);
  });

  it("shows only the viewer's own chores when 我 is selected", async () => {
    const myChore = service.createReminder({ createdBy: "小美", assignedTo: "小美", title: "我的雜事" });
    const othersChore = service.createReminder({
      createdBy: "阿凱",
      assignedTo: "阿凱",
      title: "阿凱的雜事",
    });
    await mountAndWait("小美");

    await wrapper!.find('[data-testid="scope-self"]').trigger("click");
    await waitFor(() => wrapper!.find(`[data-testid="card-${myChore.id}"]`).exists());

    expect(wrapper!.find(`[data-testid="card-${othersChore.id}"]`).exists()).toBe(false);
  });

  it("hides another person's unreported chore even in 全觀 scope", async () => {
    const chore = service.createReminder({ createdBy: "小美", assignedTo: "小美", title: "雜事" });
    await mountAndWait();

    expect(wrapper!.find(`[data-testid="card-${chore.id}"]`).exists()).toBe(false);
  });

  it("reveals a chore in 全觀 scope once it has been worked on", async () => {
    const chore = service.createReminder({ createdBy: "小美", assignedTo: "小美", title: "雜事" });
    service.logReminderWork(chore.id, { person: "小美", date: "2026-07-27", hours: 1 });
    await mountAndWait();

    expect(wrapper!.find(`[data-testid="card-${chore.id}"]`).exists()).toBe(true);
  });

  it("always shows tasks regardless of the identity switcher (ADR-0001)", async () => {
    const task = service.createTask(specId, {
      type: "開發任務",
      title: "任務A",
      assignees: [{ person: "小美" }],
    });
    await mountAndWait("阿凱");

    await wrapper!.find('[data-testid="scope-self"]').trigger("click");
    await waitFor(() => wrapper!.find(`[data-testid="loading"]`).exists() === false);

    expect(wrapper!.find(`[data-testid="card-${task.id}"]`).exists()).toBe(true);
  });

  it("shows an owner tag on each card in 全觀 scope", async () => {
    const task = service.createTask(specId, {
      type: "開發任務",
      title: "任務A",
      assignees: [{ person: "小美" }],
    });
    await mountAndWait();

    expect(wrapper!.find(`[data-testid="owner-${task.id}"]`).text()).toContain("小美");
  });
});
