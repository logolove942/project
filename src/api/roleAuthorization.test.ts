import type { Server } from "node:http";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { closeServer, listenOnEphemeralPort, readJson } from "./testHelpers.js";

describe("API - 角色授權：管理職專屬操作（issue #47）", () => {
  let server: Server;
  let baseUrl: string;
  let adminToken: string;
  let memberToken: string;
  let memberAccountId: string;
  let requirementId: string;
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

    await register("我", "pw1"); // 第一個註冊的帳號 -> 管理職
    const member = await register("小美", "pw2"); // 之後的帳號 -> 一般同仁
    memberAccountId = member.id;
    adminToken = await login("我", "pw1");
    memberToken = await login("小美", "pw2");

    const requirement = await readJson(
      await fetch(
        `${baseUrl}/requirements`,
        authed(adminToken, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: "會員系統改版" }),
        }),
      ),
    );
    requirementId = requirement.id;

    const spec = await readJson(
      await fetch(
        `${baseUrl}/requirements/${requirementId}/specs`,
        authed(adminToken, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: "會員登入規格" }),
        }),
      ),
    );
    specId = spec.id;
  });

  afterEach(() => closeServer(server));

  it("403s a 一般同仁 creating a requirement", async () => {
    const res = await fetch(
      `${baseUrl}/requirements`,
      authed(memberToken, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "x" }),
      }),
    );
    expect(res.status).toBe(403);
    expect((await readJson(res)).error).toBeTruthy();
  });

  it("403s a 一般同仁 creating a spec", async () => {
    const res = await fetch(
      `${baseUrl}/requirements/${requirementId}/specs`,
      authed(memberToken, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "x" }),
      }),
    );
    expect(res.status).toBe(403);
  });

  it("403s a 一般同仁 creating a task", async () => {
    const res = await fetch(
      `${baseUrl}/specs/${specId}/tasks`,
      authed(memberToken, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "開發任務", title: "x", assignees: [{ person: "小美" }] }),
      }),
    );
    expect(res.status).toBe(403);
  });

  it("403s a 一般同仁 promoting another account", async () => {
    const res = await fetch(`${baseUrl}/accounts/${memberAccountId}/promote`, authed(memberToken, { method: "POST" }));
    expect(res.status).toBe(403);
  });

  it("allows 管理職 to create requirements/specs/tasks (regression, already covered elsewhere but explicit here)", async () => {
    const res = await fetch(
      `${baseUrl}/requirements`,
      authed(adminToken, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "另一個需求" }),
      }),
    );
    expect(res.status).toBe(201);
  });

  it("allows 管理職 to promote a 一般同仁 account to 管理職", async () => {
    const res = await fetch(`${baseUrl}/accounts/${memberAccountId}/promote`, authed(adminToken, { method: "POST" }));
    expect(res.status).toBe(200);
    const body = await readJson(res);
    expect(body.role).toBe("管理職");
  });

  it("403s a 一般同仁 promoting an account even though they're now able to call other endpoints", async () => {
    // 確認 403 專屬於這四個端點，不是全站對一般同仁關閉
    const res = await fetch(`${baseUrl}/accounts/${memberAccountId}/promote`, authed(memberToken, { method: "POST" }));
    expect(res.status).toBe(403);
  });

  // issue #47 acceptance: 除了上面四個端點，其餘既有路由（提醒建立、任務/提醒狀態變更、報工、
  // 提醒升級為任務……）維持開放給任何登入帳號，不因為這張票而新增任何限制。
  it("keeps reminder creation open to a 一般同仁 (regression)", async () => {
    const res = await fetch(
      `${baseUrl}/reminders`,
      authed(memberToken, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ createdBy: "小美", assignedTo: "小美", title: "雜事" }),
      }),
    );
    expect(res.status).toBe(201);
  });

  it("keeps task status transitions open to a 一般同仁 (regression)", async () => {
    const task = await readJson(
      await fetch(
        `${baseUrl}/specs/${specId}/tasks`,
        authed(adminToken, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "開發任務", title: "開發", assignees: [{ person: "小美" }] }),
        }),
      ),
    );

    const res = await fetch(`${baseUrl}/tasks/${task.id}/start`, authed(memberToken, { method: "POST" }));
    expect(res.status).toBe(200);
  });

  it("keeps work-log entries open to a 一般同仁 (regression)", async () => {
    const task = await readJson(
      await fetch(
        `${baseUrl}/specs/${specId}/tasks`,
        authed(adminToken, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "開發任務", title: "開發", assignees: [{ person: "小美" }] }),
        }),
      ),
    );

    const res = await fetch(
      `${baseUrl}/tasks/${task.id}/work-logs`,
      authed(memberToken, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ person: "小美", date: "2026-07-27", hours: 2 }),
      }),
    );
    expect(res.status).toBe(201);
  });

  it("keeps promoting a reminder to a task open to a 一般同仁 (regression)", async () => {
    const reminder = await readJson(
      await fetch(
        `${baseUrl}/reminders`,
        authed(memberToken, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ createdBy: "小美", assignedTo: "小美", title: "臨時插曲", specId }),
        }),
      ),
    );

    const res = await fetch(
      `${baseUrl}/reminders/${reminder.id}/promote`,
      authed(memberToken, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ specId, type: "開發任務", assignees: [{ person: "小美" }] }),
      }),
    );
    expect(res.status).toBe(201);
  });
});
