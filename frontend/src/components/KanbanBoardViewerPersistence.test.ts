import { mount, type VueWrapper } from "@vue/test-utils";
import type { Server } from "node:http";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp as createExpressApp } from "../../../src/api/app.js";
import { closeServer, listenOnEphemeralPort } from "../../../src/api/testHelpers.js";
import { createTaskService, type TaskService } from "../../../src/domain/taskService.js";
import { waitFor } from "../testSupport";
import KanbanBoard from "./KanbanBoard.vue";

describe("KanbanBoard - 記住「我是」的名字（localStorage）", () => {
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

  it("persists the viewer name across remounts", async () => {
    wrapper = mount(KanbanBoard, { props: { apiBaseUrl: baseUrl } });
    await waitFor(() => !wrapper!.find('[data-testid="loading"]').exists());

    await wrapper.find('[data-testid="viewer-input"]').setValue("小美");
    await wrapper.find('[data-testid="viewer-input"]').trigger("change");
    wrapper.unmount();

    // 模擬重新整理頁面：重新掛載元件
    wrapper = mount(KanbanBoard, { props: { apiBaseUrl: baseUrl } });
    await waitFor(() => !wrapper!.find('[data-testid="loading"]').exists());

    expect((wrapper.find('[data-testid="viewer-input"]').element as HTMLInputElement).value).toBe(
      "小美",
    );
  });

  it("starts with an empty viewer name when nothing was saved before", async () => {
    wrapper = mount(KanbanBoard, { props: { apiBaseUrl: baseUrl } });
    await waitFor(() => !wrapper!.find('[data-testid="loading"]').exists());

    expect((wrapper.find('[data-testid="viewer-input"]').element as HTMLInputElement).value).toBe(
      "",
    );
  });
});
