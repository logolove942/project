import { mount, type VueWrapper } from "@vue/test-utils";
import type { Server } from "node:http";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp as createExpressApp } from "../../../src/api/app.js";
import { closeServer, listenOnEphemeralPort } from "../../../src/api/testHelpers.js";
import { createTaskService, type TaskService } from "../../../src/domain/taskService.js";
import { loginForTest, registerAccountForTest, waitFor } from "../testSupport";
import type { Account } from "../types";
import KanbanBoard from "./KanbanBoard.vue";

describe("KanbanBoard - 快速新增提醒/雜事", () => {
  let service: TaskService;
  let server: Server;
  let baseUrl: string;
  let wrapper: VueWrapper | undefined;

  beforeEach(async () => {
    service = createTaskService();
    ({ server, baseUrl } = await listenOnEphemeralPort(createExpressApp(service)));
  });

  afterEach(async () => {
    wrapper?.unmount();
    await closeServer(server);
  });

  // issue #49：身分就是登入帳號，不再是自由輸入的「我是」——用這個名字登入即可。
  async function mountAndSetViewer(viewer: string) {
    const currentAccount: Account = await loginForTest(baseUrl, viewer, "pw");
    wrapper = mount(KanbanBoard, { props: { apiBaseUrl: baseUrl, currentAccount } });
    await waitFor(() => !wrapper!.find('[data-testid="loading"]').exists());
  }

  it("creates a personal chore for the viewer with just a title", async () => {
    await mountAndSetViewer("小美");

    await wrapper!.find('[data-testid="quick-add-reminder-btn"]').trigger("click");
    await wrapper!.find('[data-testid="quick-add-reminder-title"]').setValue("寄送季報");
    await wrapper!.find('[data-testid="quick-add-reminder-form"]').trigger("submit");

    await waitFor(() => wrapper!.text().includes("寄送季報"));
    expect(wrapper!.find('[data-testid="quick-add-reminder-form"]').exists()).toBe(false);
  });

  it("creates a reminder assigned to someone else, linked to a spec", async () => {
    const requirement = service.createRequirement("需求A");
    const spec = service.createSpec(requirement.id, "規格A");
    await registerAccountForTest(baseUrl, "阿凱"); // issue #50：對象下拉需要真的存在的帳號
    await mountAndSetViewer("小美");

    await wrapper!.find('[data-testid="quick-add-reminder-btn"]').trigger("click");
    await wrapper!.find('[data-testid="quick-add-reminder-title"]').setValue("規格欄位確認");
    await waitFor(
      () => wrapper!.find('[data-testid="quick-add-reminder-assignee"]').findAll("option").length > 1,
    );
    await wrapper!.find('[data-testid="quick-add-reminder-assignee"]').setValue("阿凱");
    await waitFor(() => wrapper!.find('[data-testid="quick-add-reminder-spec"]').findAll("option").length > 1);
    await wrapper!.find('[data-testid="quick-add-reminder-spec"]').setValue(spec.id);
    await wrapper!.find('[data-testid="quick-add-reminder-form"]').trigger("submit");

    await waitFor(() => wrapper!.text().includes("規格欄位確認"));

    const reminders = service.listRemindersVisibleTo("阿凱");
    const created = reminders.find((r) => r.title === "規格欄位確認");
    expect(created?.assignedTo).toBe("阿凱");
    expect(created?.specId).toBe(spec.id);
  });

  it("shows an inline error and keeps the form open on invalid input", async () => {
    await mountAndSetViewer("小美");

    await wrapper!.find('[data-testid="quick-add-reminder-btn"]').trigger("click");
    await wrapper!.find('[data-testid="quick-add-reminder-form"]').trigger("submit");

    await waitFor(() => wrapper!.find('[data-testid="quick-add-reminder-error"]').exists());
    expect(wrapper!.find('[data-testid="quick-add-reminder-form"]').exists()).toBe(true);
  });

  it("cancels without creating anything", async () => {
    await mountAndSetViewer("小美");

    await wrapper!.find('[data-testid="quick-add-reminder-btn"]').trigger("click");
    await wrapper!.find('[data-testid="quick-add-reminder-title"]').setValue("不要送出");
    await wrapper!.find('[data-testid="quick-add-reminder-cancel"]').trigger("click");

    expect(wrapper!.find('[data-testid="quick-add-reminder-form"]').exists()).toBe(false);
    expect(service.listRemindersVisibleTo("小美")).toHaveLength(0);
  });
});
