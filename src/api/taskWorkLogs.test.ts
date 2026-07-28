import type { Server } from "node:http";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTaskService, type TaskService } from "../domain/taskService.js";
import { createApp } from "./app.js";
import { closeServer, createAuthedFetch, listenOnEphemeralPort, readJson, registerAndLogin } from "./testHelpers.js";

describe("API - 任務報工 endpoints（含預計 vs 消耗）", () => {
  let service: TaskService;
  let server: Server;
  let baseUrl: string;
  let taskId: string;
  let fetch: typeof globalThis.fetch;

  beforeEach(async () => {
    service = createTaskService();
    const requirement = service.createRequirement("金流串接", "測試描述");
    const spec = service.createSpec(requirement.id, "金流串接規格", "測試描述");
    const task = service.createTask(spec.id, {
      type: "開發任務",
      title: "開發",
      assignees: [
        { person: "小美", estimatedHours: 12 },
        { person: "阿凱", estimatedHours: 8 },
      ],
    });
    taskId = task.id;
    ({ server, baseUrl } = await listenOnEphemeralPort(createApp(service)));
    fetch = createAuthedFetch(await registerAndLogin(baseUrl));
  });

  afterEach(() => closeServer(server));

  it("logs work against a task over HTTP", async () => {
    const res = await fetch(`${baseUrl}/tasks/${taskId}/work-logs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ person: "小美", date: "2026-07-27", hours: 4, note: "串接" }),
    });
    expect(res.status).toBe(201);
    const body = await readJson(res);
    expect(body.person).toBe("小美");
    expect(body.hours).toBe(4);
  });

  it("404s when logging work against a non-existent task", async () => {
    const res = await fetch(`${baseUrl}/tasks/missing-id/work-logs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ person: "我", date: "2026-07-27", hours: 1 }),
    });
    expect(res.status).toBe(404);
  });

  it("lists a task's work logs over HTTP", async () => {
    service.logWork(taskId, { person: "小美", date: "2026-07-24", hours: 6 });
    service.logWork(taskId, { person: "小美", date: "2026-07-25", hours: 4 });

    const res = await fetch(`${baseUrl}/tasks/${taskId}/work-logs`);
    expect(res.status).toBe(200);
    const body = await readJson(res);
    expect(body).toHaveLength(2);
  });

  it("404s when listing work logs for a non-existent task", async () => {
    const res = await fetch(`${baseUrl}/tasks/missing-id/work-logs`);
    expect(res.status).toBe(404);
  });

  it("queries estimate vs actual per assignee over HTTP", async () => {
    service.logWork(taskId, { person: "小美", date: "2026-07-24", hours: 5 });
    service.logWork(taskId, { person: "阿凱", date: "2026-07-24", hours: 3 });

    const res = await fetch(`${baseUrl}/tasks/${taskId}/estimate-vs-actual`);
    expect(res.status).toBe(200);
    const body = await readJson(res);
    expect(body).toEqual(
      expect.arrayContaining([
        { person: "小美", estimatedHours: 12, actualHours: 5 },
        { person: "阿凱", estimatedHours: 8, actualHours: 3 },
      ]),
    );
  });

  it("404s when querying estimate vs actual for a non-existent task", async () => {
    const res = await fetch(`${baseUrl}/tasks/missing-id/estimate-vs-actual`);
    expect(res.status).toBe(404);
  });
});
