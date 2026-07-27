import type { Server } from "node:http";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTaskService, type TaskService } from "../domain/taskService.js";
import { createApp } from "./app.js";
import { closeServer, listenOnEphemeralPort, readJson } from "./testHelpers.js";

describe("API - 提醒建立、關閉、報工 endpoints（含規格掛勾）", () => {
  let service: TaskService;
  let server: Server;
  let baseUrl: string;
  let specId: string;

  beforeEach(async () => {
    service = createTaskService();
    const requirement = service.createRequirement("會員登入");
    const spec = service.createSpec(requirement.id, "會員登入規格");
    specId = spec.id;
    ({ server, baseUrl } = await listenOnEphemeralPort(createApp(service)));
  });

  afterEach(() => closeServer(server));

  it("creates a reminder over HTTP", async () => {
    const res = await fetch(`${baseUrl}/reminders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ createdBy: "小美", assignedTo: "阿凱", title: "幫忙建立 git repo" }),
    });
    expect(res.status).toBe(201);
    const body = await readJson(res);
    expect(body.status).toBe("未處理");
    expect(body.assignedTo).toBe("阿凱");
  });

  it("creates a reminder linked to a spec over HTTP", async () => {
    const res = await fetch(`${baseUrl}/reminders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        createdBy: "我",
        assignedTo: "我",
        title: "規格書欄位代號寫錯",
        specId,
      }),
    });
    expect(res.status).toBe(201);
    const body = await readJson(res);
    expect(body.specId).toBe(specId);
  });

  it("404s when linking a reminder to a non-existent spec", async () => {
    const res = await fetch(`${baseUrl}/reminders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ createdBy: "我", assignedTo: "我", title: "x", specId: "missing-id" }),
    });
    expect(res.status).toBe(404);
  });

  it("closes a reminder over HTTP", async () => {
    const reminder = service.createReminder({ createdBy: "我", assignedTo: "我", title: "x" });

    const res = await fetch(`${baseUrl}/reminders/${reminder.id}/close`, { method: "POST" });
    expect(res.status).toBe(200);
    expect((await readJson(res)).status).toBe("已結案");
  });

  it("400s when closing an already-closed reminder", async () => {
    const reminder = service.createReminder({ createdBy: "我", assignedTo: "我", title: "x" });
    service.closeReminder(reminder.id);

    const res = await fetch(`${baseUrl}/reminders/${reminder.id}/close`, { method: "POST" });
    expect(res.status).toBe(400);
  });

  it("404s when closing a non-existent reminder", async () => {
    const res = await fetch(`${baseUrl}/reminders/missing-id/close`, { method: "POST" });
    expect(res.status).toBe(404);
  });

  it("logs work against a reminder over HTTP", async () => {
    const reminder = service.createReminder({ createdBy: "我", assignedTo: "我", title: "雜事" });

    const res = await fetch(`${baseUrl}/reminders/${reminder.id}/work-logs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ person: "我", date: "2026-07-27", hours: 1 }),
    });
    expect(res.status).toBe(201);
    expect((await readJson(res)).hours).toBe(1);
  });

  it("lists a reminder's work logs over HTTP", async () => {
    const reminder = service.createReminder({ createdBy: "我", assignedTo: "我", title: "雜事" });
    service.logReminderWork(reminder.id, { person: "我", date: "2026-07-27", hours: 1 });

    const res = await fetch(`${baseUrl}/reminders/${reminder.id}/work-logs`);
    expect(res.status).toBe(200);
    expect(await readJson(res)).toHaveLength(1);
  });

  it("404s when logging or listing work logs for a non-existent reminder", async () => {
    const logRes = await fetch(`${baseUrl}/reminders/missing-id/work-logs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ person: "我", date: "2026-07-27", hours: 1 }),
    });
    expect(logRes.status).toBe(404);

    const listRes = await fetch(`${baseUrl}/reminders/missing-id/work-logs`);
    expect(listRes.status).toBe(404);
  });
});
