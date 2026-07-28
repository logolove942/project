import { mount, type VueWrapper } from "@vue/test-utils";
import type { Server } from "node:http";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp as createExpressApp } from "../../../src/api/app.js";
import { closeServer, listenOnEphemeralPort } from "../../../src/api/testHelpers.js";
import { createTaskService, type TaskService } from "../../../src/domain/taskService.js";
import { loginForTest, registerAccountForTest, waitFor } from "../testSupport";
import type { Account } from "../types";
import KanbanBoard from "./KanbanBoard.vue";

describe("KanbanBoard - 月度工時摘要條", () => {
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
    await registerAccountForTest(baseUrl, "小美"); // issue #49：某位同仁下拉需要真的存在的帳號
  });

  afterEach(async () => {
    wrapper?.unmount();
    await closeServer(server);
  });

  async function mountAndWait() {
    wrapper = mount(KanbanBoard, { props: { apiBaseUrl: baseUrl, currentAccount } });
    await waitFor(() => !wrapper!.find('[data-testid="loading"]').exists());
    await waitFor(() => wrapper!.find('[data-testid="monthly-stats"]').exists());
  }

  it("shows monthly pending and logged hours for 全觀 scope", async () => {
    const task = service.createTask(specId, {
      type: "開發任務",
      title: "任務A",
      assignees: [{ person: "小美", estimatedHours: 10 }],
    });
    service.logWork(task.id, { person: "小美", date: new Date().toISOString().slice(0, 10), hours: 4 });

    await mountAndWait();

    expect(wrapper!.find('[data-testid="stat-pending-hours"]').text()).toBe("10h");
    expect(wrapper!.find('[data-testid="stat-logged-hours"]').text()).toBe("4h");
  });

  it("updates the stats when the identity scope changes", async () => {
    service.createTask(specId, {
      type: "開發任務",
      title: "任務A",
      assignees: [{ person: "小美", estimatedHours: 10 }],
    });
    service.createTask(specId, {
      type: "開發任務",
      title: "任務B",
      assignees: [{ person: "阿凱", estimatedHours: 5 }],
    });

    await mountAndWait();
    expect(wrapper!.find('[data-testid="stat-pending-hours"]').text()).toBe("15h");

    await wrapper!.find('[data-testid="scope-person-btn"]').trigger("click");
    await waitFor(() => wrapper!.find('[data-testid="scope-person-select"]').findAll("option").length > 1);
    await wrapper!.find('[data-testid="scope-person-select"]').setValue("小美");
    await wrapper!.find('[data-testid="scope-person-select"]').trigger("change");

    await waitFor(() => wrapper!.find('[data-testid="stat-pending-hours"]').text() === "10h");
  });

  it("excludes a completed task's estimated hours from pending hours", async () => {
    const task = service.createTask(specId, {
      type: "開發任務",
      title: "任務A",
      assignees: [{ person: "小美", estimatedHours: 10 }],
    });
    service.startTask(task.id);
    service.completeTask(task.id);

    await mountAndWait();

    expect(wrapper!.find('[data-testid="stat-pending-hours"]').text()).toBe("0h");
  });
});
