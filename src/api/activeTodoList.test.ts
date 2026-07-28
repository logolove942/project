import type { Server } from "node:http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTaskService, type TaskService } from "../domain/taskService.js";
import { createApp } from "./app.js";
import { closeServer, createAuthedFetch, listenOnEphemeralPort, readJson, registerAndLogin } from "./testHelpers.js";

describe("API - 活躍清單／今日剛完成 endpoint（ADR-0002）", () => {
  let service: TaskService;
  let server: Server;
  let baseUrl: string;
  let specId: string;
  let fetch: typeof globalThis.fetch;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-27T10:00:00Z"));
    service = createTaskService();
    const requirement = service.createRequirement("R", "測試描述");
    const spec = service.createSpec(requirement.id, "S", "測試描述");
    specId = spec.id;
    ({ server, baseUrl } = await listenOnEphemeralPort(createApp(service)));
    fetch = createAuthedFetch(await registerAndLogin(baseUrl));
  });

  afterEach(async () => {
    await closeServer(server);
    vi.useRealTimers();
  });

  it("keeps a task completed today in the active list, and surfaces it as recently completed", async () => {
    const task = service.createTask(specId, {
      type: "開發任務",
      title: "任務",
      assignees: [{ person: "小美" }],
    });
    service.startTask(task.id);
    service.completeTask(task.id);

    const activeIds = (await readJson(await fetch(`${baseUrl}/todo/active`))).map(
      (i: { id: string }) => i.id,
    );
    expect(activeIds).toContain(task.id);

    const recentIds = (await readJson(await fetch(`${baseUrl}/todo/recently-completed`))).map(
      (i: { id: string }) => i.id,
    );
    expect(recentIds).toContain(task.id);
  });

  it("drops a task off both lists the day after it's completed", async () => {
    const task = service.createTask(specId, {
      type: "開發任務",
      title: "任務",
      assignees: [{ person: "小美" }],
    });
    service.startTask(task.id);
    service.completeTask(task.id);

    vi.setSystemTime(new Date("2026-07-28T10:00:00Z"));

    const activeIds = (await readJson(await fetch(`${baseUrl}/todo/active`))).map(
      (i: { id: string }) => i.id,
    );
    expect(activeIds).not.toContain(task.id);

    const recentIds = (await readJson(await fetch(`${baseUrl}/todo/recently-completed`))).map(
      (i: { id: string }) => i.id,
    );
    expect(recentIds).not.toContain(task.id);
  });

  it("keeps a not-yet-completed task in the active list", async () => {
    const task = service.createTask(specId, {
      type: "開發任務",
      title: "任務",
      assignees: [{ person: "小美" }],
    });

    const activeIds = (await readJson(await fetch(`${baseUrl}/todo/active`))).map(
      (i: { id: string }) => i.id,
    );
    expect(activeIds).toContain(task.id);
  });
});
