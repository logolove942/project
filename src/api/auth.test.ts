import type { Server } from "node:http";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { closeServer, listenOnEphemeralPort, readJson } from "./testHelpers.js";

describe("API - 登入/登出 + 全站要求登入 endpoints（issue #46）", () => {
  let server: Server;
  let baseUrl: string;

  beforeEach(async () => {
    ({ server, baseUrl } = await listenOnEphemeralPort(createApp()));
  });

  afterEach(() => closeServer(server));

  async function register(name: string, password: string) {
    return fetch(`${baseUrl}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, password }),
    });
  }

  it("logs in with correct credentials and returns a token + account", async () => {
    await register("小美", "hunter2");

    const res = await fetch(`${baseUrl}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "小美", password: "hunter2" }),
    });
    expect(res.status).toBe(200);
    const body = await readJson(res);
    expect(body.token).toBeTruthy();
    expect(body.account.name).toBe("小美");
  });

  it("rejects a wrong password with the same generic error as an unknown account", async () => {
    await register("小美", "hunter2");

    const wrongPassword = await fetch(`${baseUrl}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "小美", password: "wrong" }),
    });
    const unknownAccount = await fetch(`${baseUrl}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "不存在的人", password: "whatever" }),
    });

    expect(wrongPassword.status).toBe(401);
    expect(unknownAccount.status).toBe(401);
    expect((await readJson(wrongPassword)).error).toBe((await readJson(unknownAccount)).error);
  });

  it("401s any existing route when no token is provided", async () => {
    const res = await fetch(`${baseUrl}/requirements`);
    expect(res.status).toBe(401);
  });

  it("401s any existing route when an invalid token is provided", async () => {
    const res = await fetch(`${baseUrl}/requirements`, {
      headers: { Authorization: "Bearer not-a-real-token" },
    });
    expect(res.status).toBe(401);
  });

  it("allows an existing route through with a valid token", async () => {
    await register("小美", "hunter2");
    const loginRes = await fetch(`${baseUrl}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "小美", password: "hunter2" }),
    });
    const { token } = await readJson(loginRes);

    const res = await fetch(`${baseUrl}/requirements`, { headers: { Authorization: `Bearer ${token}` } });
    expect(res.status).toBe(200);
  });

  it("logs out, invalidating the token so it can no longer be used", async () => {
    await register("小美", "hunter2");
    const loginRes = await fetch(`${baseUrl}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "小美", password: "hunter2" }),
    });
    const { token } = await readJson(loginRes);

    const logoutRes = await fetch(`${baseUrl}/auth/logout`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(logoutRes.status).toBe(204);

    const afterLogout = await fetch(`${baseUrl}/requirements`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(afterLogout.status).toBe(401);
  });

  it("allows registration and login without any token", async () => {
    const registerRes = await register("阿凱", "pw");
    expect(registerRes.status).toBe(201);
  });
});
