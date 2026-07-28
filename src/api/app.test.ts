import express from "express";
import type { Server } from "node:http";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NotFoundError, ValidationError } from "../domain/errors.js";
import { createTaskService, type TaskService } from "../domain/taskService.js";
import { createApp } from "./app.js";
import { errorHandler } from "./errorHandler.js";
import { closeServer, createAuthedFetch, listenOnEphemeralPort, readJson, registerAndLogin } from "./testHelpers.js";

describe("API - Express app (createApp)", () => {
  let service: TaskService;
  let server: Server;
  let baseUrl: string;
  let fetch: typeof globalThis.fetch;

  beforeEach(() => {
    service = createTaskService();
  });

  afterEach(() => closeServer(server));

  it("lists requirements over HTTP", async () => {
    service.createRequirement("需求一", "測試描述");
    ({ server, baseUrl } = await listenOnEphemeralPort(createApp(service)));
    fetch = createAuthedFetch(await registerAndLogin(baseUrl));

    const res = await fetch(`${baseUrl}/requirements`);
    expect(res.status).toBe(200);
    const body = await readJson(res);
    expect(body).toHaveLength(1);
    expect(body[0].title).toBe("需求一");
  });

  it("gets a single requirement's full hierarchy over HTTP", async () => {
    const requirement = service.createRequirement("需求一", "測試描述");
    const spec = service.createSpec(requirement.id, "規格A", "測試描述");
    service.createTask(spec.id, {
      type: "開發任務",
      title: "任務A",
      assignees: [{ person: "小美" }],
    });
    ({ server, baseUrl } = await listenOnEphemeralPort(createApp(service)));
    fetch = createAuthedFetch(await registerAndLogin(baseUrl));

    const res = await fetch(`${baseUrl}/requirements/${requirement.id}`);
    expect(res.status).toBe(200);
    const body = await readJson(res);
    expect(body.specs).toHaveLength(1);
    expect(body.specs[0].tasks).toHaveLength(1);
  });

  it("maps a NotFoundError from the domain service to a 404 response", async () => {
    ({ server, baseUrl } = await listenOnEphemeralPort(createApp(service)));
    fetch = createAuthedFetch(await registerAndLogin(baseUrl));

    const res = await fetch(`${baseUrl}/requirements/missing-id`);
    expect(res.status).toBe(404);
    const body = await readJson(res);
    expect(body.error).toMatch(/not found/i);
  });

  it("shares a single service instance across all routes on the same app", async () => {
    ({ server, baseUrl } = await listenOnEphemeralPort(createApp(service)));
    fetch = createAuthedFetch(await registerAndLogin(baseUrl));

    // 直接對傳進 createApp 的 service 實例寫入，驗證 route 看到的是同一個實例
    service.createRequirement("在 service 上直接建立", "測試描述");

    const res = await fetch(`${baseUrl}/requirements`);
    const body = await readJson(res);
    expect(body).toHaveLength(1);
    expect(body[0].title).toBe("在 service 上直接建立");
  });

  // 前端（Vite dev server）跟後端開發時是不同 origin；Node 的 fetch 不像瀏覽器會強制套用
  // CORS，所以這條規則只有真的用瀏覽器打才會被擋下——這裡至少驗證 header 有正確送出。
  it("sends CORS headers so a real browser on a different origin (the Vite dev server) isn't blocked", async () => {
    ({ server, baseUrl } = await listenOnEphemeralPort(createApp(service)));

    const res = await fetch(`${baseUrl}/requirements`, { headers: { Origin: "http://localhost:5173" } });
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
  });

  it("responds to a CORS preflight OPTIONS request without requiring auth", async () => {
    ({ server, baseUrl } = await listenOnEphemeralPort(createApp(service)));

    const res = await fetch(`${baseUrl}/requirements`, {
      method: "OPTIONS",
      headers: {
        Origin: "http://localhost:5173",
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "authorization,content-type",
      },
    });
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-headers")).toContain("Authorization");
  });
});

describe("API - errorHandler middleware (in isolation)", () => {
  let server: Server;
  let baseUrl: string;

  afterEach(() => closeServer(server));

  async function appThatThrows(err: unknown) {
    const app = express();
    app.get("/x", () => {
      throw err;
    });
    app.use(errorHandler);
    return app;
  }

  it("maps NotFoundError to a 404 response", async () => {
    ({ server, baseUrl } = await listenOnEphemeralPort(await appThatThrows(new NotFoundError("not here"))));

    const res = await fetch(`${baseUrl}/x`);
    expect(res.status).toBe(404);
    expect((await readJson(res)).error).toBe("not here");
  });

  it("maps ValidationError to a 400 response", async () => {
    ({ server, baseUrl } = await listenOnEphemeralPort(await appThatThrows(new ValidationError("nope"))));

    const res = await fetch(`${baseUrl}/x`);
    expect(res.status).toBe(400);
    expect((await readJson(res)).error).toBe("nope");
  });

  it("maps any other thrown error to a 500 response", async () => {
    ({ server, baseUrl } = await listenOnEphemeralPort(await appThatThrows(new Error("boom"))));

    const res = await fetch(`${baseUrl}/x`);
    expect(res.status).toBe(500);
  });
});
