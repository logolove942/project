import express, { type Express, type Request } from "express";
import type { Scope } from "../domain/types.js";
import { createTaskService, type TaskService } from "../domain/taskService.js";
import { errorHandler } from "./errorHandler.js";

// ?scope=all|<person> — 省略或 "all" 代表全觀，否則代表某位同仁（含呼叫端自己）。
function parseScope(req: Request): Scope {
  const scopeParam = req.query.scope;
  return !scopeParam || scopeParam === "all" ? "all" : { person: String(scopeParam) };
}

export function createApp(service: TaskService = createTaskService()): Express {
  const app = express();
  app.use(express.json());

  app.get("/requirements", (_req, res) => {
    res.json(service.listRequirements());
  });

  app.post("/requirements", (req, res) => {
    res.status(201).json(service.createRequirement(req.body.title));
  });

  app.get("/requirements/:id", (req, res) => {
    res.json(service.getRequirement(req.params.id));
  });

  app.patch("/requirements/:id/status", (req, res) => {
    res.json(service.setRequirementStatus(req.params.id, req.body.status));
  });

  app.post("/requirements/:id/specs", (req, res) => {
    res.status(201).json(service.createSpec(req.params.id, req.body.title));
  });

  app.patch("/specs/:id/status", (req, res) => {
    res.json(service.setSpecStatus(req.params.id, req.body.status));
  });

  app.post("/specs/:id/tasks", (req, res) => {
    const { type, title, assignees, priority, dueDate } = req.body;
    res.status(201).json(service.createTask(req.params.id, { type, title, assignees, priority, dueDate }));
  });

  app.get("/tasks/:id", (req, res) => {
    res.json(service.getTask(req.params.id));
  });

  app.post("/tasks/:id/start", (req, res) => {
    res.json(service.startTask(req.params.id));
  });

  app.post("/tasks/:id/complete", (req, res) => {
    res.json(service.completeTask(req.params.id));
  });

  app.post("/tasks/:id/pause", (req, res) => {
    res.json(service.pauseTask(req.params.id));
  });

  app.post("/tasks/:id/resume", (req, res) => {
    res.json(service.resumeTask(req.params.id));
  });

  app.post("/tasks/:id/reject", (req, res) => {
    res.json(service.rejectTask(req.params.id));
  });

  app.get("/tasks/:id/rework-rounds", (req, res) => {
    res.json(service.getReworkRoundsWithWorkLogs(req.params.id));
  });

  app.post("/tasks/:id/work-logs", (req, res) => {
    const { person, date, hours, note } = req.body;
    res.status(201).json(service.logWork(req.params.id, { person, date, hours, note }));
  });

  app.get("/tasks/:id/work-logs", (req, res) => {
    res.json(service.getWorkLogs(req.params.id));
  });

  app.get("/tasks/:id/estimate-vs-actual", (req, res) => {
    res.json(service.getTaskEstimateVsActual(req.params.id));
  });

  app.post("/reminders", (req, res) => {
    const { createdBy, assignedTo, title, specId, priority, dueDate } = req.body;
    res.status(201).json(service.createReminder({ createdBy, assignedTo, title, specId, priority, dueDate }));
  });

  app.get("/reminders/:id", (req, res) => {
    res.json(service.getReminder(req.params.id));
  });

  app.post("/reminders/:id/close", (req, res) => {
    res.json(service.closeReminder(req.params.id));
  });

  app.post("/reminders/:id/work-logs", (req, res) => {
    const { person, date, hours, note } = req.body;
    res.status(201).json(service.logReminderWork(req.params.id, { person, date, hours, note }));
  });

  app.get("/reminders/:id/work-logs", (req, res) => {
    res.json(service.getReminderWorkLogs(req.params.id));
  });

  app.post("/reminders/:id/promote", (req, res) => {
    const { specId, type, assignees } = req.body;
    res.status(201).json(service.promoteReminderToTask(req.params.id, { specId, type, assignees }));
  });

  app.get("/todo", (_req, res) => {
    res.json(service.getTodoList());
  });

  app.post("/todo/:id/move", (req, res) => {
    service.moveTodoItem(req.params.id, req.body.toIndex);
    res.json(service.getTodoList());
  });

  // ?viewer=<person>&scope=all|<person> — viewer 是誰在問；scope 省略或 "all" 代表全觀，否則代表某位同仁。
  app.get("/todo/scoped", (req, res) => {
    const viewer = String(req.query.viewer ?? "");
    res.json(service.getScopedTodoList(viewer, parseScope(req)));
  });

  app.get("/todo/active", (_req, res) => {
    res.json(service.getActiveTodoList());
  });

  app.get("/todo/recently-completed", (_req, res) => {
    res.json(service.getRecentlyCompletedTodoList());
  });

  // ?scope=all|<person>&month=YYYY-MM
  app.get("/stats/monthly", (req, res) => {
    const month = String(req.query.month ?? "");
    res.json(service.getMonthlyStats(parseScope(req), month));
  });

  // ?scope=all|<person>&start=YYYY-MM-DD&end=YYYY-MM-DD
  app.get("/stats/period", (req, res) => {
    const start = String(req.query.start ?? "");
    const end = String(req.query.end ?? "");
    res.json(service.getPeriodEstimateVsActual(parseScope(req), { start, end }));
  });

  app.use(errorHandler);

  return app;
}
