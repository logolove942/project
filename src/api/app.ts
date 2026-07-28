import express, { type Express, type NextFunction, type Request, type Response } from "express";
import { createAccountService, type Account, type AccountService } from "../domain/accountService.js";
import { createSessionService, type SessionService } from "../domain/sessionService.js";
import type { Scope } from "../domain/types.js";
import { createTaskService, type TaskService } from "../domain/taskService.js";
import { errorHandler } from "./errorHandler.js";

// ?scope=all|<person> — 省略或 "all" 代表全觀，否則代表某位同仁（含呼叫端自己）。
function parseScope(req: Request): Scope {
  const scopeParam = req.query.scope;
  return !scopeParam || scopeParam === "all" ? "all" : { person: String(scopeParam) };
}

// 掛在 req 上的登入帳號；authMiddleware 之後的所有 route handler 都可以讀取。
export interface AuthedRequest extends Request {
  account: Account;
}

function bearerToken(req: Request): string | undefined {
  const header = req.header("authorization");
  return header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : undefined;
}

// issue #47：需求/規格/任務建立與帳號升級專屬管理職；其餘既有路由不受影響，任何登入帳號都能呼叫。
function requireManagement(req: Request, res: Response, next: NextFunction) {
  if ((req as AuthedRequest).account.role !== "管理職") {
    res.status(403).json({ error: "權限不足：僅管理職可以執行此操作" });
    return;
  }
  next();
}

export function createApp(
  service: TaskService = createTaskService(),
  accountService: AccountService = createAccountService(),
  sessionService: SessionService = createSessionService(),
): Express {
  const app = express();

  // 前端（Vite dev server）跟後端在開發環境是不同 origin，沒有這段瀏覽器會直接擋下所有請求
  // （Node 的 fetch/測試環境不會套用 CORS，所以這個問題不會反映在既有測試裡）。
  // 內部工具、無需帳密以外的驗證機制，允許任意 origin 帶 Authorization header 是可接受的取捨。
  app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
    if (req.method === "OPTIONS") {
      res.sendStatus(204);
      return;
    }
    next();
  });

  app.use(express.json());

  // issue #45：帳號註冊——這張票不含 session，註冊完不會自動登入（登入見 issue #46）。
  app.post("/auth/register", (req, res) => {
    const { name, password } = req.body;
    res.status(201).json(accountService.register(name, password));
  });

  // issue #46：帳號不存在或密碼錯誤回傳同一種通用錯誤訊息，不讓人分辨是哪個環節錯。
  app.post("/auth/login", (req, res) => {
    const { name, password } = req.body;
    const account = accountService.verifyCredentials(name, password);
    if (!account) {
      res.status(401).json({ error: "帳號不存在或密碼錯誤" });
      return;
    }
    const token = sessionService.createSession(account.id);
    res.json({ token, account });
  });

  // issue #46：除了上面兩個路由，其餘所有路由都要求帶有效的 Bearer token。
  app.use((req: Request, res: Response, next: NextFunction) => {
    const token = bearerToken(req);
    const accountId = token ? sessionService.resolveToken(token) : undefined;
    if (!accountId) {
      res.status(401).json({ error: "需要登入" });
      return;
    }
    (req as AuthedRequest).account = accountService.getAccount(accountId);
    next();
  });

  app.post("/auth/logout", (req, res) => {
    const token = bearerToken(req);
    if (token) sessionService.invalidate(token);
    res.status(204).send();
  });

  // 供前端各處的人名下拉選單使用（issue #49/#50）；不回傳密碼雜湊。
  app.get("/accounts", (_req, res) => {
    res.json(accountService.listAccounts());
  });

  // issue #47：管理職專屬，把指定帳號的角色設為管理職。
  app.post("/accounts/:id/promote", requireManagement, (req, res) => {
    res.json(accountService.promote(String(req.params.id)));
  });

  app.get("/requirements", (_req, res) => {
    res.json(service.listRequirements());
  });

  app.post("/requirements", requireManagement, (req, res) => {
    res.status(201).json(service.createRequirement(req.body.title, req.body.description ?? ""));
  });

  app.get("/requirements/:id", (req, res) => {
    res.json(service.getRequirement(req.params.id));
  });

  app.patch("/requirements/:id/status", (req, res) => {
    res.json(service.setRequirementStatus(req.params.id, req.body.status));
  });

  // 標題／描述編輯：任何登入帳號皆可（不像建立限管理職，見 CONTEXT 討論）。
  app.patch("/requirements/:id", (req, res) => {
    const { title, description } = req.body;
    res.json(service.updateRequirement(req.params.id, { title, description }));
  });

  app.post("/requirements/:id/specs", requireManagement, (req, res) => {
    res.status(201).json(service.createSpec(String(req.params.id), req.body.title, req.body.description ?? ""));
  });

  app.patch("/specs/:id/status", (req, res) => {
    res.json(service.setSpecStatus(req.params.id, req.body.status));
  });

  app.patch("/specs/:id", (req, res) => {
    const { title, description } = req.body;
    res.json(service.updateSpec(req.params.id, { title, description }));
  });

  app.post("/specs/:id/tasks", requireManagement, (req, res) => {
    const { type, title, assignees, priority, dueDate } = req.body;
    res.status(201).json(service.createTask(String(req.params.id), { type, title, assignees, priority, dueDate }));
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
