import type {
  Account,
  Reminder,
  Requirement,
  RequirementWithSpecs,
  Spec,
  Task,
  TaskAssignee,
  TodoItem,
  WorkLogEntry,
} from "../types";

// issue #48：session token 存進 localStorage，每個 API 請求都要自動帶上
// Authorization header——這裡是唯一一個知道怎麼存取 token 的地方。
const TOKEN_STORAGE_KEY = "task-reminder:token";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_STORAGE_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_STORAGE_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_STORAGE_KEY);
}

function authedFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const token = getToken();
  if (!token) return fetch(url, init);
  return fetch(url, {
    ...init,
    headers: { ...(init.headers as Record<string, string> | undefined), Authorization: `Bearer ${token}` },
  });
}

async function readJsonOrThrow(res: Response, action: string): Promise<unknown> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error ?? `${action}失敗（${res.status}）`);
  }
  return res.json();
}

export async function register(baseUrl: string, name: string, password: string): Promise<Account> {
  const res = await fetch(`${baseUrl}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, password }),
  });
  return (await readJsonOrThrow(res, "註冊")) as Account;
}

export async function login(
  baseUrl: string,
  name: string,
  password: string,
): Promise<{ token: string; account: Account }> {
  const res = await fetch(`${baseUrl}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, password }),
  });
  return (await readJsonOrThrow(res, "登入")) as { token: string; account: Account };
}

export async function logout(baseUrl: string): Promise<void> {
  await authedFetch(`${baseUrl}/auth/logout`, { method: "POST" });
  clearToken();
}

export async function fetchAccounts(baseUrl: string): Promise<Account[]> {
  const res = await authedFetch(`${baseUrl}/accounts`);
  return (await readJsonOrThrow(res, "載入帳號清單")) as Account[];
}

export async function promoteAccount(baseUrl: string, accountId: string): Promise<Account> {
  const res = await authedFetch(`${baseUrl}/accounts/${accountId}/promote`, { method: "POST" });
  return (await readJsonOrThrow(res, "升級為管理職")) as Account;
}

export async function fetchTodoList(baseUrl: string): Promise<TodoItem[]> {
  const res = await authedFetch(`${baseUrl}/todo`);
  return (await readJsonOrThrow(res, "載入待辦清單")) as TodoItem[];
}

// scope: "all"（全觀）或某位同仁的名字（含 viewer 自己）。
export async function fetchScopedTodoList(
  baseUrl: string,
  viewer: string,
  scope: "all" | string,
): Promise<TodoItem[]> {
  const params = new URLSearchParams({ viewer, scope });
  const res = await authedFetch(`${baseUrl}/todo/scoped?${params}`);
  return (await readJsonOrThrow(res, "載入待辦清單")) as TodoItem[];
}

export interface MonthlyStats {
  pendingHours: number;
  loggedHours: number;
}

export async function fetchMonthlyStats(
  baseUrl: string,
  scope: "all" | string,
  month: string,
): Promise<MonthlyStats> {
  const params = new URLSearchParams({ scope, month });
  const res = await authedFetch(`${baseUrl}/stats/monthly?${params}`);
  return (await readJsonOrThrow(res, "載入月度工時統計")) as MonthlyStats;
}

async function postTaskAction(baseUrl: string, taskId: string, action: string, label: string): Promise<void> {
  const res = await authedFetch(`${baseUrl}/tasks/${taskId}/${action}`, { method: "POST" });
  await readJsonOrThrow(res, label);
}

export const startTask = (baseUrl: string, taskId: string) => postTaskAction(baseUrl, taskId, "start", "開始任務");
export const pauseTask = (baseUrl: string, taskId: string) => postTaskAction(baseUrl, taskId, "pause", "暫停任務");
export const resumeTask = (baseUrl: string, taskId: string) => postTaskAction(baseUrl, taskId, "resume", "解除暫停");
export const completeTask = (baseUrl: string, taskId: string) => postTaskAction(baseUrl, taskId, "complete", "完成任務");

export async function fetchTask(baseUrl: string, taskId: string): Promise<Task> {
  const res = await authedFetch(`${baseUrl}/tasks/${taskId}`);
  return (await readJsonOrThrow(res, "載入任務資料")) as Task;
}

export async function fetchReminder(baseUrl: string, reminderId: string): Promise<Reminder> {
  const res = await authedFetch(`${baseUrl}/reminders/${reminderId}`);
  return (await readJsonOrThrow(res, "載入提醒資料")) as Reminder;
}

export async function closeReminder(baseUrl: string, reminderId: string): Promise<Reminder> {
  const res = await authedFetch(`${baseUrl}/reminders/${reminderId}/close`, { method: "POST" });
  return (await readJsonOrThrow(res, "關閉提醒")) as Reminder;
}

export async function promoteReminderToTask(
  baseUrl: string,
  reminderId: string,
  params: { specId: string; type: "開發任務" | "測試任務"; assignees: { person: string }[] },
): Promise<Task> {
  const res = await authedFetch(`${baseUrl}/reminders/${reminderId}/promote`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  return (await readJsonOrThrow(res, "升級為正式任務")) as Task;
}

export async function fetchTaskWorkLogs(baseUrl: string, taskId: string): Promise<WorkLogEntry[]> {
  const res = await authedFetch(`${baseUrl}/tasks/${taskId}/work-logs`);
  return (await readJsonOrThrow(res, "載入報工紀錄")) as WorkLogEntry[];
}

export async function fetchReminderWorkLogs(baseUrl: string, reminderId: string): Promise<WorkLogEntry[]> {
  const res = await authedFetch(`${baseUrl}/reminders/${reminderId}/work-logs`);
  return (await readJsonOrThrow(res, "載入報工紀錄")) as WorkLogEntry[];
}

export interface NewWorkLogEntry {
  person: string;
  date: string;
  hours: number;
  note?: string;
}

export async function logTaskWork(
  baseUrl: string,
  taskId: string,
  entry: NewWorkLogEntry,
): Promise<WorkLogEntry> {
  const res = await authedFetch(`${baseUrl}/tasks/${taskId}/work-logs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(entry),
  });
  return (await readJsonOrThrow(res, "新增報工")) as WorkLogEntry;
}

export async function logReminderWork(
  baseUrl: string,
  reminderId: string,
  entry: NewWorkLogEntry,
): Promise<WorkLogEntry> {
  const res = await authedFetch(`${baseUrl}/reminders/${reminderId}/work-logs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(entry),
  });
  return (await readJsonOrThrow(res, "新增報工")) as WorkLogEntry;
}

export async function fetchRequirements(baseUrl: string): Promise<RequirementWithSpecs[]> {
  const res = await authedFetch(`${baseUrl}/requirements`);
  return (await readJsonOrThrow(res, "載入需求清單")) as RequirementWithSpecs[];
}

export async function createRequirement(baseUrl: string, title: string): Promise<Requirement> {
  const res = await authedFetch(`${baseUrl}/requirements`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title }),
  });
  return (await readJsonOrThrow(res, "新增需求")) as Requirement;
}

export async function createSpec(baseUrl: string, requirementId: string, title: string): Promise<Spec> {
  const res = await authedFetch(`${baseUrl}/requirements/${requirementId}/specs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title }),
  });
  return (await readJsonOrThrow(res, "新增規格")) as Spec;
}

export interface NewTaskInput {
  type: "開發任務" | "測試任務";
  title: string;
  assignees: TaskAssignee[];
  priority?: "高" | "中" | "低";
  dueDate?: string;
}

export async function createTask(baseUrl: string, specId: string, input: NewTaskInput): Promise<Task> {
  const res = await authedFetch(`${baseUrl}/specs/${specId}/tasks`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return (await readJsonOrThrow(res, "新增任務")) as Task;
}

export interface NewReminderInput {
  createdBy: string;
  assignedTo: string;
  title: string;
  specId?: string;
  priority?: "高" | "中" | "低";
  dueDate?: string;
}

export async function createReminder(baseUrl: string, input: NewReminderInput): Promise<Reminder> {
  const res = await authedFetch(`${baseUrl}/reminders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return (await readJsonOrThrow(res, "新增提醒")) as Reminder;
}
