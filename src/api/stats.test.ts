import type { Server } from "node:http";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTaskService, type TaskService } from "../domain/taskService.js";
import { createApp } from "./app.js";
import { closeServer, createAuthedFetch, listenOnEphemeralPort, readJson, registerAndLogin } from "./testHelpers.js";

describe("API - 月度/季度統計 endpoints", () => {
  let service: TaskService;
  let server: Server;
  let baseUrl: string;
  let specId: string;
  let fetch: typeof globalThis.fetch;

  beforeEach(async () => {
    service = createTaskService();
    const requirement = service.createRequirement("R", "測試描述");
    const spec = service.createSpec(requirement.id, "S", "測試描述");
    specId = spec.id;
    ({ server, baseUrl } = await listenOnEphemeralPort(createApp(service)));
    fetch = createAuthedFetch(await registerAndLogin(baseUrl));
  });

  afterEach(() => closeServer(server));

  it("queries monthly pending/logged hours scoped to a person, over HTTP", async () => {
    const task = service.createTask(specId, {
      type: "開發任務",
      title: "任務A",
      assignees: [{ person: "小美", estimatedHours: 10 }],
    });
    service.logWork(task.id, { person: "小美", date: "2026-07-10", hours: 4 });

    const res = await fetch(`${baseUrl}/stats/monthly?scope=小美&month=2026-07`);
    expect(res.status).toBe(200);
    const body = await readJson(res);
    expect(body).toEqual({ pendingHours: 10, loggedHours: 4 });
  });

  it("queries monthly stats across everyone in 全觀 scope, over HTTP", async () => {
    service.createTask(specId, {
      type: "開發任務",
      title: "任務A",
      assignees: [
        { person: "小美", estimatedHours: 10 },
        { person: "阿凱", estimatedHours: 5 },
      ],
    });

    const res = await fetch(`${baseUrl}/stats/monthly?scope=all&month=2026-07`);
    const body = await readJson(res);
    expect(body.pendingHours).toBe(15);
  });

  it("queries a period estimate-vs-actual report per person, over HTTP", async () => {
    service.createTask(specId, {
      type: "開發任務",
      title: "任務A",
      assignees: [
        { person: "小美", estimatedHours: 20 },
        { person: "阿凱", estimatedHours: 15 },
      ],
    });

    const res = await fetch(`${baseUrl}/stats/period?scope=all&start=2026-07-01&end=2026-09-30`);
    expect(res.status).toBe(200);
    const body = await readJson(res);
    expect(body).toEqual(
      expect.arrayContaining([
        { person: "小美", estimatedHours: 20, actualHours: 0 },
        { person: "阿凱", estimatedHours: 15, actualHours: 0 },
      ]),
    );
  });

  it("scopes the period report to a single person, over HTTP", async () => {
    service.createTask(specId, {
      type: "開發任務",
      title: "任務A",
      assignees: [
        { person: "小美", estimatedHours: 20 },
        { person: "阿凱", estimatedHours: 15 },
      ],
    });

    const res = await fetch(`${baseUrl}/stats/period?scope=小美&start=2026-07-01&end=2026-09-30`);
    const body = await readJson(res);
    expect(body).toEqual([{ person: "小美", estimatedHours: 20, actualHours: 0 }]);
  });
});
