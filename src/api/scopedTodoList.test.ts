import type { Server } from "node:http";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTaskService, type TaskService } from "../domain/taskService.js";
import { createApp } from "./app.js";
import { closeServer, listenOnEphemeralPort, readJson } from "./testHelpers.js";

describe("API - 身分範圍與可見性查詢 endpoint（我/同仁/全觀）", () => {
  let service: TaskService;
  let server: Server;
  let baseUrl: string;
  let specId: string;

  beforeEach(async () => {
    service = createTaskService();
    const requirement = service.createRequirement("R");
    const spec = service.createSpec(requirement.id, "S");
    specId = spec.id;
    ({ server, baseUrl } = await listenOnEphemeralPort(createApp(service)));
  });

  afterEach(() => closeServer(server));

  it("scopes to a single person's tasks by assignee, over HTTP", async () => {
    const xiaomeiTask = service.createTask(specId, {
      type: "開發任務",
      title: "小美的任務",
      assignees: [{ person: "小美" }],
    });
    const aKaiTask = service.createTask(specId, {
      type: "開發任務",
      title: "阿凱的任務",
      assignees: [{ person: "阿凱" }],
    });

    const res = await fetch(`${baseUrl}/todo/scoped?viewer=管理職&scope=小美`);
    expect(res.status).toBe(200);
    const ids = (await readJson(res)).map((i: { id: string }) => i.id);
    expect(ids).toContain(xiaomeiTask.id);
    expect(ids).not.toContain(aKaiTask.id);
  });

  it("shows everyone's tasks in 全觀 (all) scope, over HTTP", async () => {
    const task = service.createTask(specId, {
      type: "開發任務",
      title: "任務",
      assignees: [{ person: "小美" }],
    });

    const res = await fetch(`${baseUrl}/todo/scoped?viewer=管理職&scope=all`);
    const ids = (await readJson(res)).map((i: { id: string }) => i.id);
    expect(ids).toContain(task.id);
  });

  it("defaults to 全觀 (all) scope when scope is omitted", async () => {
    const task = service.createTask(specId, {
      type: "開發任務",
      title: "任務",
      assignees: [{ person: "小美" }],
    });

    const res = await fetch(`${baseUrl}/todo/scoped?viewer=管理職`);
    const ids = (await readJson(res)).map((i: { id: string }) => i.id);
    expect(ids).toContain(task.id);
  });

  it("makes tasks visible to everyone regardless of viewer (ADR-0001)", async () => {
    const task = service.createTask(specId, {
      type: "開發任務",
      title: "任務",
      assignees: [{ person: "小美" }],
    });

    const res = await fetch(`${baseUrl}/todo/scoped?viewer=阿凱&scope=小美`);
    const ids = (await readJson(res)).map((i: { id: string }) => i.id);
    expect(ids).toContain(task.id);
  });

  it("hides another person's unreported personal chore, even in 全觀 scope", async () => {
    const chore = service.createReminder({ createdBy: "小美", assignedTo: "小美", title: "雜事" });

    const res = await fetch(`${baseUrl}/todo/scoped?viewer=管理職&scope=all`);
    const ids = (await readJson(res)).map((i: { id: string }) => i.id);
    expect(ids).not.toContain(chore.id);
  });

  it("always shows the viewer their own personal chores", async () => {
    const chore = service.createReminder({ createdBy: "我", assignedTo: "我", title: "雜事" });

    const res = await fetch(`${baseUrl}/todo/scoped?viewer=我&scope=我`);
    const ids = (await readJson(res)).map((i: { id: string }) => i.id);
    expect(ids).toContain(chore.id);
  });

  it("reveals a personal chore to others once it has been worked on", async () => {
    const chore = service.createReminder({ createdBy: "小美", assignedTo: "小美", title: "雜事" });
    service.logReminderWork(chore.id, { person: "小美", date: "2026-07-27", hours: 1 });

    const res = await fetch(`${baseUrl}/todo/scoped?viewer=管理職&scope=all`);
    const ids = (await readJson(res)).map((i: { id: string }) => i.id);
    expect(ids).toContain(chore.id);
  });
});
