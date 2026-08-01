import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NotFoundError, ValidationError } from "./errors.js";
import { createTaskService, type TaskService } from "./taskService.js";

describe("taskService - 需求/規格/任務 hierarchy", () => {
  let service: TaskService;

  beforeEach(() => {
    service = createTaskService();
  });

  it("creates a requirement", () => {
    const requirement = service.createRequirement("會員登入", "測試描述");
    expect(requirement.title).toBe("會員登入");
    expect(requirement.description).toBe("測試描述");
    expect(requirement.id).toBeTruthy();
  });

  it("creates a spec under a requirement", () => {
    const requirement = service.createRequirement("會員登入", "測試描述");
    const spec = service.createSpec(requirement.id, "會員登入規格", "規格描述");
    expect(spec.requirementId).toBe(requirement.id);
    expect(spec.description).toBe("規格描述");
  });

  it("updates a requirement's title and description", () => {
    const requirement = service.createRequirement("舊標題", "舊描述");
    const updated = service.updateRequirement(requirement.id, { title: "新標題", description: "新描述" });
    expect(updated.title).toBe("新標題");
    expect(updated.description).toBe("新描述");
  });

  it("updates only the field passed to updateRequirement, leaving the other untouched", () => {
    const requirement = service.createRequirement("標題", "描述");
    const updated = service.updateRequirement(requirement.id, { description: "只改描述" });
    expect(updated.title).toBe("標題");
    expect(updated.description).toBe("只改描述");
  });

  it("throws when updating a non-existent requirement", () => {
    expect(() => service.updateRequirement("missing-req", { title: "x" })).toThrowError(NotFoundError);
  });

  it("updates a spec's title and description", () => {
    const requirement = service.createRequirement("會員登入", "測試描述");
    const spec = service.createSpec(requirement.id, "舊標題", "舊描述");
    const updated = service.updateSpec(spec.id, { title: "新標題", description: "新描述" });
    expect(updated.title).toBe("新標題");
    expect(updated.description).toBe("新描述");
  });

  it("throws when updating a non-existent spec", () => {
    expect(() => service.updateSpec("missing-spec", { title: "x" })).toThrowError(NotFoundError);
  });

  it("throws when creating a spec under a non-existent requirement", () => {
    expect(() => service.createSpec("missing-req", "x", "測試描述")).toThrowError();
  });

  it("creates multiple tasks under a spec, each with a single assignee", () => {
    const requirement = service.createRequirement("會員登入", "測試描述");
    const spec = service.createSpec(requirement.id, "會員登入規格", "測試描述");
    const devTask = service.createTask(spec.id, {
      type: "開發任務",
      title: "開發",
      assignees: [{ person: "小美" }],
    });
    const testTask = service.createTask(spec.id, {
      type: "測試任務",
      title: "測試",
      assignees: [{ person: "阿凱" }],
    });
    expect(devTask.assignees.map((a) => a.person)).toEqual(["小美"]);
    expect(testTask.assignees.map((a) => a.person)).toEqual(["阿凱"]);
  });

  it("throws when creating a task under a non-existent spec", () => {
    expect(() =>
      service.createTask("missing-spec", {
        type: "開發任務",
        title: "x",
        assignees: [{ person: "我" }],
      }),
    ).toThrowError();
  });

  it("throws when creating a task with no assignees", () => {
    const requirement = service.createRequirement("會員登入", "測試描述");
    const spec = service.createSpec(requirement.id, "會員登入規格", "測試描述");
    expect(() =>
      service.createTask(spec.id, { type: "開發任務", title: "x", assignees: [] }),
    ).toThrowError();
  });

  it("queries back the full requirement -> spec -> task hierarchy", () => {
    const requirement = service.createRequirement("會員登入", "測試描述");
    const loginSpec = service.createSpec(requirement.id, "會員登入規格", "測試描述");
    const logoutSpec = service.createSpec(requirement.id, "會員登出規格", "測試描述");
    service.createTask(loginSpec.id, {
      type: "開發任務",
      title: "開發登入",
      assignees: [{ person: "小美" }],
    });
    service.createTask(loginSpec.id, {
      type: "測試任務",
      title: "測試登入",
      assignees: [{ person: "阿凱" }],
    });
    service.createTask(logoutSpec.id, {
      type: "開發任務",
      title: "開發登出",
      assignees: [{ person: "小美" }],
    });

    const result = service.getRequirement(requirement.id);

    expect(result.specs).toHaveLength(2);
    const foundLoginSpec = result.specs.find((s) => s.id === loginSpec.id);
    expect(foundLoginSpec?.tasks).toHaveLength(2);
    expect(foundLoginSpec?.tasks.map((t) => t.title)).toEqual(
      expect.arrayContaining(["開發登入", "測試登入"]),
    );
  });

  it("lists all requirements with their nested hierarchy", () => {
    const r1 = service.createRequirement("需求一", "測試描述");
    const r2 = service.createRequirement("需求二", "測試描述");
    service.createSpec(r1.id, "規格A", "測試描述");

    const all = service.listRequirements();

    expect(all).toHaveLength(2);
    expect(all.find((r) => r.id === r1.id)?.specs).toHaveLength(1);
    expect(all.find((r) => r.id === r2.id)?.specs).toHaveLength(0);
  });
});

describe("taskService - 報工 / 工時記錄", () => {
  let service: TaskService;
  let taskId: string;

  beforeEach(() => {
    service = createTaskService();
    const requirement = service.createRequirement("會員登入", "測試描述");
    const spec = service.createSpec(requirement.id, "會員登入規格", "測試描述");
    const task = service.createTask(spec.id, {
      type: "開發任務",
      title: "開發",
      assignees: [{ person: "小美" }],
    });
    taskId = task.id;
  });

  it("records multiple work log entries against a task", () => {
    service.logWork(taskId, { person: "小美", date: "2026-07-24", hours: 6, note: "登入 API" });
    service.logWork(taskId, { person: "小美", date: "2026-07-25", hours: 4, note: "串接前端" });

    const logs = service.getWorkLogs(taskId);
    expect(logs).toHaveLength(2);
  });

  it("accumulates hours across days", () => {
    service.logWork(taskId, { person: "小美", date: "2026-07-24", hours: 6 });
    service.logWork(taskId, { person: "小美", date: "2026-07-25", hours: 4 });

    const total = service
      .getWorkLogs(taskId)
      .reduce((sum, entry) => sum + entry.hours, 0);
    expect(total).toBe(10);
  });

  it("attributes each entry to the person who logged it", () => {
    service.logWork(taskId, { person: "小美", date: "2026-07-24", hours: 6 });
    service.logWork(taskId, { person: "阿凱", date: "2026-07-24", hours: 3 });

    const logs = service.getWorkLogs(taskId);
    const byXiaomei = logs.filter((l) => l.person === "小美");
    const byAKai = logs.filter((l) => l.person === "阿凱");
    expect(byXiaomei.map((l) => l.hours)).toEqual([6]);
    expect(byAKai.map((l) => l.hours)).toEqual([3]);
  });

  it("does not require logging work — a task with no logs has an empty list", () => {
    expect(service.getWorkLogs(taskId)).toEqual([]);
  });

  it("throws when logging work against a non-existent task", () => {
    expect(() =>
      service.logWork("missing-task", { person: "我", date: "2026-07-24", hours: 1 }),
    ).toThrowError();
  });

  it("throws when querying work logs for a non-existent task", () => {
    expect(() => service.getWorkLogs("missing-task")).toThrowError();
  });
});

describe("taskService - 任務多人指派與預計工時拆分", () => {
  let service: TaskService;
  let specId: string;
  let taskId: string;

  beforeEach(() => {
    service = createTaskService();
    const requirement = service.createRequirement("金流串接", "測試描述");
    const spec = service.createSpec(requirement.id, "金流串接規格", "測試描述");
    specId = spec.id;
    const task = service.createTask(spec.id, {
      type: "開發任務",
      title: "金流串接開發",
      assignees: [
        { person: "小美", estimatedHours: 12 },
        { person: "阿凱", estimatedHours: 8 },
      ],
    });
    taskId = task.id;
  });

  it("assigns a task to multiple people without duplicating the task", () => {
    const requirement = service.createRequirement("R", "測試描述");
    const spec = service.createSpec(requirement.id, "S", "測試描述");
    const before = service.getSpecWithTasks(spec.id).tasks.length;
    service.createTask(spec.id, {
      type: "開發任務",
      title: "調研",
      assignees: [{ person: "小美" }, { person: "阿凱" }],
    });
    expect(service.getSpecWithTasks(spec.id).tasks.length).toBe(before + 1);
  });

  it("splits estimated hours per assignee at task creation", () => {
    const task = service.getSpecWithTasks(specId).tasks.find((t) => t.id === taskId)!;
    expect(task.assignees).toEqual(
      expect.arrayContaining([
        { person: "小美", estimatedHours: 12 },
        { person: "阿凱", estimatedHours: 8 },
      ]),
    );
  });

  it("reports estimate vs actual per assignee, based on each person's own work logs", () => {
    service.logWork(taskId, { person: "小美", date: "2026-07-25", hours: 5 });
    service.logWork(taskId, { person: "小美", date: "2026-07-26", hours: 4 });
    service.logWork(taskId, { person: "阿凱", date: "2026-07-25", hours: 3 });

    const report = service.getTaskEstimateVsActual(taskId);

    expect(report).toEqual(
      expect.arrayContaining([
        { person: "小美", estimatedHours: 12, actualHours: 9 },
        { person: "阿凱", estimatedHours: 8, actualHours: 3 },
      ]),
    );
  });

  it("reports zero actual hours for an assignee who hasn't logged any work", () => {
    const report = service.getTaskEstimateVsActual(taskId);
    const aKai = report.find((r) => r.person === "阿凱");
    expect(aKai?.actualHours).toBe(0);
  });

  it("does not count another assignee's hours towards a different person's actual total", () => {
    service.logWork(taskId, { person: "小美", date: "2026-07-25", hours: 5 });

    const report = service.getTaskEstimateVsActual(taskId);
    expect(report.find((r) => r.person === "小美")?.actualHours).toBe(5);
    expect(report.find((r) => r.person === "阿凱")?.actualHours).toBe(0);
  });

  it("throws when querying estimate vs actual for a non-existent task", () => {
    expect(() => service.getTaskEstimateVsActual("missing-task")).toThrowError();
  });
});

describe("taskService - 任務退件與重工回合", () => {
  let service: TaskService;
  let specId: string;
  let taskId: string;

  beforeEach(() => {
    service = createTaskService();
    const requirement = service.createRequirement("報表匯出", "測試描述");
    const spec = service.createSpec(requirement.id, "報表匯出規格", "測試描述");
    specId = spec.id;
    const task = service.createTask(spec.id, {
      type: "開發任務",
      title: "報表匯出開發",
      assignees: [{ person: "小美" }],
    });
    taskId = task.id;
  });

  it("starts a task with a single round 1, open (no endedAt)", () => {
    const rounds = service.getReworkRounds(taskId);
    expect(rounds).toHaveLength(1);
    expect(rounds[0].roundNumber).toBe(1);
    expect(rounds[0].endedAt).toBeUndefined();
  });

  it("creates a new rework round on rejection, closing the previous one", () => {
    service.rejectTask(taskId);

    const rounds = service.getReworkRounds(taskId);
    expect(rounds).toHaveLength(2);
    expect(rounds[0].roundNumber).toBe(1);
    expect(rounds[0].endedAt).toBeTruthy();
    expect(rounds[1].roundNumber).toBe(2);
    expect(rounds[1].endedAt).toBeUndefined();
  });

  it("supports multiple rejections, accumulating rounds without duplicating the task", () => {
    service.rejectTask(taskId);
    service.rejectTask(taskId);
    service.rejectTask(taskId);

    const rounds = service.getReworkRounds(taskId);
    expect(rounds.map((r) => r.roundNumber)).toEqual([1, 2, 3, 4]);

    // 任務在清單上維持一筆，不因退件次數增生
    expect(service.getSpecWithTasks(specId).tasks).toHaveLength(1);
  });

  it("attributes work logs to the currently active round", () => {
    service.logWork(taskId, { person: "小美", date: "2026-07-24", hours: 3 });
    service.rejectTask(taskId);
    service.logWork(taskId, { person: "小美", date: "2026-07-25", hours: 2 });

    const roundsWithLogs = service.getReworkRoundsWithWorkLogs(taskId);
    expect(roundsWithLogs[0].workLogs.map((w) => w.hours)).toEqual([3]);
    expect(roundsWithLogs[1].workLogs.map((w) => w.hours)).toEqual([2]);
  });

  it("keeps the total across all rounds available via getWorkLogs", () => {
    service.logWork(taskId, { person: "小美", date: "2026-07-24", hours: 3 });
    service.rejectTask(taskId);
    service.logWork(taskId, { person: "小美", date: "2026-07-25", hours: 2 });

    const total = service
      .getWorkLogs(taskId)
      .reduce((sum, entry) => sum + entry.hours, 0);
    expect(total).toBe(5);
  });

  it("throws when rejecting a non-existent task", () => {
    expect(() => service.rejectTask("missing-task")).toThrowError();
  });

  it("throws when querying rework rounds for a non-existent task", () => {
    expect(() => service.getReworkRounds("missing-task")).toThrowError();
    expect(() => service.getReworkRoundsWithWorkLogs("missing-task")).toThrowError();
  });
});

describe("taskService - 任務狀態機（待處理/進行中/暫停/完成）", () => {
  let service: TaskService;
  let specId: string;
  let taskId: string;

  beforeEach(() => {
    service = createTaskService();
    const requirement = service.createRequirement("報表匯出", "測試描述");
    const spec = service.createSpec(requirement.id, "報表匯出規格", "測試描述");
    specId = spec.id;
    const task = service.createTask(spec.id, {
      type: "開發任務",
      title: "報表匯出開發",
      assignees: [{ person: "小美" }],
    });
    taskId = task.id;
  });

  it("starts a task as 待處理", () => {
    const task = service.getSpecWithTasks(specId).tasks.find((t) => t.id === taskId);
    expect(task?.status).toBe("待處理");
  });

  it("moves 待處理 -> 進行中 -> 完成", () => {
    expect(service.startTask(taskId).status).toBe("進行中");
    expect(service.completeTask(taskId).status).toBe("完成");
  });

  it("rejects starting a task that is not 待處理", () => {
    service.startTask(taskId);
    expect(() => service.startTask(taskId)).toThrowError();
  });

  it("rejects completing a task that is not 進行中", () => {
    expect(() => service.completeTask(taskId)).toThrowError();
  });

  it("pauses from 待處理 and resumes back to 待處理", () => {
    const paused = service.pauseTask(taskId);
    expect(paused.status).toBe("暫停");
    expect(paused.pausedFrom).toBe("待處理");
    const resumed = service.resumeTask(taskId);
    expect(resumed.status).toBe("待處理");
    expect(resumed.pausedFrom).toBeUndefined();
  });

  it("pauses from 進行中 and resumes back to 進行中", () => {
    service.startTask(taskId);
    service.pauseTask(taskId);
    const resumed = service.resumeTask(taskId);
    expect(resumed.status).toBe("進行中");
  });

  it("rejects pausing a task that is already 完成", () => {
    service.startTask(taskId);
    service.completeTask(taskId);
    expect(() => service.pauseTask(taskId)).toThrowError();
  });

  it("rejects resuming a task that is not currently 暫停", () => {
    expect(() => service.resumeTask(taskId)).toThrowError();
  });

  it("throws for status transitions on a non-existent task", () => {
    expect(() => service.startTask("missing-task")).toThrowError();
    expect(() => service.completeTask("missing-task")).toThrowError();
    expect(() => service.pauseTask("missing-task")).toThrowError();
    expect(() => service.resumeTask("missing-task")).toThrowError();
  });
});

describe("taskService - 任務取消/復原（ADR-0004）", () => {
  let service: TaskService;
  let taskId: string;

  beforeEach(() => {
    service = createTaskService();
    const requirement = service.createRequirement("報表匯出", "測試描述");
    const spec = service.createSpec(requirement.id, "報表匯出規格", "測試描述");
    const task = service.createTask(spec.id, {
      type: "開發任務",
      title: "報表匯出開發",
      assignees: [{ person: "小美" }],
    });
    taskId = task.id;
  });

  it("cancels from 待處理 and restores back to 待處理", () => {
    const cancelled = service.cancelTask(taskId);
    expect(cancelled.status).toBe("已取消");
    expect(cancelled.cancelledFrom).toBe("待處理");
    const restored = service.restoreTask(taskId);
    expect(restored.status).toBe("待處理");
    expect(restored.cancelledFrom).toBeUndefined();
  });

  it("cancels from 進行中 and restores back to 進行中", () => {
    service.startTask(taskId);
    service.cancelTask(taskId);
    const restored = service.restoreTask(taskId);
    expect(restored.status).toBe("進行中");
  });

  it("cancels from 暫停 and restores back to 暫停", () => {
    service.pauseTask(taskId);
    const cancelled = service.cancelTask(taskId);
    expect(cancelled.status).toBe("已取消");
    expect(cancelled.cancelledFrom).toBe("暫停");
    const restored = service.restoreTask(taskId);
    expect(restored.status).toBe("暫停");
  });

  it("rejects cancelling a task that is already 完成", () => {
    service.startTask(taskId);
    service.completeTask(taskId);
    expect(() => service.cancelTask(taskId)).toThrowError(ValidationError);
  });

  it("rejects restoring a task that is not currently 已取消", () => {
    expect(() => service.restoreTask(taskId)).toThrowError(ValidationError);
  });

  it("throws for cancel/restore on a non-existent task", () => {
    expect(() => service.cancelTask("missing-task")).toThrowError(NotFoundError);
    expect(() => service.restoreTask("missing-task")).toThrowError(NotFoundError);
  });
});

describe("taskService - 任務編輯（issue #55）", () => {
  let service: TaskService;
  let specId: string;
  let otherSpecId: string;
  let taskId: string;

  beforeEach(() => {
    service = createTaskService();
    const requirement = service.createRequirement("報表匯出", "測試描述");
    const spec = service.createSpec(requirement.id, "報表匯出規格", "測試描述");
    specId = spec.id;
    const otherSpec = service.createSpec(requirement.id, "另一個規格", "測試描述");
    otherSpecId = otherSpec.id;
    const task = service.createTask(specId, {
      type: "開發任務",
      title: "報表匯出開發",
      assignees: [{ person: "小美" }],
      priority: "中",
      dueDate: "2026-08-01",
    });
    taskId = task.id;
  });

  it("updates each editable field independently, leaving the others untouched", () => {
    const afterTitle = service.updateTask(taskId, { title: "新標題" });
    expect(afterTitle.title).toBe("新標題");
    expect(afterTitle.priority).toBe("中");

    const afterPriority = service.updateTask(taskId, { priority: "高" });
    expect(afterPriority.priority).toBe("高");
    expect(afterPriority.title).toBe("新標題");

    const afterDueDate = service.updateTask(taskId, { dueDate: "2026-09-01" });
    expect(afterDueDate.dueDate).toBe("2026-09-01");

    const afterType = service.updateTask(taskId, { type: "測試任務" });
    expect(afterType.type).toBe("測試任務");

    const afterSpec = service.updateTask(taskId, { specId: otherSpecId });
    expect(afterSpec.specId).toBe(otherSpecId);
    // 移動到新規格後，舊規格底下就不再列出這個任務
    expect(service.getSpecWithTasks(specId).tasks.map((t) => t.id)).not.toContain(taskId);
    expect(service.getSpecWithTasks(otherSpecId).tasks.map((t) => t.id)).toContain(taskId);
  });

  it("updates multiple fields together in a single call", () => {
    const updated = service.updateTask(taskId, {
      title: "合併更新",
      priority: "低",
      dueDate: "2026-10-01",
    });
    expect(updated.title).toBe("合併更新");
    expect(updated.priority).toBe("低");
    expect(updated.dueDate).toBe("2026-10-01");
  });

  it("replaces the assignee list wholesale, adding and removing people", () => {
    const updated = service.updateTask(taskId, {
      assignees: [{ person: "阿凱" }, { person: "小美", estimatedHours: 5 }],
    });
    expect(updated.assignees).toEqual(
      expect.arrayContaining([{ person: "阿凱" }, { person: "小美", estimatedHours: 5 }]),
    );
  });

  it("keeps a removed assignee's existing work logs intact and queryable", () => {
    service.logWork(taskId, { person: "小美", date: "2026-07-24", hours: 6, note: "已完成的部分" });
    service.updateTask(taskId, { assignees: [{ person: "阿凱" }] });

    const logs = service.getWorkLogs(taskId);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ person: "小美", hours: 6, note: "已完成的部分" });
  });

  it("rejects clearing all assignees", () => {
    expect(() => service.updateTask(taskId, { assignees: [] })).toThrowError(ValidationError);
  });

  it("throws when moving a task into a non-existent spec", () => {
    expect(() => service.updateTask(taskId, { specId: "missing-spec" })).toThrowError(NotFoundError);
  });

  it("throws when editing a non-existent task", () => {
    expect(() => service.updateTask("missing-task", { title: "x" })).toThrowError(NotFoundError);
  });
});

describe("taskService - 規格/需求獨立狀態欄位", () => {
  let service: TaskService;
  let requirementId: string;
  let specId: string;

  beforeEach(() => {
    service = createTaskService();
    const requirement = service.createRequirement("金流串接", "測試描述");
    requirementId = requirement.id;
    const spec = service.createSpec(requirement.id, "金流串接規格", "測試描述");
    specId = spec.id;
  });

  it("starts a requirement and spec as 待處理", () => {
    expect(service.getRequirement(requirementId).status).toBe("待處理");
    expect(service.getSpecWithTasks(specId).status).toBe("待處理");
  });

  it("lets the manager set a spec's status directly, to any value", () => {
    expect(service.setSpecStatus(specId, "進行中").status).toBe("進行中");
    expect(service.setSpecStatus(specId, "暫停").status).toBe("暫停");
    expect(service.setSpecStatus(specId, "完成").status).toBe("完成");
    expect(service.setSpecStatus(specId, "待處理").status).toBe("待處理");
  });

  it("lets the manager set a requirement's status directly, to any value", () => {
    expect(service.setRequirementStatus(requirementId, "完成").status).toBe("完成");
  });

  it("does not validate a spec's status against its tasks' statuses", () => {
    service.createTask(specId, {
      type: "開發任務",
      title: "開發",
      assignees: [{ person: "小美" }],
    });
    // 底下任務還是「待處理」，但規格可以直接手動標記為完成
    const spec = service.setSpecStatus(specId, "完成");
    expect(spec.status).toBe("完成");
    const task = service.getSpecWithTasks(specId).tasks[0];
    expect(task.status).toBe("待處理");
  });

  it("throws when setting status on a non-existent spec or requirement", () => {
    expect(() => service.setSpecStatus("missing-spec", "完成")).toThrowError();
    expect(() => service.setRequirementStatus("missing-req", "完成")).toThrowError();
  });
});

describe("taskService - 提醒建立、規格自動掛勾與雜事可見性規則", () => {
  let service: TaskService;
  let specId: string;

  beforeEach(() => {
    service = createTaskService();
    const requirement = service.createRequirement("會員登入", "測試描述");
    const spec = service.createSpec(requirement.id, "會員登入規格", "測試描述");
    specId = spec.id;
  });

  it("lets anyone create a reminder for anyone, including for themselves", () => {
    const forColleague = service.createReminder({
      createdBy: "小美",
      assignedTo: "阿凱",
      title: "幫忙看一下測試環境",
    });
    const forSelf = service.createReminder({
      createdBy: "我",
      assignedTo: "我",
      title: "訂會議室辦季度檢討",
    });
    expect(forColleague.assignedTo).toBe("阿凱");
    expect(forSelf.assignedTo).toBe("我");
  });

  it("treats a reminder created by oneself for oneself, with no spec, as a personal chore", () => {
    const chore = service.createReminder({
      createdBy: "我",
      assignedTo: "我",
      title: "設定新同仁帳號權限",
    });
    expect(service.isChore(chore)).toBe(true);
  });

  it("does not treat a self-reminder linked to a spec as a chore", () => {
    const notAChore = service.createReminder({
      createdBy: "我",
      assignedTo: "我",
      title: "規格書欄位代號寫錯，通知 SA 調整",
      specId,
    });
    expect(service.isChore(notAChore)).toBe(false);
  });

  it("does not treat a reminder for someone else as a chore, even with no spec", () => {
    const notAChore = service.createReminder({
      createdBy: "小美",
      assignedTo: "阿凱",
      title: "幫忙建立 git repo",
    });
    expect(service.isChore(notAChore)).toBe(false);
  });

  it("auto-links a reminder to a spec when a specId is supplied at creation", () => {
    const reminder = service.createReminder({
      createdBy: "小美",
      assignedTo: "阿凱",
      title: "規格書欄位代號寫錯",
      specId,
    });
    expect(reminder.specId).toBe(specId);
  });

  it("throws when linking a reminder to a non-existent spec", () => {
    expect(() =>
      service.createReminder({
        createdBy: "我",
        assignedTo: "我",
        title: "x",
        specId: "missing-spec",
      }),
    ).toThrowError();
  });

  it("hides an unreported personal chore from everyone but its creator", () => {
    const chore = service.createReminder({
      createdBy: "我",
      assignedTo: "我",
      title: "設定新同仁帳號權限",
    });

    expect(service.listRemindersVisibleTo("我").map((r) => r.id)).toContain(chore.id);
    expect(service.listRemindersVisibleTo("管理職").map((r) => r.id)).not.toContain(chore.id);
  });

  it("makes a personal chore visible to others once it has been worked on", () => {
    const chore = service.createReminder({
      createdBy: "我",
      assignedTo: "我",
      title: "設定新同仁帳號權限",
    });
    service.logReminderWork(chore.id, { person: "我", date: "2026-07-27", hours: 1 });

    expect(service.listRemindersVisibleTo("管理職").map((r) => r.id)).toContain(chore.id);
  });

  it("always shows non-chore reminders to everyone", () => {
    const reminder = service.createReminder({
      createdBy: "小美",
      assignedTo: "阿凱",
      title: "幫忙建立 git repo",
    });

    expect(service.listRemindersVisibleTo("管理職").map((r) => r.id)).toContain(reminder.id);
  });

  it("starts a reminder as 未處理 and can be closed", () => {
    const reminder = service.createReminder({
      createdBy: "我",
      assignedTo: "我",
      title: "x",
    });
    expect(reminder.status).toBe("未處理");
    expect(service.closeReminder(reminder.id).status).toBe("已結案");
  });

  it("does not change a reminder's status when work is logged against it", () => {
    const reminder = service.createReminder({
      createdBy: "我",
      assignedTo: "我",
      title: "x",
    });
    service.logReminderWork(reminder.id, { person: "我", date: "2026-07-27", hours: 2 });
    expect(reminder.status).toBe("未處理");
  });

  it("throws when closing an already-closed reminder", () => {
    const reminder = service.createReminder({ createdBy: "我", assignedTo: "我", title: "x" });
    service.closeReminder(reminder.id);
    expect(() => service.closeReminder(reminder.id)).toThrowError();
  });

  it("throws when logging work or closing a non-existent reminder", () => {
    expect(() => service.closeReminder("missing-reminder")).toThrowError();
    expect(() =>
      service.logReminderWork("missing-reminder", { person: "我", date: "2026-07-27", hours: 1 }),
    ).toThrowError();
  });

  it("throws when querying work logs for a non-existent reminder", () => {
    expect(() => service.getReminderWorkLogs("missing-reminder")).toThrowError();
  });
});

describe("taskService - 提醒升級為正式任務", () => {
  let service: TaskService;
  let specId: string;
  let reminderId: string;

  beforeEach(() => {
    service = createTaskService();
    const requirement = service.createRequirement("會員登入", "測試描述");
    const spec = service.createSpec(requirement.id, "會員登入規格", "測試描述");
    specId = spec.id;
    const reminder = service.createReminder({
      createdBy: "小美",
      assignedTo: "阿凱",
      title: "規格書欄位代號寫錯，通知 SA 調整",
      specId,
    });
    reminderId = reminder.id;
  });

  it("promotes a reminder into a task under the given spec", () => {
    const task = service.promoteReminderToTask(reminderId, {
      specId,
      type: "開發任務",
      assignees: [{ person: "阿凱" }],
    });
    expect(task.specId).toBe(specId);
    expect(task.title).toBe("規格書欄位代號寫錯，通知 SA 調整");
  });

  it("applies the task's four-state machine after promotion, not the reminder's two states", () => {
    const task = service.promoteReminderToTask(reminderId, {
      specId,
      type: "開發任務",
      assignees: [{ person: "阿凱" }],
    });
    expect(task.status).toBe("待處理");
    expect(service.startTask(task.id).status).toBe("進行中");
    expect(service.pauseTask(task.id).status).toBe("暫停");
  });

  it("does not leave the original reminder around after promotion — no duplicate record", () => {
    service.promoteReminderToTask(reminderId, {
      specId,
      type: "開發任務",
      assignees: [{ person: "阿凱" }],
    });
    expect(
      service.listRemindersVisibleTo("小美").map((r) => r.id),
    ).not.toContain(reminderId);
  });

  it("results in exactly one task under the spec, not a duplicate", () => {
    service.promoteReminderToTask(reminderId, {
      specId,
      type: "開發任務",
      assignees: [{ person: "阿凱" }],
    });
    expect(service.getSpecWithTasks(specId).tasks).toHaveLength(1);
  });

  it("throws when promoting a non-existent reminder", () => {
    expect(() =>
      service.promoteReminderToTask("missing-reminder", {
        specId,
        type: "開發任務",
        assignees: [{ person: "阿凱" }],
      }),
    ).toThrowError();
  });

  it("throws when promoting into a non-existent spec", () => {
    expect(() =>
      service.promoteReminderToTask(reminderId, {
        specId: "missing-spec",
        type: "開發任務",
        assignees: [{ person: "阿凱" }],
      }),
    ).toThrowError();
  });
});

describe("taskService - 混合排序（優先級＋到期日，含手動覆蓋）", () => {
  let service: TaskService;
  let specId: string;

  beforeEach(() => {
    service = createTaskService();
    const requirement = service.createRequirement("R", "測試描述");
    const spec = service.createSpec(requirement.id, "S", "測試描述");
    specId = spec.id;
  });

  it("mixes tasks and reminders into a single sorted list", () => {
    const task = service.createTask(specId, {
      type: "開發任務",
      title: "任務A",
      assignees: [{ person: "小美" }],
      priority: "中",
    });
    const reminder = service.createReminder({
      createdBy: "我",
      assignedTo: "我",
      title: "提醒B",
      priority: "中",
    });

    const list = service.getTodoList();
    const ids = list.map((i) => i.id);
    expect(ids).toEqual(expect.arrayContaining([task.id, reminder.id]));
  });

  it("enriches a task item with status, specId, and owners", () => {
    const task = service.createTask(specId, {
      type: "開發任務",
      title: "任務A",
      assignees: [{ person: "小美" }, { person: "阿凱" }],
      priority: "中",
    });

    const item = service.getTodoList().find((i) => i.id === task.id)!;
    expect(item.status).toBe("待處理");
    expect(item.specId).toBe(specId);
    expect(item.owners).toEqual(expect.arrayContaining(["小美", "阿凱"]));
    expect(item.isChore).toBe(false);
  });

  it("enriches a reminder item with status, assignedTo as owner, and isChore", () => {
    const chore = service.createReminder({ createdBy: "我", assignedTo: "我", title: "雜事" });
    const notChore = service.createReminder({
      createdBy: "小美",
      assignedTo: "阿凱",
      title: "提醒",
    });

    const list = service.getTodoList();
    const choreItem = list.find((i) => i.id === chore.id)!;
    const notChoreItem = list.find((i) => i.id === notChore.id)!;

    expect(choreItem.status).toBe("未處理");
    expect(choreItem.owners).toEqual(["我"]);
    expect(choreItem.isChore).toBe(true);
    expect(notChoreItem.owners).toEqual(["阿凱"]);
    expect(notChoreItem.isChore).toBe(false);
  });

  it("carries closedDate once an item is completed/closed", () => {
    const task = service.createTask(specId, {
      type: "開發任務",
      title: "任務A",
      assignees: [{ person: "小美" }],
    });
    service.startTask(task.id);
    service.completeTask(task.id);

    const item = service.getTodoList().find((i) => i.id === task.id)!;
    expect(item.status).toBe("完成");
    expect(item.closedDate).toBeTruthy();
  });

  it("defaults to priority first, higher priority before lower", () => {
    const low = service.createTask(specId, {
      type: "開發任務",
      title: "低",
      assignees: [{ person: "小美" }],
      priority: "低",
    });
    const high = service.createTask(specId, {
      type: "開發任務",
      title: "高",
      assignees: [{ person: "小美" }],
      priority: "高",
    });
    const mid = service.createTask(specId, {
      type: "開發任務",
      title: "中",
      assignees: [{ person: "小美" }],
      priority: "中",
    });

    const ids = service.getTodoList().map((i) => i.id);
    expect(ids.indexOf(high.id)).toBeLessThan(ids.indexOf(mid.id));
    expect(ids.indexOf(mid.id)).toBeLessThan(ids.indexOf(low.id));
  });

  it("breaks ties within the same priority by due date, earlier first", () => {
    const later = service.createTask(specId, {
      type: "開發任務",
      title: "晚",
      assignees: [{ person: "小美" }],
      priority: "中",
      dueDate: "2026-08-01",
    });
    const earlier = service.createTask(specId, {
      type: "開發任務",
      title: "早",
      assignees: [{ person: "小美" }],
      priority: "中",
      dueDate: "2026-07-28",
    });

    const ids = service.getTodoList().map((i) => i.id);
    expect(ids.indexOf(earlier.id)).toBeLessThan(ids.indexOf(later.id));
  });

  it("sorts items without a due date after items with one, within the same priority", () => {
    const noDue = service.createTask(specId, {
      type: "開發任務",
      title: "無期限",
      assignees: [{ person: "小美" }],
      priority: "中",
    });
    const withDue = service.createTask(specId, {
      type: "開發任務",
      title: "有期限",
      assignees: [{ person: "小美" }],
      priority: "中",
      dueDate: "2026-07-28",
    });

    const ids = service.getTodoList().map((i) => i.id);
    expect(ids.indexOf(withDue.id)).toBeLessThan(ids.indexOf(noDue.id));
  });

  it("puts manually-ordered items first, in the position they were moved to", () => {
    const a = service.createTask(specId, {
      type: "開發任務",
      title: "A",
      assignees: [{ person: "小美" }],
      priority: "高",
    });
    const b = service.createTask(specId, {
      type: "開發任務",
      title: "B",
      assignees: [{ person: "小美" }],
      priority: "低",
    });

    // 手動把優先級較低的 b 排到最前面，覆蓋預設排序
    service.moveTodoItem(b.id, 0);

    const ids = service.getTodoList().map((i) => i.id);
    expect(ids[0]).toBe(b.id);
    expect(ids.indexOf(a.id)).toBeGreaterThan(ids.indexOf(b.id));
  });

  it("keeps the manually-ordered relative order stable when a new item is added", () => {
    const a = service.createTask(specId, {
      type: "開發任務",
      title: "A",
      assignees: [{ person: "小美" }],
      priority: "低",
    });
    const b = service.createTask(specId, {
      type: "開發任務",
      title: "B",
      assignees: [{ person: "小美" }],
      priority: "低",
    });
    service.moveTodoItem(b.id, 0);
    service.moveTodoItem(a.id, 1);

    // 新項目不會自動插進手動區塊，只會被預設排序附加在後面
    const c = service.createTask(specId, {
      type: "開發任務",
      title: "C",
      assignees: [{ person: "小美" }],
      priority: "高",
    });

    const ids = service.getTodoList().map((i) => i.id);
    expect(ids.slice(0, 2)).toEqual([b.id, a.id]);
    expect(ids[2]).toBe(c.id);
  });

  it("throws when moving a non-existent item", () => {
    expect(() => service.moveTodoItem("missing-item", 0)).toThrowError();
  });
});

describe("taskService - 身分範圍查詢與可見性（我/同仁/全觀）", () => {
  let service: TaskService;
  let specId: string;

  beforeEach(() => {
    service = createTaskService();
    const requirement = service.createRequirement("R", "測試描述");
    const spec = service.createSpec(requirement.id, "S", "測試描述");
    specId = spec.id;
  });

  it("scopes to a single person's tasks by assignee", () => {
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

    const ids = service
      .getScopedTodoList("管理職", { person: "小美" })
      .map((i) => i.id);
    expect(ids).toContain(xiaomeiTask.id);
    expect(ids).not.toContain(aKaiTask.id);
  });

  it("includes a task in a person's scope if they are one of several assignees", () => {
    const sharedTask = service.createTask(specId, {
      type: "開發任務",
      title: "調研",
      assignees: [{ person: "小美" }, { person: "阿凱" }],
    });

    const ids = service.getScopedTodoList("管理職", { person: "阿凱" }).map((i) => i.id);
    expect(ids).toContain(sharedTask.id);
  });

  it("shows everyone's tasks and reminders in 全觀 (all) scope", () => {
    const task = service.createTask(specId, {
      type: "開發任務",
      title: "任務",
      assignees: [{ person: "小美" }],
    });
    const reminder = service.createReminder({
      createdBy: "阿凱",
      assignedTo: "小美",
      title: "提醒",
    });

    const ids = service.getScopedTodoList("管理職", "all").map((i) => i.id);
    expect(ids).toEqual(expect.arrayContaining([task.id, reminder.id]));
  });

  it("makes task progress and work logs publicly visible to everyone (ADR-0001)", () => {
    const task = service.createTask(specId, {
      type: "開發任務",
      title: "任務",
      assignees: [{ person: "小美" }],
    });

    const ids = service.getScopedTodoList("阿凱", { person: "小美" }).map((i) => i.id);
    expect(ids).toContain(task.id);
  });

  it("hides another person's unreported personal chore, even in 全觀 scope", () => {
    const chore = service.createReminder({
      createdBy: "小美",
      assignedTo: "小美",
      title: "雜事",
    });

    const ids = service.getScopedTodoList("管理職", "all").map((i) => i.id);
    expect(ids).not.toContain(chore.id);
  });

  it("always shows the viewer their own personal chores, in any scope", () => {
    const chore = service.createReminder({
      createdBy: "我",
      assignedTo: "我",
      title: "雜事",
    });

    expect(
      service.getScopedTodoList("我", { person: "我" }).map((i) => i.id),
    ).toContain(chore.id);
    expect(service.getScopedTodoList("我", "all").map((i) => i.id)).toContain(chore.id);
  });

  it("reveals a personal chore to others once it has been worked on", () => {
    const chore = service.createReminder({
      createdBy: "小美",
      assignedTo: "小美",
      title: "雜事",
    });
    service.logReminderWork(chore.id, { person: "小美", date: "2026-07-27", hours: 1 });

    const ids = service.getScopedTodoList("管理職", "all").map((i) => i.id);
    expect(ids).toContain(chore.id);
  });
});

describe("taskService - 完成項目下架看板查詢（ADR-0002）", () => {
  let service: TaskService;
  let specId: string;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-27T10:00:00Z"));
    service = createTaskService();
    const requirement = service.createRequirement("R", "測試描述");
    const spec = service.createSpec(requirement.id, "S", "測試描述");
    specId = spec.id;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("keeps not-yet-completed tasks in the active list", () => {
    const task = service.createTask(specId, {
      type: "開發任務",
      title: "任務",
      assignees: [{ person: "小美" }],
    });

    expect(service.getActiveTodoList().map((i) => i.id)).toContain(task.id);
  });

  it("keeps a task completed today in the active list, and surfaces it as recently completed", () => {
    const task = service.createTask(specId, {
      type: "開發任務",
      title: "任務",
      assignees: [{ person: "小美" }],
    });
    service.startTask(task.id);
    service.completeTask(task.id);

    expect(service.getActiveTodoList().map((i) => i.id)).toContain(task.id);
    expect(service.getRecentlyCompletedTodoList().map((i) => i.id)).toContain(task.id);
  });

  it("drops a task off both the active and recently-completed lists the day after it's completed", () => {
    const task = service.createTask(specId, {
      type: "開發任務",
      title: "任務",
      assignees: [{ person: "小美" }],
    });
    service.startTask(task.id);
    service.completeTask(task.id);

    vi.setSystemTime(new Date("2026-07-28T10:00:00Z"));

    expect(service.getActiveTodoList().map((i) => i.id)).not.toContain(task.id);
    expect(service.getRecentlyCompletedTodoList().map((i) => i.id)).not.toContain(task.id);
  });

  it("applies the same rule to closed reminders", () => {
    const reminder = service.createReminder({
      createdBy: "我",
      assignedTo: "我",
      title: "提醒",
    });
    service.closeReminder(reminder.id);

    expect(service.getActiveTodoList().map((i) => i.id)).toContain(reminder.id);
    expect(service.getRecentlyCompletedTodoList().map((i) => i.id)).toContain(reminder.id);

    vi.setSystemTime(new Date("2026-07-28T10:00:00Z"));

    expect(service.getActiveTodoList().map((i) => i.id)).not.toContain(reminder.id);
    expect(service.getRecentlyCompletedTodoList().map((i) => i.id)).not.toContain(reminder.id);
  });

  it("does not surface an unclosed reminder as recently completed", () => {
    const reminder = service.createReminder({
      createdBy: "我",
      assignedTo: "我",
      title: "提醒",
    });

    expect(service.getRecentlyCompletedTodoList().map((i) => i.id)).not.toContain(reminder.id);
  });

  it("applies the same drop-off rule to a cancelled task (ADR-0004)", () => {
    const task = service.createTask(specId, {
      type: "開發任務",
      title: "任務",
      assignees: [{ person: "小美" }],
    });
    service.cancelTask(task.id);

    expect(service.getActiveTodoList().map((i) => i.id)).toContain(task.id);
    expect(service.getRecentlyCompletedTodoList().map((i) => i.id)).toContain(task.id);

    vi.setSystemTime(new Date("2026-07-28T10:00:00Z"));

    expect(service.getActiveTodoList().map((i) => i.id)).not.toContain(task.id);
    expect(service.getRecentlyCompletedTodoList().map((i) => i.id)).not.toContain(task.id);
  });

  it("applies the same drop-off rule to a cancelled reminder (issue #57)", () => {
    const reminder = service.createReminder({ createdBy: "我", assignedTo: "我", title: "提醒" });
    service.cancelReminder(reminder.id);

    expect(service.getActiveTodoList().map((i) => i.id)).toContain(reminder.id);
    expect(service.getRecentlyCompletedTodoList().map((i) => i.id)).toContain(reminder.id);

    vi.setSystemTime(new Date("2026-07-28T10:00:00Z"));

    expect(service.getActiveTodoList().map((i) => i.id)).not.toContain(reminder.id);
    expect(service.getRecentlyCompletedTodoList().map((i) => i.id)).not.toContain(reminder.id);
  });
});

describe("taskService - 提醒取消/復原（issue #57）", () => {
  let service: TaskService;
  let reminderId: string;

  beforeEach(() => {
    service = createTaskService();
    const reminder = service.createReminder({ createdBy: "小美", assignedTo: "阿凱", title: "提醒A" });
    reminderId = reminder.id;
  });

  it("cancels from 未處理 and restores back to 未處理", () => {
    const cancelled = service.cancelReminder(reminderId);
    expect(cancelled.status).toBe("已取消");
    expect(cancelled.closedDate).toBeTruthy();
    const restored = service.restoreReminder(reminderId);
    expect(restored.status).toBe("未處理");
    expect(restored.closedDate).toBeUndefined();
  });

  it("rejects cancelling a reminder that is already 已結案", () => {
    service.closeReminder(reminderId);
    expect(() => service.cancelReminder(reminderId)).toThrowError(ValidationError);
  });

  it("rejects cancelling an already-cancelled reminder", () => {
    service.cancelReminder(reminderId);
    expect(() => service.cancelReminder(reminderId)).toThrowError(ValidationError);
  });

  it("rejects restoring a reminder that is not currently 已取消", () => {
    expect(() => service.restoreReminder(reminderId)).toThrowError(ValidationError);
  });

  it("rejects restoring an already-closed reminder", () => {
    service.closeReminder(reminderId);
    expect(() => service.restoreReminder(reminderId)).toThrowError(ValidationError);
  });

  it("throws for cancel/restore on a non-existent reminder", () => {
    expect(() => service.cancelReminder("missing-reminder")).toThrowError(NotFoundError);
    expect(() => service.restoreReminder("missing-reminder")).toThrowError(NotFoundError);
  });
});

describe("taskService - 提醒編輯（issue #58）", () => {
  let service: TaskService;
  let specId: string;
  let otherSpecId: string;
  let reminderId: string;

  beforeEach(() => {
    service = createTaskService();
    const requirement = service.createRequirement("R", "測試描述");
    const spec = service.createSpec(requirement.id, "S", "測試描述");
    specId = spec.id;
    const otherSpec = service.createSpec(requirement.id, "另一個規格", "測試描述");
    otherSpecId = otherSpec.id;
    const reminder = service.createReminder({
      createdBy: "小美",
      assignedTo: "阿凱",
      title: "提醒A",
      priority: "中",
      dueDate: "2026-08-01",
    });
    reminderId = reminder.id;
  });

  it("updates each editable field independently, leaving the others untouched", () => {
    const afterTitle = service.updateReminder(reminderId, { title: "新標題" });
    expect(afterTitle.title).toBe("新標題");
    expect(afterTitle.priority).toBe("中");

    const afterPriority = service.updateReminder(reminderId, { priority: "高" });
    expect(afterPriority.priority).toBe("高");
    expect(afterPriority.title).toBe("新標題");

    const afterDueDate = service.updateReminder(reminderId, { dueDate: "2026-09-01" });
    expect(afterDueDate.dueDate).toBe("2026-09-01");

    const afterAssignee = service.updateReminder(reminderId, { assignedTo: "小美" });
    expect(afterAssignee.assignedTo).toBe("小美");

    const afterSpec = service.updateReminder(reminderId, { specId });
    expect(afterSpec.specId).toBe(specId);
  });

  it("updates multiple fields together in a single call", () => {
    const updated = service.updateReminder(reminderId, {
      title: "合併更新",
      priority: "低",
      dueDate: "2026-10-01",
      specId: otherSpecId,
    });
    expect(updated.title).toBe("合併更新");
    expect(updated.priority).toBe("低");
    expect(updated.dueDate).toBe("2026-10-01");
    expect(updated.specId).toBe(otherSpecId);
  });

  it("demotes a reminder from 一般提醒 to 個人雜事 when assignedTo changes to match createdBy, with no spec", () => {
    const reminder = service.createReminder({ createdBy: "我", assignedTo: "小美", title: "幫忙看一下" });
    expect(service.isChore(reminder)).toBe(false);

    const updated = service.updateReminder(reminder.id, { assignedTo: "我" });
    expect(service.isChore(updated)).toBe(true);
  });

  it("promotes a reminder from 個人雜事 to 一般提醒 when assignedTo changes to someone else", () => {
    const chore = service.createReminder({ createdBy: "我", assignedTo: "我", title: "設定新同仁帳號權限" });
    expect(service.isChore(chore)).toBe(true);

    const updated = service.updateReminder(chore.id, { assignedTo: "小美" });
    expect(service.isChore(updated)).toBe(false);
  });

  it("throws when moving a reminder into a non-existent spec", () => {
    expect(() => service.updateReminder(reminderId, { specId: "missing-spec" })).toThrowError(NotFoundError);
  });

  it("throws when editing a non-existent reminder", () => {
    expect(() => service.updateReminder("missing-reminder", { title: "x" })).toThrowError(NotFoundError);
  });
});

describe("taskService - 月度與季度/半年工時統計聚合", () => {
  let service: TaskService;
  let specId: string;

  beforeEach(() => {
    service = createTaskService();
    const requirement = service.createRequirement("R", "測試描述");
    const spec = service.createSpec(requirement.id, "S", "測試描述");
    specId = spec.id;
  });

  it("sums pending hours from not-yet-completed tasks' estimated hours, scoped to a person", () => {
    service.createTask(specId, {
      type: "開發任務",
      title: "任務A",
      assignees: [
        { person: "小美", estimatedHours: 10 },
        { person: "阿凱", estimatedHours: 5 },
      ],
    });

    const stats = service.getMonthlyStats({ person: "小美" }, "2026-07");
    expect(stats.pendingHours).toBe(10);
  });

  it("excludes a completed task's estimated hours from pending hours", () => {
    const task = service.createTask(specId, {
      type: "開發任務",
      title: "任務A",
      assignees: [{ person: "小美", estimatedHours: 10 }],
    });
    service.startTask(task.id);
    service.completeTask(task.id);

    const stats = service.getMonthlyStats({ person: "小美" }, "2026-07");
    expect(stats.pendingHours).toBe(0);
  });

  it("sums pending hours across everyone in 全觀 (all) scope", () => {
    service.createTask(specId, {
      type: "開發任務",
      title: "任務A",
      assignees: [
        { person: "小美", estimatedHours: 10 },
        { person: "阿凱", estimatedHours: 5 },
      ],
    });

    const stats = service.getMonthlyStats("all", "2026-07");
    expect(stats.pendingHours).toBe(15);
  });

  it("sums logged hours (task + reminder work logs) within the given month, scoped to a person", () => {
    const task = service.createTask(specId, {
      type: "開發任務",
      title: "任務A",
      assignees: [{ person: "小美" }],
    });
    service.logWork(task.id, { person: "小美", date: "2026-07-10", hours: 4 });
    service.logWork(task.id, { person: "小美", date: "2026-06-30", hours: 3 }); // 上個月，不計入

    const reminder = service.createReminder({ createdBy: "小美", assignedTo: "小美", title: "雜事" });
    service.logReminderWork(reminder.id, { person: "小美", date: "2026-07-15", hours: 2 });

    const stats = service.getMonthlyStats({ person: "小美" }, "2026-07");
    expect(stats.loggedHours).toBe(6);
  });

  it("does not count another person's logged hours towards a scoped person's total", () => {
    const task = service.createTask(specId, {
      type: "開發任務",
      title: "任務A",
      assignees: [{ person: "小美" }, { person: "阿凱" }],
    });
    service.logWork(task.id, { person: "小美", date: "2026-07-10", hours: 4 });
    service.logWork(task.id, { person: "阿凱", date: "2026-07-10", hours: 6 });

    const stats = service.getMonthlyStats({ person: "小美" }, "2026-07");
    expect(stats.loggedHours).toBe(4);
  });

  it("reports period estimate vs actual per person for a quarter/half-year window", () => {
    service.createTask(specId, {
      type: "開發任務",
      title: "任務A",
      assignees: [
        { person: "小美", estimatedHours: 20 },
        { person: "阿凱", estimatedHours: 15 },
      ],
    });
    const otherTask = service.createTask(specId, {
      type: "測試任務",
      title: "任務B",
      assignees: [{ person: "小美" }],
    });
    service.logWork(otherTask.id, { person: "小美", date: "2026-08-01", hours: 5 });
    service.logWork(otherTask.id, { person: "小美", date: "2026-10-01", hours: 3 }); // 期間外

    const report = service.getPeriodEstimateVsActual("all", {
      start: "2026-07-01",
      end: "2026-09-30",
    });

    expect(report).toEqual(
      expect.arrayContaining([
        { person: "小美", estimatedHours: 20, actualHours: 5 },
        { person: "阿凱", estimatedHours: 15, actualHours: 0 },
      ]),
    );
  });

  it("scopes the period estimate vs actual report to a single person", () => {
    service.createTask(specId, {
      type: "開發任務",
      title: "任務A",
      assignees: [
        { person: "小美", estimatedHours: 20 },
        { person: "阿凱", estimatedHours: 15 },
      ],
    });

    const report = service.getPeriodEstimateVsActual(
      { person: "小美" },
      { start: "2026-07-01", end: "2026-09-30" },
    );

    expect(report).toEqual([{ person: "小美", estimatedHours: 20, actualHours: 0 }]);
  });
});

describe("taskService - 錯誤型別化（NotFoundError/ValidationError）", () => {
  let service: TaskService;
  let specId: string;
  let taskId: string;
  let reminderId: string;

  beforeEach(() => {
    service = createTaskService();
    const requirement = service.createRequirement("R", "測試描述");
    const spec = service.createSpec(requirement.id, "S", "測試描述");
    specId = spec.id;
    const task = service.createTask(specId, {
      type: "開發任務",
      title: "任務",
      assignees: [{ person: "小美" }],
    });
    taskId = task.id;
    const reminder = service.createReminder({ createdBy: "我", assignedTo: "我", title: "提醒" });
    reminderId = reminder.id;
  });

  it("throws NotFoundError for missing requirement/spec/task/reminder lookups", () => {
    expect(() => service.createSpec("missing", "x", "測試描述")).toThrow(NotFoundError);
    expect(() => service.getRequirement("missing")).toThrow(NotFoundError);
    expect(() => service.setRequirementStatus("missing", "完成")).toThrow(NotFoundError);
    expect(() => service.getSpecWithTasks("missing")).toThrow(NotFoundError);
    expect(() => service.setSpecStatus("missing", "完成")).toThrow(NotFoundError);
    expect(() => service.createTask("missing", { type: "開發任務", title: "x", assignees: [{ person: "我" }] })).toThrow(
      NotFoundError,
    );
    expect(() => service.startTask("missing")).toThrow(NotFoundError);
    expect(() => service.closeReminder("missing")).toThrow(NotFoundError);
    expect(() => service.moveTodoItem("missing", 0)).toThrow(NotFoundError);
    expect(() =>
      service.createReminder({ createdBy: "我", assignedTo: "我", title: "x", specId: "missing" }),
    ).toThrow(NotFoundError);
  });

  it("throws ValidationError for invalid input or illegal state transitions", () => {
    expect(() => service.createTask(specId, { type: "開發任務", title: "x", assignees: [] })).toThrow(
      ValidationError,
    );
    expect(() => service.completeTask(taskId)).toThrow(ValidationError); // 還沒 start 就不能 complete
    expect(() => service.resumeTask(taskId)).toThrow(ValidationError); // 不是暫停狀態不能 resume
    service.closeReminder(reminderId);
    expect(() => service.closeReminder(reminderId)).toThrow(ValidationError); // 已結案不能再關一次
  });

  it("does not throw ValidationError for not-found scenarios, and vice versa", () => {
    expect(() => service.startTask("missing")).not.toThrow(ValidationError);
    expect(() => service.completeTask(taskId)).not.toThrow(NotFoundError);
  });
});
