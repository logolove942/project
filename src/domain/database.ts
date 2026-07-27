import { createRequire } from "node:module";

// Loaded via createRequire (not a static import) because Vite/vite-node's builtin-module
// detection strips the "node:" prefix for this still-experimental module and then fails
// to resolve the bare "sqlite" specifier — a static `import ... from "node:sqlite"` breaks
// under vitest even though it works fine under plain `node`/`tsx`.
const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as typeof import("node:sqlite");
export type DatabaseSync = InstanceType<typeof DatabaseSync>;

// Schema mirrors src/domain/types.ts — one table per entity, no ORM (ADR-0003:
// minimal dependencies). Row order for "list all" queries relies on SQLite's
// implicit rowid to preserve insertion order, matching the previous Map-based
// iteration order that call sites depended on.
const SCHEMA = `
CREATE TABLE IF NOT EXISTS requirements (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  status TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS specs (
  id TEXT PRIMARY KEY,
  requirement_id TEXT NOT NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  spec_id TEXT NOT NULL,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL,
  paused_from TEXT,
  priority TEXT NOT NULL,
  due_date TEXT,
  closed_date TEXT
);

CREATE TABLE IF NOT EXISTS task_assignees (
  task_id TEXT NOT NULL,
  person TEXT NOT NULL,
  estimated_hours REAL
);

CREATE TABLE IF NOT EXISTS rework_rounds (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  round_number INTEGER NOT NULL,
  started_at TEXT NOT NULL,
  ended_at TEXT
);

CREATE TABLE IF NOT EXISTS work_logs (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  round_id TEXT NOT NULL,
  person TEXT NOT NULL,
  date TEXT NOT NULL,
  hours REAL NOT NULL,
  note TEXT
);

CREATE TABLE IF NOT EXISTS reminders (
  id TEXT PRIMARY KEY,
  created_by TEXT NOT NULL,
  assigned_to TEXT NOT NULL,
  title TEXT NOT NULL,
  spec_id TEXT,
  status TEXT NOT NULL,
  priority TEXT NOT NULL,
  due_date TEXT,
  closed_date TEXT
);

CREATE TABLE IF NOT EXISTS reminder_work_logs (
  id TEXT PRIMARY KEY,
  reminder_id TEXT NOT NULL,
  person TEXT NOT NULL,
  date TEXT NOT NULL,
  hours REAL NOT NULL,
  note TEXT
);

-- 手動排序覆蓋的相對順序（taskService 的 manualOrderSequence）。
CREATE TABLE IF NOT EXISTS manual_order (
  item_id TEXT PRIMARY KEY,
  position INTEGER NOT NULL
);

-- 需求/規格/任務/提醒等共用同一個遞增序號來源（沿用原本 taskService 單一 nextId 計數器的行為）。
CREATE TABLE IF NOT EXISTS id_counter (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  next_value INTEGER NOT NULL
);

-- issue #45：帳號名單，也是所有人名選單的唯一來源。
CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  role TEXT NOT NULL
);

-- issue #46：登入 session，token 是唯一的失效判斷依據（沒有到期時間，登出才失效）。
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  account_id TEXT NOT NULL
);
`;

export function createDatabase(path: string = ":memory:"): DatabaseSync {
  const db = new DatabaseSync(path);
  db.exec(SCHEMA);
  return db;
}

// 沿用原本 taskService 的行為：所有實體共用同一個遞增計數器，不分實體各自計數。
export function nextId(db: DatabaseSync, prefix: string): string {
  db.exec("INSERT OR IGNORE INTO id_counter (id, next_value) VALUES (1, 1)");
  const row = db.prepare("SELECT next_value FROM id_counter WHERE id = 1").get() as {
    next_value: number;
  };
  db.prepare("UPDATE id_counter SET next_value = ? WHERE id = 1").run(row.next_value + 1);
  return `${prefix}-${row.next_value}`;
}
