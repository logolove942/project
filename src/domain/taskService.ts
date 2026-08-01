import { createDatabase, nextId, type DatabaseSync } from "./database.js";
import { NotFoundError, ValidationError } from "./errors.js";
import type {
  LifecycleStatus,
  Priority,
  Reminder,
  ReminderWorkLogEntry,
  Requirement,
  RequirementWithSpecs,
  ReworkRound,
  Scope,
  Spec,
  SpecWithTasks,
  Task,
  TaskAssignee,
  TaskType,
  TodoItem,
  WorkLogEntry,
} from "./types.js";

const PRIORITY_ORDER: Record<Priority, number> = { 高: 0, 中: 1, 低: 2 };

const toUndef = <T>(v: T | null): T | undefined => (v === null ? undefined : v);

interface RequirementRow {
  id: string;
  title: string;
  description: string;
  status: string;
}
interface SpecRow {
  id: string;
  requirement_id: string;
  title: string;
  description: string;
  status: string;
}
interface TaskRow {
  id: string;
  spec_id: string;
  type: string;
  title: string;
  status: string;
  paused_from: string | null;
  cancelled_from: string | null;
  priority: string;
  due_date: string | null;
  closed_date: string | null;
}
interface TaskAssigneeRow {
  task_id: string;
  person: string;
  estimated_hours: number | null;
}
interface ReworkRoundRow {
  id: string;
  task_id: string;
  round_number: number;
  started_at: string;
  ended_at: string | null;
}
interface WorkLogRow {
  id: string;
  task_id: string;
  round_id: string;
  person: string;
  date: string;
  hours: number;
  note: string | null;
}
interface ReminderRow {
  id: string;
  created_by: string;
  assigned_to: string;
  title: string;
  spec_id: string | null;
  status: string;
  priority: string;
  due_date: string | null;
  closed_date: string | null;
}
interface ReminderWorkLogRow {
  id: string;
  reminder_id: string;
  person: string;
  date: string;
  hours: number;
  note: string | null;
}

export function createTaskService(db: DatabaseSync = createDatabase()) {
  const today = () => new Date().toISOString().slice(0, 10);
  const generateId = (prefix: string) => nextId(db, prefix);

  function rowToRequirement(row: RequirementRow): Requirement {
    return { id: row.id, title: row.title, description: row.description, status: row.status as LifecycleStatus };
  }

  function rowToSpec(row: SpecRow): Spec {
    return {
      id: row.id,
      requirementId: row.requirement_id,
      title: row.title,
      description: row.description,
      status: row.status as LifecycleStatus,
    };
  }

  function getAssignees(taskId: string): TaskAssignee[] {
    const rows = db
      .prepare("SELECT * FROM task_assignees WHERE task_id = ? ORDER BY rowid")
      .all(taskId) as unknown as TaskAssigneeRow[];
    return rows.map((r) => ({ person: r.person, estimatedHours: toUndef(r.estimated_hours) }));
  }

  function rowToTask(row: TaskRow): Task {
    return {
      id: row.id,
      specId: row.spec_id,
      type: row.type as TaskType,
      title: row.title,
      assignees: getAssignees(row.id),
      status: row.status as LifecycleStatus,
      pausedFrom: toUndef(row.paused_from) as LifecycleStatus | undefined,
      cancelledFrom: toUndef(row.cancelled_from) as LifecycleStatus | undefined,
      priority: row.priority as Priority,
      dueDate: toUndef(row.due_date),
      closedDate: toUndef(row.closed_date),
    };
  }

  function rowToReworkRound(row: ReworkRoundRow): ReworkRound {
    return {
      id: row.id,
      taskId: row.task_id,
      roundNumber: row.round_number,
      startedAt: row.started_at,
      endedAt: toUndef(row.ended_at),
    };
  }

  function rowToWorkLog(row: WorkLogRow): WorkLogEntry {
    return {
      id: row.id,
      taskId: row.task_id,
      roundId: row.round_id,
      person: row.person,
      date: row.date,
      hours: row.hours,
      note: toUndef(row.note),
    };
  }

  function rowToReminder(row: ReminderRow): Reminder {
    return {
      id: row.id,
      createdBy: row.created_by,
      assignedTo: row.assigned_to,
      title: row.title,
      specId: toUndef(row.spec_id),
      status: row.status as Reminder["status"],
      priority: row.priority as Priority,
      dueDate: toUndef(row.due_date),
      closedDate: toUndef(row.closed_date),
    };
  }

  function rowToReminderWorkLog(row: ReminderWorkLogRow): ReminderWorkLogEntry {
    return {
      id: row.id,
      reminderId: row.reminder_id,
      person: row.person,
      date: row.date,
      hours: row.hours,
      note: toUndef(row.note),
    };
  }

  function findTaskRow(taskId: string): TaskRow | undefined {
    return db.prepare("SELECT * FROM tasks WHERE id = ?").get(taskId) as unknown as TaskRow | undefined;
  }

  function findReminderRow(reminderId: string): ReminderRow | undefined {
    return db.prepare("SELECT * FROM reminders WHERE id = ?").get(reminderId) as unknown as
      | ReminderRow
      | undefined;
  }

  function requireTask(taskId: string): Task {
    const row = findTaskRow(taskId);
    if (!row) throw new NotFoundError(`Task not found: ${taskId}`);
    return rowToTask(row);
  }

  function requireReminder(reminderId: string): Reminder {
    const row = findReminderRow(reminderId);
    if (!row) throw new NotFoundError(`Reminder not found: ${reminderId}`);
    return rowToReminder(row);
  }

  function getTask(taskId: string): Task {
    return requireTask(taskId);
  }

  function getReminder(reminderId: string): Reminder {
    return requireReminder(reminderId);
  }

  function requireRequirement(requirementId: string): Requirement {
    const row = db.prepare("SELECT * FROM requirements WHERE id = ?").get(requirementId) as unknown as
      | RequirementRow
      | undefined;
    if (!row) throw new NotFoundError(`Requirement not found: ${requirementId}`);
    return rowToRequirement(row);
  }

  function requireSpec(specId: string): Spec {
    const row = db.prepare("SELECT * FROM specs WHERE id = ?").get(specId) as unknown as SpecRow | undefined;
    if (!row) throw new NotFoundError(`Spec not found: ${specId}`);
    return rowToSpec(row);
  }

  function createRequirement(title: string, description: string): Requirement {
    const requirement: Requirement = { id: generateId("req"), title, description, status: "待處理" };
    db.prepare("INSERT INTO requirements (id, title, description, status) VALUES (?, ?, ?, ?)").run(
      requirement.id,
      requirement.title,
      requirement.description,
      requirement.status,
    );
    return requirement;
  }

  function createSpec(requirementId: string, title: string, description: string): Spec {
    requireRequirement(requirementId);
    const spec: Spec = { id: generateId("spec"), requirementId, title, description, status: "待處理" };
    db.prepare("INSERT INTO specs (id, requirement_id, title, description, status) VALUES (?, ?, ?, ?, ?)").run(
      spec.id,
      spec.requirementId,
      spec.title,
      spec.description,
      spec.status,
    );
    return spec;
  }

  // 標題／描述建立後可編輯（任何登入帳號皆可，見 app.ts 的 PATCH /requirements/:id、/specs/:id 未加 requireManagement）；
  // 兩個欄位皆為選填更新，只更新有帶到的欄位。
  function updateRequirement(requirementId: string, params: { title?: string; description?: string }): Requirement {
    const current = requireRequirement(requirementId);
    const title = params.title ?? current.title;
    const description = params.description ?? current.description;
    db.prepare("UPDATE requirements SET title = ?, description = ? WHERE id = ?").run(
      title,
      description,
      requirementId,
    );
    return requireRequirement(requirementId);
  }

  function updateSpec(specId: string, params: { title?: string; description?: string }): Spec {
    const current = requireSpec(specId);
    const title = params.title ?? current.title;
    const description = params.description ?? current.description;
    db.prepare("UPDATE specs SET title = ?, description = ? WHERE id = ?").run(title, description, specId);
    return requireSpec(specId);
  }

  // 規格/需求的狀態由管理職手動設定，系統不驗證、不與底下任務狀態連動。
  function setSpecStatus(specId: string, status: LifecycleStatus): Spec {
    requireSpec(specId);
    db.prepare("UPDATE specs SET status = ? WHERE id = ?").run(status, specId);
    return requireSpec(specId);
  }

  function setRequirementStatus(requirementId: string, status: LifecycleStatus): Requirement {
    requireRequirement(requirementId);
    db.prepare("UPDATE requirements SET status = ? WHERE id = ?").run(status, requirementId);
    return requireRequirement(requirementId);
  }

  function createTask(
    specId: string,
    params: {
      type: TaskType;
      title: string;
      assignees: TaskAssignee[];
      priority?: Priority;
      dueDate?: string;
    },
  ): Task {
    requireSpec(specId);
    if (params.assignees.length === 0) {
      throw new ValidationError("A task needs at least one assignee");
    }
    const id = generateId("task");
    const status: LifecycleStatus = "待處理";
    const priority = params.priority ?? "中";
    db.prepare(
      `INSERT INTO tasks (id, spec_id, type, title, status, paused_from, cancelled_from, priority, due_date, closed_date)
       VALUES (?, ?, ?, ?, ?, NULL, NULL, ?, ?, NULL)`,
    ).run(id, specId, params.type, params.title, status, priority, params.dueDate ?? null);
    const insertAssignee = db.prepare(
      "INSERT INTO task_assignees (task_id, person, estimated_hours) VALUES (?, ?, ?)",
    );
    for (const assignee of params.assignees) {
      insertAssignee.run(id, assignee.person, assignee.estimatedHours ?? null);
    }
    const round: ReworkRound = {
      id: generateId("round"),
      taskId: id,
      roundNumber: 1,
      startedAt: new Date().toISOString(),
    };
    db.prepare(
      "INSERT INTO rework_rounds (id, task_id, round_number, started_at, ended_at) VALUES (?, ?, ?, ?, NULL)",
    ).run(round.id, round.taskId, round.roundNumber, round.startedAt);
    return requireTask(id);
  }

  function getCurrentRound(taskId: string): ReworkRound {
    requireTask(taskId);
    const row = db
      .prepare("SELECT * FROM rework_rounds WHERE task_id = ? AND ended_at IS NULL")
      .get(taskId) as unknown as ReworkRoundRow | undefined;
    if (!row) throw new NotFoundError(`No active rework round for task: ${taskId}`);
    return rowToReworkRound(row);
  }

  function getReworkRounds(taskId: string): ReworkRound[] {
    requireTask(taskId);
    const rows = db
      .prepare("SELECT * FROM rework_rounds WHERE task_id = ? ORDER BY round_number")
      .all(taskId) as unknown as ReworkRoundRow[];
    return rows.map(rowToReworkRound);
  }

  function rejectTask(taskId: string): ReworkRound {
    const current = getCurrentRound(taskId);
    const endedAt = new Date().toISOString();
    db.prepare("UPDATE rework_rounds SET ended_at = ? WHERE id = ?").run(endedAt, current.id);
    const nextRound: ReworkRound = {
      id: generateId("round"),
      taskId,
      roundNumber: current.roundNumber + 1,
      startedAt: new Date().toISOString(),
    };
    db.prepare(
      "INSERT INTO rework_rounds (id, task_id, round_number, started_at, ended_at) VALUES (?, ?, ?, ?, NULL)",
    ).run(nextRound.id, nextRound.taskId, nextRound.roundNumber, nextRound.startedAt);
    return nextRound;
  }

  function startTask(taskId: string): Task {
    const task = requireTask(taskId);
    if (task.status !== "待處理") {
      throw new ValidationError(`Cannot start a task from status: ${task.status}`);
    }
    db.prepare("UPDATE tasks SET status = ? WHERE id = ?").run("進行中", taskId);
    return requireTask(taskId);
  }

  function completeTask(taskId: string): Task {
    const task = requireTask(taskId);
    if (task.status !== "進行中") {
      throw new ValidationError(`Cannot complete a task from status: ${task.status}`);
    }
    db.prepare("UPDATE tasks SET status = ?, closed_date = ? WHERE id = ?").run("完成", today(), taskId);
    return requireTask(taskId);
  }

  function pauseTask(taskId: string): Task {
    const task = requireTask(taskId);
    if (task.status !== "待處理" && task.status !== "進行中") {
      throw new ValidationError(`Cannot pause a task from status: ${task.status}`);
    }
    db.prepare("UPDATE tasks SET paused_from = ?, status = ? WHERE id = ?").run(task.status, "暫停", taskId);
    return requireTask(taskId);
  }

  function resumeTask(taskId: string): Task {
    const task = requireTask(taskId);
    if (task.status !== "暫停" || task.pausedFrom === undefined) {
      throw new ValidationError(`Cannot resume a task from status: ${task.status}`);
    }
    db.prepare("UPDATE tasks SET status = ?, paused_from = NULL WHERE id = ?").run(task.pausedFrom, taskId);
    return requireTask(taskId);
  }

  // ADR-0004：取消是軟刪除——資料不動，只是依 closed_date 套用跟「完成」一樣的下架規則
  // （見 isClosedToday/isClosedBeforeToday）。完成是終態，不可取消。
  function cancelTask(taskId: string): Task {
    const task = requireTask(taskId);
    if (task.status !== "待處理" && task.status !== "進行中" && task.status !== "暫停") {
      throw new ValidationError(`Cannot cancel a task from status: ${task.status}`);
    }
    db.prepare("UPDATE tasks SET cancelled_from = ?, status = ?, closed_date = ? WHERE id = ?").run(
      task.status,
      "已取消",
      today(),
      taskId,
    );
    return requireTask(taskId);
  }

  function restoreTask(taskId: string): Task {
    const task = requireTask(taskId);
    if (task.status !== "已取消" || task.cancelledFrom === undefined) {
      throw new ValidationError(`Cannot restore a task from status: ${task.status}`);
    }
    db.prepare("UPDATE tasks SET status = ?, cancelled_from = NULL, closed_date = NULL WHERE id = ?").run(
      task.cancelledFrom,
      taskId,
    );
    return requireTask(taskId);
  }

  // issue #55：管理職編輯任務標題/優先度/到期日/指派對象/所屬規格/類型，不需取消重建；
  // 未帶到的欄位維持原值（仿 updateRequirement/updateSpec 的部分更新寫法）。
  // 傳入 assignees 會整批取代現有指派名單，但只動 task_assignees 這張表——
  // work_logs 以 person 字串獨立記錄，不受影響，移除的指派對象既有報工原封不動保留。
  function updateTask(
    taskId: string,
    params: {
      title?: string;
      priority?: Priority;
      dueDate?: string;
      assignees?: TaskAssignee[];
      specId?: string;
      type?: TaskType;
    },
  ): Task {
    const current = requireTask(taskId);
    if (params.specId !== undefined) requireSpec(params.specId);
    if (params.assignees !== undefined && params.assignees.length === 0) {
      throw new ValidationError("A task needs at least one assignee");
    }
    const title = params.title ?? current.title;
    const priority = params.priority ?? current.priority;
    const dueDate = params.dueDate ?? current.dueDate;
    const specId = params.specId ?? current.specId;
    const type = params.type ?? current.type;
    db.prepare("UPDATE tasks SET title = ?, priority = ?, due_date = ?, spec_id = ?, type = ? WHERE id = ?").run(
      title,
      priority,
      dueDate ?? null,
      specId,
      type,
      taskId,
    );

    if (params.assignees !== undefined) {
      db.prepare("DELETE FROM task_assignees WHERE task_id = ?").run(taskId);
      const insertAssignee = db.prepare(
        "INSERT INTO task_assignees (task_id, person, estimated_hours) VALUES (?, ?, ?)",
      );
      for (const assignee of params.assignees) {
        insertAssignee.run(taskId, assignee.person, assignee.estimatedHours ?? null);
      }
    }

    return requireTask(taskId);
  }

  function getSpecWithTasks(specId: string): SpecWithTasks {
    const spec = requireSpec(specId);
    const rows = db
      .prepare("SELECT * FROM tasks WHERE spec_id = ? ORDER BY rowid")
      .all(specId) as unknown as TaskRow[];
    return { ...spec, tasks: rows.map(rowToTask) };
  }

  function getRequirement(requirementId: string): RequirementWithSpecs {
    const requirement = requireRequirement(requirementId);
    const specRows = db
      .prepare("SELECT * FROM specs WHERE requirement_id = ? ORDER BY rowid")
      .all(requirementId) as unknown as SpecRow[];
    return { ...requirement, specs: specRows.map((s) => getSpecWithTasks(s.id)) };
  }

  function listRequirements(): RequirementWithSpecs[] {
    const rows = db.prepare("SELECT * FROM requirements ORDER BY rowid").all() as unknown as RequirementRow[];
    return rows.map((r) => getRequirement(r.id));
  }

  function logWork(
    taskId: string,
    entry: { person: string; date: string; hours: number; note?: string },
  ): WorkLogEntry {
    const round = getCurrentRound(taskId);
    const workLog: WorkLogEntry = { id: generateId("worklog"), taskId, roundId: round.id, ...entry };
    db.prepare(
      "INSERT INTO work_logs (id, task_id, round_id, person, date, hours, note) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).run(workLog.id, workLog.taskId, workLog.roundId, workLog.person, workLog.date, workLog.hours, workLog.note ?? null);
    return workLog;
  }

  function getWorkLogs(taskId: string): WorkLogEntry[] {
    requireTask(taskId);
    const rows = db
      .prepare("SELECT * FROM work_logs WHERE task_id = ? ORDER BY rowid")
      .all(taskId) as unknown as WorkLogRow[];
    return rows.map(rowToWorkLog);
  }

  function getReworkRoundsWithWorkLogs(
    taskId: string,
  ): Array<ReworkRound & { workLogs: WorkLogEntry[] }> {
    const allLogs = getWorkLogs(taskId);
    return getReworkRounds(taskId).map((round) => ({
      ...round,
      workLogs: allLogs.filter((w) => w.roundId === round.id),
    }));
  }

  function getTaskEstimateVsActual(
    taskId: string,
  ): Array<{ person: string; estimatedHours?: number; actualHours: number }> {
    const task = requireTask(taskId);
    const logs = getWorkLogs(taskId);
    return task.assignees.map(({ person, estimatedHours }) => ({
      person,
      estimatedHours,
      actualHours: logs.filter((l) => l.person === person).reduce((sum, l) => sum + l.hours, 0),
    }));
  }

  function createReminder(params: {
    createdBy: string;
    assignedTo: string;
    title: string;
    specId?: string;
    priority?: Priority;
    dueDate?: string;
  }): Reminder {
    if (params.specId !== undefined) {
      requireSpec(params.specId);
    }
    const id = generateId("reminder");
    const status: Reminder["status"] = "未處理";
    const priority = params.priority ?? "中";
    db.prepare(
      `INSERT INTO reminders (id, created_by, assigned_to, title, spec_id, status, priority, due_date, closed_date)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
    ).run(
      id,
      params.createdBy,
      params.assignedTo,
      params.title,
      params.specId ?? null,
      status,
      priority,
      params.dueDate ?? null,
    );
    return requireReminder(id);
  }

  // issue #58：createdBy 或 assignedTo（見 app.ts 的 requireReminderOwner）可編輯提醒，
  // 未帶到的欄位維持原值（仿 updateRequirement/updateSpec 的部分更新寫法）。
  // isChore() 是每次即時依 createdBy/assignedTo/specId 現值計算，不是建立時快取的旗標，
  // 所以改了 assignedTo 之後雜事/一般提醒的判斷會自動反映，不需要額外程式碼。
  function updateReminder(
    reminderId: string,
    params: { title?: string; priority?: Priority; dueDate?: string; assignedTo?: string; specId?: string },
  ): Reminder {
    const current = requireReminder(reminderId);
    if (params.specId !== undefined) requireSpec(params.specId);
    const title = params.title ?? current.title;
    const priority = params.priority ?? current.priority;
    const dueDate = params.dueDate ?? current.dueDate;
    const assignedTo = params.assignedTo ?? current.assignedTo;
    const specId = params.specId ?? current.specId;
    db.prepare(
      "UPDATE reminders SET title = ?, priority = ?, due_date = ?, assigned_to = ?, spec_id = ? WHERE id = ?",
    ).run(title, priority, dueDate ?? null, assignedTo, specId ?? null, reminderId);
    return requireReminder(reminderId);
  }

  // 自建給自己、且未掛勾規格的提醒＝個人雜事；不是獨立實體，只是這個情境的判斷。
  function isChore(reminder: Reminder): boolean {
    return reminder.createdBy === reminder.assignedTo && reminder.specId === undefined;
  }

  function closeReminder(reminderId: string): Reminder {
    const reminder = requireReminder(reminderId);
    if (reminder.status !== "未處理") {
      throw new ValidationError(`Cannot close a reminder from status: ${reminder.status}`);
    }
    db.prepare("UPDATE reminders SET status = ?, closed_date = ? WHERE id = ?").run(
      "已結案",
      today(),
      reminderId,
    );
    return requireReminder(reminderId);
  }

  // issue #57：取消跟結案語意不同（決定不處理了／處理完了），但下架規則一視同仁（ADR-0004）——
  // 只能從未處理轉入，跟 closeReminder 互斥（已結案不能再取消，反之亦然）。
  function cancelReminder(reminderId: string): Reminder {
    const reminder = requireReminder(reminderId);
    if (reminder.status !== "未處理") {
      throw new ValidationError(`Cannot cancel a reminder from status: ${reminder.status}`);
    }
    db.prepare("UPDATE reminders SET status = ?, closed_date = ? WHERE id = ?").run(
      "已取消",
      today(),
      reminderId,
    );
    return requireReminder(reminderId);
  }

  function restoreReminder(reminderId: string): Reminder {
    const reminder = requireReminder(reminderId);
    if (reminder.status !== "已取消") {
      throw new ValidationError(`Cannot restore a reminder from status: ${reminder.status}`);
    }
    db.prepare("UPDATE reminders SET status = ?, closed_date = NULL WHERE id = ?").run("未處理", reminderId);
    return requireReminder(reminderId);
  }

  function logReminderWork(
    reminderId: string,
    entry: { person: string; date: string; hours: number; note?: string },
  ): ReminderWorkLogEntry {
    requireReminder(reminderId);
    const workLog: ReminderWorkLogEntry = { id: generateId("reminder-worklog"), reminderId, ...entry };
    db.prepare(
      "INSERT INTO reminder_work_logs (id, reminder_id, person, date, hours, note) VALUES (?, ?, ?, ?, ?, ?)",
    ).run(workLog.id, workLog.reminderId, workLog.person, workLog.date, workLog.hours, workLog.note ?? null);
    return workLog;
  }

  function getReminderWorkLogs(reminderId: string): ReminderWorkLogEntry[] {
    requireReminder(reminderId);
    const rows = db
      .prepare("SELECT * FROM reminder_work_logs WHERE reminder_id = ? ORDER BY rowid")
      .all(reminderId) as unknown as ReminderWorkLogRow[];
    return rows.map(rowToReminderWorkLog);
  }

  // 個人雜事對建立者以外的人預設不可見，一旦被報工就對其他人可見；
  // 非雜事的提醒（掛勾規格，或建給別人）一律可見，不受此限制。
  function isReminderVisibleTo(reminder: Reminder, viewer: string): boolean {
    if (!isChore(reminder)) return true;
    if (reminder.createdBy === viewer) return true;
    return getReminderWorkLogs(reminder.id).length > 0;
  }

  function listRemindersVisibleTo(viewer: string): Reminder[] {
    const rows = db.prepare("SELECT * FROM reminders ORDER BY rowid").all() as unknown as ReminderRow[];
    return rows.map(rowToReminder).filter((reminder) => isReminderVisibleTo(reminder, viewer));
  }

  // 提醒升級成正式任務：同一筆資料轉換身份，不是新增重複記錄——
  // 升級後原本的提醒就不再存在，套用任務完整的四態狀態機。
  function promoteReminderToTask(
    reminderId: string,
    params: { specId: string; type: TaskType; assignees: TaskAssignee[] },
  ): Task {
    const reminder = requireReminder(reminderId);
    const task = createTask(params.specId, {
      type: params.type,
      title: reminder.title,
      assignees: params.assignees,
      priority: reminder.priority,
      dueDate: reminder.dueDate,
    });
    db.prepare("DELETE FROM reminders WHERE id = ?").run(reminderId);
    return task;
  }

  function allTasksAsTodoItems(): TodoItem[] {
    const rows = db.prepare("SELECT * FROM tasks ORDER BY rowid").all() as unknown as TaskRow[];
    return rows.map(rowToTask).map(
      (t): TodoItem => ({
        id: t.id,
        kind: "task",
        title: t.title,
        priority: t.priority,
        dueDate: t.dueDate,
        status: t.status,
        closedDate: t.closedDate,
        specId: t.specId,
        owners: t.assignees.map((a) => a.person),
        isChore: false,
      }),
    );
  }

  function allRemindersAsTodoItems(): TodoItem[] {
    const rows = db.prepare("SELECT * FROM reminders ORDER BY rowid").all() as unknown as ReminderRow[];
    return rows.map(rowToReminder).map(
      (r): TodoItem => ({
        id: r.id,
        kind: "reminder",
        title: r.title,
        priority: r.priority,
        dueDate: r.dueDate,
        status: r.status,
        closedDate: r.closedDate,
        specId: r.specId,
        owners: [r.assignedTo],
        isChore: isChore(r),
      }),
    );
  }

  function getTodoList(): TodoItem[] {
    const allItems: TodoItem[] = [...allTasksAsTodoItems(), ...allRemindersAsTodoItems()];
    const byId = new Map(allItems.map((item) => [item.id, item]));

    const manualIds = db
      .prepare("SELECT item_id FROM manual_order ORDER BY position")
      .all() as unknown as { item_id: string }[];
    const manualItems = manualIds
      .map((row) => byId.get(row.item_id))
      .filter((item): item is TodoItem => item !== undefined);

    const manualIdSet = new Set(manualIds.map((row) => row.item_id));
    const defaultItems = allItems
      .filter((item) => !manualIdSet.has(item.id))
      .sort((a, b) => {
        const priorityDiff = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
        if (priorityDiff !== 0) return priorityDiff;
        if (!a.dueDate && !b.dueDate) return 0;
        if (!a.dueDate) return 1;
        if (!b.dueDate) return -1;
        return a.dueDate.localeCompare(b.dueDate);
      });

    return [...manualItems, ...defaultItems];
  }

  // 手動覆蓋排序：把項目移到手動序列中的指定位置；之後新加入的項目
  // 不會自動進入這個序列，只會被預設排序附加在手動區塊之後。
  function moveTodoItem(itemId: string, toIndex: number): void {
    const taskExists = db.prepare("SELECT 1 FROM tasks WHERE id = ?").get(itemId);
    const reminderExists = db.prepare("SELECT 1 FROM reminders WHERE id = ?").get(itemId);
    if (!taskExists && !reminderExists) {
      throw new NotFoundError(`Todo item not found: ${itemId}`);
    }

    const rows = db.prepare("SELECT item_id FROM manual_order ORDER BY position").all() as unknown as {
      item_id: string;
    }[];
    const sequence = rows.map((r) => r.item_id);

    const currentIndex = sequence.indexOf(itemId);
    if (currentIndex !== -1) sequence.splice(currentIndex, 1);
    const clampedIndex = Math.max(0, Math.min(toIndex, sequence.length));
    sequence.splice(clampedIndex, 0, itemId);

    db.exec("DELETE FROM manual_order");
    const insert = db.prepare("INSERT INTO manual_order (item_id, position) VALUES (?, ?)");
    sequence.forEach((id, position) => insert.run(id, position));
  }

  // 依「我／某位同仁／全觀」查詢，套用 ADR-0001（任務進度與報工全公開）
  // 與個人雜事的可見性規則（viewer 以外的人看不到未報工的雜事）。
  function getScopedTodoList(viewer: string, scope: Scope): TodoItem[] {
    return getTodoList().filter((item) => {
      if (scope !== "all" && !item.owners.includes(scope.person)) return false;
      if (item.kind === "reminder") {
        const reminder = requireReminder(item.id);
        return isReminderVisibleTo(reminder, viewer);
      }
      return true;
    });
  }

  // ADR-0002：完成/結案的項目不是看板常駐欄位——只有今天結案的才短暫可見，
  // 隔天起從活躍清單與「今日剛完成」查詢中都消失，只留在工時統計裡可查。
  // 已取消比照同一套規則（ADR-0004）：跟完成/已結案一樣算「已下架」的終態。
  function isClosedStatus(item: TodoItem): boolean {
    const closedStatus = item.kind === "task" ? "完成" : "已結案";
    return item.status === closedStatus || item.status === "已取消";
  }

  function isClosedToday(item: TodoItem): boolean {
    return isClosedStatus(item) && item.closedDate === today();
  }

  function isClosedBeforeToday(item: TodoItem): boolean {
    return isClosedStatus(item) && item.closedDate !== today();
  }

  function getActiveTodoList(): TodoItem[] {
    return getTodoList().filter((item) => !isClosedBeforeToday(item));
  }

  function getRecentlyCompletedTodoList(): TodoItem[] {
    return getTodoList().filter(isClosedToday);
  }

  function matchesScope(scope: Scope, person: string): boolean {
    return scope === "all" || person === scope.person;
  }

  // 本月待處理工時（未完成任務的預計工時加總，依範圍）與已投入工時（當月報工加總，依範圍）。
  function getMonthlyStats(scope: Scope, month: string): { pendingHours: number; loggedHours: number } {
    let pendingHours = 0;
    const assigneeRows = db
      .prepare(
        `SELECT ta.person, ta.estimated_hours FROM task_assignees ta
         JOIN tasks t ON t.id = ta.task_id
         WHERE t.status != '完成'`,
      )
      .all() as unknown as { person: string; estimated_hours: number | null }[];
    for (const row of assigneeRows) {
      if (matchesScope(scope, row.person) && row.estimated_hours !== null) {
        pendingHours += row.estimated_hours;
      }
    }

    let loggedHours = 0;
    const taskLogRows = db.prepare("SELECT person, date, hours FROM work_logs").all() as unknown as {
      person: string;
      date: string;
      hours: number;
    }[];
    const reminderLogRows = db
      .prepare("SELECT person, date, hours FROM reminder_work_logs")
      .all() as unknown as { person: string; date: string; hours: number }[];
    for (const log of [...taskLogRows, ...reminderLogRows]) {
      if (matchesScope(scope, log.person) && log.date.startsWith(month)) {
        loggedHours += log.hours;
      }
    }

    return { pendingHours, loggedHours };
  }

  // 季度/半年「預計 vs 消耗」的個人能力估算：預計工時是目前的在手承諾（不限期間），
  // 消耗工時則是期間內（start ~ end，含）實際報工的加總，依人拆分。
  function getPeriodEstimateVsActual(
    scope: Scope,
    period: { start: string; end: string },
  ): Array<{ person: string; estimatedHours: number; actualHours: number }> {
    const estimatedByPerson = new Map<string, number>();
    const assigneeRows = db
      .prepare("SELECT person, estimated_hours FROM task_assignees").all() as unknown as {
      person: string;
      estimated_hours: number | null;
    }[];
    for (const row of assigneeRows) {
      if (!matchesScope(scope, row.person) || row.estimated_hours === null) continue;
      estimatedByPerson.set(row.person, (estimatedByPerson.get(row.person) ?? 0) + row.estimated_hours);
    }

    const actualByPerson = new Map<string, number>();
    const taskLogRows = db.prepare("SELECT person, date, hours FROM work_logs").all() as unknown as {
      person: string;
      date: string;
      hours: number;
    }[];
    const reminderLogRows = db
      .prepare("SELECT person, date, hours FROM reminder_work_logs")
      .all() as unknown as { person: string; date: string; hours: number }[];
    for (const log of [...taskLogRows, ...reminderLogRows]) {
      if (!matchesScope(scope, log.person)) continue;
      if (log.date < period.start || log.date > period.end) continue;
      actualByPerson.set(log.person, (actualByPerson.get(log.person) ?? 0) + log.hours);
    }

    const people = new Set([...estimatedByPerson.keys(), ...actualByPerson.keys()]);
    return [...people].map((person) => ({
      person,
      estimatedHours: estimatedByPerson.get(person) ?? 0,
      actualHours: actualByPerson.get(person) ?? 0,
    }));
  }

  return {
    createRequirement,
    createSpec,
    updateRequirement,
    updateSpec,
    createTask,
    updateTask,
    setSpecStatus,
    setRequirementStatus,
    getSpecWithTasks,
    getRequirement,
    listRequirements,
    getTask,
    getReminder,
    logWork,
    getWorkLogs,
    getTaskEstimateVsActual,
    getCurrentRound,
    getReworkRounds,
    getReworkRoundsWithWorkLogs,
    rejectTask,
    startTask,
    completeTask,
    pauseTask,
    resumeTask,
    cancelTask,
    restoreTask,
    createReminder,
    updateReminder,
    isChore,
    closeReminder,
    cancelReminder,
    restoreReminder,
    logReminderWork,
    getReminderWorkLogs,
    listRemindersVisibleTo,
    promoteReminderToTask,
    getTodoList,
    moveTodoItem,
    getScopedTodoList,
    getActiveTodoList,
    getRecentlyCompletedTodoList,
    getMonthlyStats,
    getPeriodEstimateVsActual,
  };
}

export type TaskService = ReturnType<typeof createTaskService>;
