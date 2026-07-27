import type { Server } from "node:http";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTaskService, type TaskService } from "../domain/taskService.js";
import { createApp } from "./app.js";
import { closeServer, createAuthedFetch, listenOnEphemeralPort, readJson, registerAndLogin } from "./testHelpers.js";

describe("API - 提醒升級為任務 endpoint", () => {
  let service: TaskService;
  let server: Server;
  let baseUrl: string;
  let specId: string;
  let reminderId: string;
  let fetch: typeof globalThis.fetch;

  beforeEach(async () => {
    service = createTaskService();
    const requirement = service.createRequirement("會員登入");
    const spec = service.createSpec(requirement.id, "會員登入規格");
    specId = spec.id;
    const reminder = service.createReminder({
      createdBy: "小美",
      assignedTo: "阿凱",
      title: "規格書欄位代號寫錯，通知 SA 調整",
      specId,
    });
    reminderId = reminder.id;
    ({ server, baseUrl } = await listenOnEphemeralPort(createApp(service)));
    fetch = createAuthedFetch(await registerAndLogin(baseUrl));
  });

  afterEach(() => closeServer(server));

  it("promotes a reminder into a task under the given spec over HTTP", async () => {
    const res = await fetch(`${baseUrl}/reminders/${reminderId}/promote`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ specId, type: "開發任務", assignees: [{ person: "阿凱" }] }),
    });
    expect(res.status).toBe(201);
    const body = await readJson(res);
    expect(body.specId).toBe(specId);
    expect(body.status).toBe("待處理");
  });

  it("lets the promoted task be driven through the task state machine over HTTP", async () => {
    const promoteRes = await fetch(`${baseUrl}/reminders/${reminderId}/promote`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ specId, type: "開發任務", assignees: [{ person: "阿凱" }] }),
    });
    const task = await readJson(promoteRes);

    const startRes = await fetch(`${baseUrl}/tasks/${task.id}/start`, { method: "POST" });
    expect(startRes.status).toBe(200);
    expect((await readJson(startRes)).status).toBe("進行中");
  });

  it("makes the original reminder unreachable via reminder endpoints after promotion", async () => {
    await fetch(`${baseUrl}/reminders/${reminderId}/promote`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ specId, type: "開發任務", assignees: [{ person: "阿凱" }] }),
    });

    const res = await fetch(`${baseUrl}/reminders/${reminderId}/close`, { method: "POST" });
    expect(res.status).toBe(404);
  });

  it("404s when promoting a non-existent reminder", async () => {
    const res = await fetch(`${baseUrl}/reminders/missing-id/promote`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ specId, type: "開發任務", assignees: [{ person: "阿凱" }] }),
    });
    expect(res.status).toBe(404);
  });

  it("404s when promoting into a non-existent spec", async () => {
    const res = await fetch(`${baseUrl}/reminders/${reminderId}/promote`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ specId: "missing-id", type: "開發任務", assignees: [{ person: "阿凱" }] }),
    });
    expect(res.status).toBe(404);
  });
});
