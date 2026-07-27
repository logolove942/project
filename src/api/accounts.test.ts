import type { Server } from "node:http";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createAccountService, type AccountService } from "../domain/accountService.js";
import { createApp } from "./app.js";
import { closeServer, listenOnEphemeralPort, readJson } from "./testHelpers.js";

describe("API - 帳號註冊 + 帳號列表 endpoints（issue #45）", () => {
  let accountService: AccountService;
  let server: Server;
  let baseUrl: string;

  beforeEach(async () => {
    accountService = createAccountService();
    ({ server, baseUrl } = await listenOnEphemeralPort(createApp(undefined, accountService)));
  });

  afterEach(() => closeServer(server));

  it("registers an account over HTTP without leaking password material", async () => {
    const res = await fetch(`${baseUrl}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "小美", password: "hunter2" }),
    });
    expect(res.status).toBe(201);
    const body = await readJson(res);
    expect(body.name).toBe("小美");
    expect(body.role).toBe("管理職");
    expect(body).not.toHaveProperty("password");
    expect(body).not.toHaveProperty("passwordHash");
    expect(body).not.toHaveProperty("salt");
  });

  it("rejects a duplicate name with a 400 and a clear error", async () => {
    accountService.register("小美", "pw1");
    const res = await fetch(`${baseUrl}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "小美", password: "pw2" }),
    });
    expect(res.status).toBe(400);
    const body = await readJson(res);
    expect(body.error).toBeTruthy();
  });

  it("lists all registered accounts over HTTP without password hashes", async () => {
    accountService.register("我", "pw1");
    accountService.register("小美", "pw2");

    // GET /accounts 現在也要求登入（issue #46）；用其中一個已註冊帳號登入取得 token，
    // 避免透過 registerAndLogin 額外多建立一個帳號，弄亂這裡要驗證的帳號數量。
    const loginRes = await fetch(`${baseUrl}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "我", password: "pw1" }),
    });
    const { token } = await readJson(loginRes);

    const res = await fetch(`${baseUrl}/accounts`, { headers: { Authorization: `Bearer ${token}` } });
    expect(res.status).toBe(200);
    const body = await readJson(res);
    expect(body).toHaveLength(2);
    expect(body.map((a: { name: string }) => a.name).sort()).toEqual(["小美", "我"]);
    for (const account of body) {
      expect(account).not.toHaveProperty("passwordHash");
      expect(account).not.toHaveProperty("salt");
    }
  });
});
