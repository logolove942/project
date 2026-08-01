import type { Server } from "node:http";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { closeServer, listenOnEphemeralPort, readJson } from "./testHelpers.js";

describe("API - 提醒取消/復原（issue #57）與編輯（issue #58）：requireReminderOwner", () => {
  let server: Server;
  let baseUrl: string;
  let creatorToken: string;
  let assigneeToken: string;
  let strangerToken: string;
  let reminderId: string;
  let specId: string;

  async function register(name: string, password: string) {
    const res = await fetch(`${baseUrl}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, password }),
    });
    return readJson(res);
  }

  async function login(name: string, password: string): Promise<string> {
    const res = await fetch(`${baseUrl}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, password }),
    });
    return (await readJson(res)).token;
  }

  function authed(token: string, init: RequestInit = {}): RequestInit {
    return {
      ...init,
      headers: { ...(init.headers as Record<string, string> | undefined), Authorization: `Bearer ${token}` },
    };
  }

  beforeEach(async () => {
    ({ server, baseUrl } = await listenOnEphemeralPort(createApp()));

    await register("建立者", "pw1"); // 第一個註冊的帳號 -> 管理職，用來建需求/規格
    await register("提醒對象", "pw2");
    await register("路人", "pw3");
    creatorToken = await login("建立者", "pw1");
    assigneeToken = await login("提醒對象", "pw2");
    strangerToken = await login("路人", "pw3");

    const requirement = await readJson(
      await fetch(
        `${baseUrl}/requirements`,
        authed(creatorToken, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: "R" }),
        }),
      ),
    );
    const spec = await readJson(
      await fetch(
        `${baseUrl}/requirements/${requirement.id}/specs`,
        authed(creatorToken, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: "S" }),
        }),
      ),
    );
    specId = spec.id;

    const reminder = await readJson(
      await fetch(
        `${baseUrl}/reminders`,
        authed(creatorToken, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ createdBy: "建立者", assignedTo: "提醒對象", title: "提醒A" }),
        }),
      ),
    );
    reminderId = reminder.id;
  });

  afterEach(() => closeServer(server));

  it("403s a stranger cancelling a reminder", async () => {
    const res = await fetch(`${baseUrl}/reminders/${reminderId}/cancel`, authed(strangerToken, { method: "POST" }));
    expect(res.status).toBe(403);
    expect((await readJson(res)).error).toBeTruthy();
  });

  it("allows the creator to cancel and restore a reminder", async () => {
    const cancelled = await fetch(`${baseUrl}/reminders/${reminderId}/cancel`, authed(creatorToken, { method: "POST" }));
    expect(cancelled.status).toBe(200);
    expect((await readJson(cancelled)).status).toBe("已取消");

    const restored = await fetch(`${baseUrl}/reminders/${reminderId}/restore`, authed(creatorToken, { method: "POST" }));
    expect(restored.status).toBe(200);
    expect((await readJson(restored)).status).toBe("未處理");
  });

  it("allows the assignee to cancel and restore a reminder", async () => {
    const cancelled = await fetch(`${baseUrl}/reminders/${reminderId}/cancel`, authed(assigneeToken, { method: "POST" }));
    expect(cancelled.status).toBe(200);

    const restored = await fetch(`${baseUrl}/reminders/${reminderId}/restore`, authed(assigneeToken, { method: "POST" }));
    expect(restored.status).toBe(200);
  });

  it("403s a stranger restoring a cancelled reminder", async () => {
    await fetch(`${baseUrl}/reminders/${reminderId}/cancel`, authed(creatorToken, { method: "POST" }));
    const res = await fetch(`${baseUrl}/reminders/${reminderId}/restore`, authed(strangerToken, { method: "POST" }));
    expect(res.status).toBe(403);
  });

  it("400s when cancelling an already-closed reminder", async () => {
    await fetch(`${baseUrl}/reminders/${reminderId}/close`, authed(creatorToken, { method: "POST" }));
    const res = await fetch(`${baseUrl}/reminders/${reminderId}/cancel`, authed(creatorToken, { method: "POST" }));
    expect(res.status).toBe(400);
  });

  it("400s when restoring a reminder that isn't cancelled", async () => {
    const res = await fetch(`${baseUrl}/reminders/${reminderId}/restore`, authed(creatorToken, { method: "POST" }));
    expect(res.status).toBe(400);
  });

  it("404s when cancelling/restoring a non-existent reminder", async () => {
    for (const action of ["cancel", "restore"]) {
      const res = await fetch(`${baseUrl}/reminders/missing-id/${action}`, authed(creatorToken, { method: "POST" }));
      expect(res.status).toBe(404);
    }
  });

  it("403s a stranger editing a reminder", async () => {
    const res = await fetch(
      `${baseUrl}/reminders/${reminderId}`,
      authed(strangerToken, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "新標題" }),
      }),
    );
    expect(res.status).toBe(403);
  });

  it("allows the creator to edit a reminder's fields", async () => {
    const res = await fetch(
      `${baseUrl}/reminders/${reminderId}`,
      authed(creatorToken, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "新標題", priority: "高", dueDate: "2026-09-01", specId }),
      }),
    );
    expect(res.status).toBe(200);
    const body = await readJson(res);
    expect(body.title).toBe("新標題");
    expect(body.priority).toBe("高");
    expect(body.dueDate).toBe("2026-09-01");
    expect(body.specId).toBe(specId);
  });

  it("allows the assignee to edit a reminder's assignedTo", async () => {
    const res = await fetch(
      `${baseUrl}/reminders/${reminderId}`,
      authed(assigneeToken, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assignedTo: "路人" }),
      }),
    );
    expect(res.status).toBe(200);
    expect((await readJson(res)).assignedTo).toBe("路人");
  });

  it("404s when editing a non-existent reminder", async () => {
    const res = await fetch(
      `${baseUrl}/reminders/missing-id`,
      authed(creatorToken, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "x" }),
      }),
    );
    expect(res.status).toBe(404);
  });

  it("404s when moving a reminder into a non-existent spec", async () => {
    const res = await fetch(
      `${baseUrl}/reminders/${reminderId}`,
      authed(creatorToken, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ specId: "missing-spec" }),
      }),
    );
    expect(res.status).toBe(404);
  });
});
