import type { Server } from "node:http";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTaskService, type TaskService } from "../domain/taskService.js";
import { createApp } from "./app.js";
import { closeServer, listenOnEphemeralPort, readJson } from "./testHelpers.js";

describe("API - 單筆查詢 endpoints（GET /tasks/:id、GET /reminders/:id）", () => {
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

  it("gets a single task over HTTP", async () => {
    const task = service.createTask(specId, {
      type: "開發任務",
      title: "任務A",
      assignees: [{ person: "小美" }],
    });

    const res = await fetch(`${baseUrl}/tasks/${task.id}`);
    expect(res.status).toBe(200);
    const body = await readJson(res);
    expect(body.id).toBe(task.id);
    expect(body.assignees).toEqual([{ person: "小美" }]);
  });

  it("404s when getting a non-existent task", async () => {
    const res = await fetch(`${baseUrl}/tasks/missing-id`);
    expect(res.status).toBe(404);
  });

  it("gets a single reminder over HTTP", async () => {
    const reminder = service.createReminder({
      createdBy: "小美",
      assignedTo: "阿凱",
      title: "提醒A",
    });

    const res = await fetch(`${baseUrl}/reminders/${reminder.id}`);
    expect(res.status).toBe(200);
    const body = await readJson(res);
    expect(body.id).toBe(reminder.id);
    expect(body.assignedTo).toBe("阿凱");
  });

  it("404s when getting a non-existent reminder", async () => {
    const res = await fetch(`${baseUrl}/reminders/missing-id`);
    expect(res.status).toBe(404);
  });

  it("returns enriched TodoItem fields via GET /todo", async () => {
    const task = service.createTask(specId, {
      type: "開發任務",
      title: "任務A",
      assignees: [{ person: "小美" }],
    });
    const chore = service.createReminder({ createdBy: "我", assignedTo: "我", title: "雜事" });

    const res = await fetch(`${baseUrl}/todo`);
    const body = await readJson(res);
    const taskItem = body.find((i: { id: string }) => i.id === task.id);
    const choreItem = body.find((i: { id: string }) => i.id === chore.id);

    expect(taskItem.status).toBe("待處理");
    expect(taskItem.owners).toEqual(["小美"]);
    expect(taskItem.isChore).toBe(false);
    expect(choreItem.isChore).toBe(true);
  });
});
