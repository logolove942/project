import type { Server } from "node:http";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTaskService, type TaskService } from "../domain/taskService.js";
import { createApp } from "./app.js";
import { closeServer, createAuthedFetch, listenOnEphemeralPort, readJson, registerAndLogin } from "./testHelpers.js";

describe("API - 需求/規格/任務建立與階層查詢 endpoints", () => {
  let service: TaskService;
  let server: Server;
  let baseUrl: string;
  let fetch: typeof globalThis.fetch;

  beforeEach(async () => {
    service = createTaskService();
    ({ server, baseUrl } = await listenOnEphemeralPort(createApp(service)));
    fetch = createAuthedFetch(await registerAndLogin(baseUrl));
  });

  afterEach(() => closeServer(server));

  it("creates a requirement over HTTP", async () => {
    const res = await fetch(`${baseUrl}/requirements`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "會員登入", description: "描述內容" }),
    });
    expect(res.status).toBe(201);
    const body = await readJson(res);
    expect(body.title).toBe("會員登入");
    expect(body.description).toBe("描述內容");
    expect(body.status).toBe("待處理");
  });

  it("defaults a requirement's description to an empty string when omitted", async () => {
    const res = await fetch(`${baseUrl}/requirements`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "沒填描述" }),
    });
    const body = await readJson(res);
    expect(body.description).toBe("");
  });

  it("creates a spec under a requirement over HTTP", async () => {
    const requirement = service.createRequirement("會員登入", "測試描述");

    const res = await fetch(`${baseUrl}/requirements/${requirement.id}/specs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "會員登入規格", description: "規格描述" }),
    });
    expect(res.status).toBe(201);
    const body = await readJson(res);
    expect(body.requirementId).toBe(requirement.id);
    expect(body.description).toBe("規格描述");
  });

  it("edits a requirement's title and description over HTTP", async () => {
    const requirement = service.createRequirement("舊標題", "舊描述");

    const res = await fetch(`${baseUrl}/requirements/${requirement.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "新標題", description: "新描述" }),
    });
    expect(res.status).toBe(200);
    const body = await readJson(res);
    expect(body.title).toBe("新標題");
    expect(body.description).toBe("新描述");
  });

  it("404s when editing a non-existent requirement", async () => {
    const res = await fetch(`${baseUrl}/requirements/missing-id`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "x" }),
    });
    expect(res.status).toBe(404);
  });

  it("edits a spec's title and description over HTTP", async () => {
    const requirement = service.createRequirement("會員登入", "測試描述");
    const spec = service.createSpec(requirement.id, "舊標題", "舊描述");

    const res = await fetch(`${baseUrl}/specs/${spec.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "新標題", description: "新描述" }),
    });
    expect(res.status).toBe(200);
    const body = await readJson(res);
    expect(body.title).toBe("新標題");
    expect(body.description).toBe("新描述");
  });

  it("404s when editing a non-existent spec", async () => {
    const res = await fetch(`${baseUrl}/specs/missing-id`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "x" }),
    });
    expect(res.status).toBe(404);
  });

  it("404s when creating a spec under a non-existent requirement", async () => {
    const res = await fetch(`${baseUrl}/requirements/missing-id/specs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "x" }),
    });
    expect(res.status).toBe(404);
  });

  it("creates a task with multiple assignees under a spec over HTTP", async () => {
    const requirement = service.createRequirement("會員登入", "測試描述");
    const spec = service.createSpec(requirement.id, "會員登入規格", "測試描述");

    const res = await fetch(`${baseUrl}/specs/${spec.id}/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "開發任務",
        title: "開發",
        assignees: [{ person: "小美" }, { person: "阿凱", estimatedHours: 8 }],
      }),
    });
    expect(res.status).toBe(201);
    const body = await readJson(res);
    expect(body.assignees).toHaveLength(2);
    expect(body.status).toBe("待處理");
  });

  it("400s when creating a task with no assignees", async () => {
    const requirement = service.createRequirement("會員登入", "測試描述");
    const spec = service.createSpec(requirement.id, "會員登入規格", "測試描述");

    const res = await fetch(`${baseUrl}/specs/${spec.id}/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "開發任務", title: "x", assignees: [] }),
    });
    expect(res.status).toBe(400);
  });

  it("404s when creating a task under a non-existent spec", async () => {
    const res = await fetch(`${baseUrl}/specs/missing-id/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "開發任務", title: "x", assignees: [{ person: "我" }] }),
    });
    expect(res.status).toBe(404);
  });

  it("lists all requirements over HTTP", async () => {
    service.createRequirement("需求一", "測試描述");
    service.createRequirement("需求二", "測試描述");

    const res = await fetch(`${baseUrl}/requirements`);
    expect(res.status).toBe(200);
    const body = await readJson(res);
    expect(body).toHaveLength(2);
  });

  it("gets a single requirement's full hierarchy over HTTP", async () => {
    const requirement = service.createRequirement("會員登入", "測試描述");
    const spec = service.createSpec(requirement.id, "會員登入規格", "測試描述");
    service.createTask(spec.id, {
      type: "開發任務",
      title: "開發",
      assignees: [{ person: "小美" }],
    });

    const res = await fetch(`${baseUrl}/requirements/${requirement.id}`);
    expect(res.status).toBe(200);
    const body = await readJson(res);
    expect(body.specs).toHaveLength(1);
    expect(body.specs[0].tasks).toHaveLength(1);
  });

  it("404s when querying a non-existent requirement", async () => {
    const res = await fetch(`${baseUrl}/requirements/missing-id`);
    expect(res.status).toBe(404);
  });

  it("sets a spec's status manually, without validating against its tasks", async () => {
    const requirement = service.createRequirement("會員登入", "測試描述");
    const spec = service.createSpec(requirement.id, "會員登入規格", "測試描述");
    service.createTask(spec.id, {
      type: "開發任務",
      title: "開發",
      assignees: [{ person: "小美" }],
    });

    const res = await fetch(`${baseUrl}/specs/${spec.id}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "完成" }),
    });
    expect(res.status).toBe(200);
    const body = await readJson(res);
    expect(body.status).toBe("完成");

    // 底下的任務仍是待處理，不受規格狀態影響
    const hierarchy = await readJson(await fetch(`${baseUrl}/requirements/${requirement.id}`));
    expect(hierarchy.specs[0].tasks[0].status).toBe("待處理");
  });

  it("404s when setting status on a non-existent spec", async () => {
    const res = await fetch(`${baseUrl}/specs/missing-id/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "完成" }),
    });
    expect(res.status).toBe(404);
  });

  it("sets a requirement's status manually over HTTP", async () => {
    const requirement = service.createRequirement("會員登入", "測試描述");

    const res = await fetch(`${baseUrl}/requirements/${requirement.id}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "暫停" }),
    });
    expect(res.status).toBe(200);
    const body = await readJson(res);
    expect(body.status).toBe("暫停");
  });

  it("404s when setting status on a non-existent requirement", async () => {
    const res = await fetch(`${baseUrl}/requirements/missing-id/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "完成" }),
    });
    expect(res.status).toBe(404);
  });
});
