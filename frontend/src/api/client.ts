import type { Reminder, Task, TodoItem, WorkLogEntry } from "../types";

async function readJsonOrThrow(res: Response, action: string): Promise<unknown> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error ?? `${action}失敗（${res.status}）`);
  }
  return res.json();
}

export async function fetchTodoList(baseUrl: string): Promise<TodoItem[]> {
  const res = await fetch(`${baseUrl}/todo`);
  return (await readJsonOrThrow(res, "載入待辦清單")) as TodoItem[];
}

// scope: "all"（全觀）或某位同仁的名字（含 viewer 自己）。
export async function fetchScopedTodoList(
  baseUrl: string,
  viewer: string,
  scope: "all" | string,
): Promise<TodoItem[]> {
  const params = new URLSearchParams({ viewer, scope });
  const res = await fetch(`${baseUrl}/todo/scoped?${params}`);
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
  const res = await fetch(`${baseUrl}/stats/monthly?${params}`);
  return (await readJsonOrThrow(res, "載入月度工時統計")) as MonthlyStats;
}

async function postTaskAction(baseUrl: string, taskId: string, action: string, label: string): Promise<void> {
  const res = await fetch(`${baseUrl}/tasks/${taskId}/${action}`, { method: "POST" });
  await readJsonOrThrow(res, label);
}

export const startTask = (baseUrl: string, taskId: string) => postTaskAction(baseUrl, taskId, "start", "開始任務");
export const pauseTask = (baseUrl: string, taskId: string) => postTaskAction(baseUrl, taskId, "pause", "暫停任務");
export const resumeTask = (baseUrl: string, taskId: string) => postTaskAction(baseUrl, taskId, "resume", "解除暫停");
export const completeTask = (baseUrl: string, taskId: string) => postTaskAction(baseUrl, taskId, "complete", "完成任務");

export async function fetchTask(baseUrl: string, taskId: string): Promise<Task> {
  const res = await fetch(`${baseUrl}/tasks/${taskId}`);
  return (await readJsonOrThrow(res, "載入任務資料")) as Task;
}

export async function fetchReminder(baseUrl: string, reminderId: string): Promise<Reminder> {
  const res = await fetch(`${baseUrl}/reminders/${reminderId}`);
  return (await readJsonOrThrow(res, "載入提醒資料")) as Reminder;
}

export async function closeReminder(baseUrl: string, reminderId: string): Promise<Reminder> {
  const res = await fetch(`${baseUrl}/reminders/${reminderId}/close`, { method: "POST" });
  return (await readJsonOrThrow(res, "關閉提醒")) as Reminder;
}

export async function promoteReminderToTask(
  baseUrl: string,
  reminderId: string,
  params: { specId: string; type: "開發任務" | "測試任務"; assignees: { person: string }[] },
): Promise<Task> {
  const res = await fetch(`${baseUrl}/reminders/${reminderId}/promote`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  return (await readJsonOrThrow(res, "升級為正式任務")) as Task;
}

export async function fetchTaskWorkLogs(baseUrl: string, taskId: string): Promise<WorkLogEntry[]> {
  const res = await fetch(`${baseUrl}/tasks/${taskId}/work-logs`);
  return (await readJsonOrThrow(res, "載入報工紀錄")) as WorkLogEntry[];
}

export async function fetchReminderWorkLogs(baseUrl: string, reminderId: string): Promise<WorkLogEntry[]> {
  const res = await fetch(`${baseUrl}/reminders/${reminderId}/work-logs`);
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
  const res = await fetch(`${baseUrl}/tasks/${taskId}/work-logs`, {
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
  const res = await fetch(`${baseUrl}/reminders/${reminderId}/work-logs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(entry),
  });
  return (await readJsonOrThrow(res, "新增報工")) as WorkLogEntry;
}
