import type { Server } from "node:http";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTaskService, type TaskService } from "../domain/taskService.js";
import { createApp } from "./app.js";
import { closeServer, createAuthedFetch, listenOnEphemeralPort, readJson, registerAndLogin } from "./testHelpers.js";

describe("API - 任務編輯（issue #55）", () => {
  let service: TaskService;
  let server: Server;
  let baseUrl: string;
  let specId: string;
  let otherSpecId: string;
  let taskId: string;
  let fetch: typeof globalThis.fetch;

  beforeEach(async () => {
    service = createTaskService();
    const requirement = service.createRequirement("報表匯出", "測試描述");
    const spec = service.createSpec(requirement.id, "報表匯出規格", "測試描述");
    specId = spec.id;
    const otherSpec = service.createSpec(requirement.id, "另一個規格", "測試描述");
    otherSpecId = otherSpec.id;
    const task = service.createTask(spec.id, {
      type: "開發任務",
      title: "開發",
      assignees: [{ person: "小美" }],
    });
    taskId = task.id;
    ({ server, baseUrl } = await listenOnEphemeralPort(createApp(service)));
    fetch = createAuthedFetch(await registerAndLogin(baseUrl));
  });

  afterEach(() => closeServer(server));

  it("edits a task's title over HTTP, leaving other fields untouched", async () => {
    const res = await fetch(`${baseUrl}/tasks/${taskId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "新標題" }),
    });
    expect(res.status).toBe(200);
    const body = await readJson(res);
    expect(body.title).toBe("新標題");
    expect(body.priority).toBe("中");
  });

  it("edits assignees, spec, type, priority and due date together", async () => {
    const res = await fetch(`${baseUrl}/tasks/${taskId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        assignees: [{ person: "阿凱" }],
        specId: otherSpecId,
        type: "測試任務",
        priority: "高",
        dueDate: "2026-09-01",
      }),
    });
    expect(res.status).toBe(200);
    const body = await readJson(res);
    expect(body.assignees).toEqual([{ person: "阿凱" }]);
    expect(body.specId).toBe(otherSpecId);
    expect(body.type).toBe("測試任務");
    expect(body.priority).toBe("高");
    expect(body.dueDate).toBe("2026-09-01");
  });

  it("does not affect a removed assignee's existing work logs", async () => {
    await fetch(`${baseUrl}/tasks/${taskId}/work-logs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ person: "小美", date: "2026-07-24", hours: 4 }),
    });

    await fetch(`${baseUrl}/tasks/${taskId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assignees: [{ person: "阿凱" }] }),
    });

    const logsRes = await fetch(`${baseUrl}/tasks/${taskId}/work-logs`);
    const logs = await readJson(logsRes);
    expect(logs).toHaveLength(1);
    expect(logs[0].person).toBe("小美");
  });

  it("400s when clearing all assignees", async () => {
    const res = await fetch(`${baseUrl}/tasks/${taskId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assignees: [] }),
    });
    expect(res.status).toBe(400);
  });

  it("404s when editing a non-existent task", async () => {
    const res = await fetch(`${baseUrl}/tasks/missing-id`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "x" }),
    });
    expect(res.status).toBe(404);
  });

  it("404s when moving a task into a non-existent spec", async () => {
    const res = await fetch(`${baseUrl}/tasks/${taskId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ specId: "missing-spec" }),
    });
    expect(res.status).toBe(404);
  });
});
