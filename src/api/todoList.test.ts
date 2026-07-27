import type { Server } from "node:http";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTaskService, type TaskService } from "../domain/taskService.js";
import { createApp } from "./app.js";
import { closeServer, createAuthedFetch, listenOnEphemeralPort, readJson, registerAndLogin } from "./testHelpers.js";

describe("API - 混合排序待辦清單 endpoint（含手動排序）", () => {
  let service: TaskService;
  let server: Server;
  let baseUrl: string;
  let specId: string;
  let fetch: typeof globalThis.fetch;

  beforeEach(async () => {
    service = createTaskService();
    const requirement = service.createRequirement("R");
    const spec = service.createSpec(requirement.id, "S");
    specId = spec.id;
    ({ server, baseUrl } = await listenOnEphemeralPort(createApp(service)));
    fetch = createAuthedFetch(await registerAndLogin(baseUrl));
  });

  afterEach(() => closeServer(server));

  it("returns tasks and reminders mixed into a single sorted list over HTTP", async () => {
    const task = service.createTask(specId, {
      type: "開發任務",
      title: "任務A",
      assignees: [{ person: "小美" }],
      priority: "高",
    });
    const reminder = service.createReminder({
      createdBy: "我",
      assignedTo: "我",
      title: "提醒B",
      priority: "低",
    });

    const res = await fetch(`${baseUrl}/todo`);
    expect(res.status).toBe(200);
    const body = await readJson(res);
    const ids = body.map((i: { id: string }) => i.id);
    expect(ids.indexOf(task.id)).toBeLessThan(ids.indexOf(reminder.id));
  });

  it("moves an item to a manual position over HTTP", async () => {
    const low = service.createTask(specId, {
      type: "開發任務",
      title: "低",
      assignees: [{ person: "小美" }],
      priority: "低",
    });
    service.createTask(specId, {
      type: "開發任務",
      title: "高",
      assignees: [{ person: "小美" }],
      priority: "高",
    });

    const res = await fetch(`${baseUrl}/todo/${low.id}/move`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ toIndex: 0 }),
    });
    expect(res.status).toBe(200);
    const body = await readJson(res);
    expect(body[0].id).toBe(low.id);
  });

  it("keeps a manually-moved item's position stable when a new item is added", async () => {
    const a = service.createTask(specId, {
      type: "開發任務",
      title: "A",
      assignees: [{ person: "小美" }],
      priority: "低",
    });
    await fetch(`${baseUrl}/todo/${a.id}/move`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ toIndex: 0 }),
    });

    service.createTask(specId, {
      type: "開發任務",
      title: "新項目",
      assignees: [{ person: "小美" }],
      priority: "高",
    });

    const res = await fetch(`${baseUrl}/todo`);
    const body = await readJson(res);
    expect(body[0].id).toBe(a.id);
  });

  it("404s when moving a non-existent item", async () => {
    const res = await fetch(`${baseUrl}/todo/missing-id/move`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ toIndex: 0 }),
    });
    expect(res.status).toBe(404);
  });
});
