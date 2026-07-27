import type { Server } from "node:http";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTaskService, type TaskService } from "../domain/taskService.js";
import { createApp } from "./app.js";
import { closeServer, listenOnEphemeralPort, readJson } from "./testHelpers.js";

describe("API - 任務狀態機 endpoints（含退件/重工回合）", () => {
  let service: TaskService;
  let server: Server;
  let baseUrl: string;
  let taskId: string;

  beforeEach(async () => {
    service = createTaskService();
    const requirement = service.createRequirement("報表匯出");
    const spec = service.createSpec(requirement.id, "報表匯出規格");
    const task = service.createTask(spec.id, {
      type: "開發任務",
      title: "開發",
      assignees: [{ person: "小美" }],
    });
    taskId = task.id;
    ({ server, baseUrl } = await listenOnEphemeralPort(createApp(service)));
  });

  afterEach(() => closeServer(server));

  it("starts a task over HTTP", async () => {
    const res = await fetch(`${baseUrl}/tasks/${taskId}/start`, { method: "POST" });
    expect(res.status).toBe(200);
    expect((await readJson(res)).status).toBe("進行中");
  });

  it("completes a started task over HTTP", async () => {
    await fetch(`${baseUrl}/tasks/${taskId}/start`, { method: "POST" });
    const res = await fetch(`${baseUrl}/tasks/${taskId}/complete`, { method: "POST" });
    expect(res.status).toBe(200);
    expect((await readJson(res)).status).toBe("完成");
  });

  it("400s when completing a task that hasn't been started", async () => {
    const res = await fetch(`${baseUrl}/tasks/${taskId}/complete`, { method: "POST" });
    expect(res.status).toBe(400);
  });

  it("pauses and resumes a task over HTTP, returning to its prior state", async () => {
    await fetch(`${baseUrl}/tasks/${taskId}/start`, { method: "POST" });
    const paused = await fetch(`${baseUrl}/tasks/${taskId}/pause`, { method: "POST" });
    expect((await readJson(paused)).status).toBe("暫停");

    const resumed = await fetch(`${baseUrl}/tasks/${taskId}/resume`, { method: "POST" });
    expect(resumed.status).toBe(200);
    expect((await readJson(resumed)).status).toBe("進行中");
  });

  it("400s when resuming a task that isn't paused", async () => {
    const res = await fetch(`${baseUrl}/tasks/${taskId}/resume`, { method: "POST" });
    expect(res.status).toBe(400);
  });

  it("rejects a task over HTTP, creating a new rework round", async () => {
    const res = await fetch(`${baseUrl}/tasks/${taskId}/reject`, { method: "POST" });
    expect(res.status).toBe(200);
    const body = await readJson(res);
    expect(body.roundNumber).toBe(2);
  });

  it("queries a task's rework rounds with their work logs over HTTP", async () => {
    service.logWork(taskId, { person: "小美", date: "2026-07-24", hours: 3 });
    service.rejectTask(taskId);
    service.logWork(taskId, { person: "小美", date: "2026-07-25", hours: 2 });

    const res = await fetch(`${baseUrl}/tasks/${taskId}/rework-rounds`);
    expect(res.status).toBe(200);
    const body = await readJson(res);
    expect(body).toHaveLength(2);
    expect(body[0].workLogs.map((w: { hours: number }) => w.hours)).toEqual([3]);
    expect(body[1].workLogs.map((w: { hours: number }) => w.hours)).toEqual([2]);
  });

  it("404s for start/complete/pause/resume/reject on a non-existent task", async () => {
    for (const action of ["start", "complete", "pause", "resume", "reject"]) {
      const res = await fetch(`${baseUrl}/tasks/missing-id/${action}`, { method: "POST" });
      expect(res.status).toBe(404);
    }
  });

  it("404s when querying rework rounds for a non-existent task", async () => {
    const res = await fetch(`${baseUrl}/tasks/missing-id/rework-rounds`);
    expect(res.status).toBe(404);
  });
});
