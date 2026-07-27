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

export function createTaskService() {
  const requirements = new Map<string, Requirement>();
  const specs = new Map<string, Spec>();
  const tasks = new Map<string, Task>();
  const workLogs = new Map<string, WorkLogEntry>();
  const reworkRounds = new Map<string, ReworkRound>();
  const reminders = new Map<string, Reminder>();
  const reminderWorkLogs = new Map<string, ReminderWorkLogEntry>();
  // 手動排序覆蓋後的相對順序；新項目不會自動加進來，只會被預設排序附加在後面。
  const manualOrderSequence: string[] = [];
  let nextId = 1;
  const generateId = (prefix: string) => `${prefix}-${nextId++}`;
  const today = () => new Date().toISOString().slice(0, 10);

  function requireTask(taskId: string): Task {
    const task = tasks.get(taskId);
    if (!task) throw new NotFoundError(`Task not found: ${taskId}`);
    return task;
  }

  function requireReminder(reminderId: string): Reminder {
    const reminder = reminders.get(reminderId);
    if (!reminder) throw new NotFoundError(`Reminder not found: ${reminderId}`);
    return reminder;
  }

  function getTask(taskId: string): Task {
    return requireTask(taskId);
  }

  function getReminder(reminderId: string): Reminder {
    return requireReminder(reminderId);
  }

  function requireRequirement(requirementId: string): Requirement {
    const requirement = requirements.get(requirementId);
    if (!requirement) throw new NotFoundError(`Requirement not found: ${requirementId}`);
    return requirement;
  }

  function requireSpec(specId: string): Spec {
    const spec = specs.get(specId);
    if (!spec) throw new NotFoundError(`Spec not found: ${specId}`);
    return spec;
  }

  function createRequirement(title: string): Requirement {
    const requirement: Requirement = { id: generateId("req"), title, status: "待處理" };
    requirements.set(requirement.id, requirement);
    return requirement;
  }

  function createSpec(requirementId: string, title: string): Spec {
    requireRequirement(requirementId);
    const spec: Spec = { id: generateId("spec"), requirementId, title, status: "待處理" };
    specs.set(spec.id, spec);
    return spec;
  }

  // 規格/需求的狀態由管理職手動設定，系統不驗證、不與底下任務狀態連動。
  function setSpecStatus(specId: string, status: LifecycleStatus): Spec {
    const spec = requireSpec(specId);
    spec.status = status;
    return spec;
  }

  function setRequirementStatus(requirementId: string, status: LifecycleStatus): Requirement {
    const requirement = requireRequirement(requirementId);
    requirement.status = status;
    return requirement;
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
    const task: Task = {
      ...params,
      id: generateId("task"),
      specId,
      status: "待處理",
      priority: params.priority ?? "中",
    };
    tasks.set(task.id, task);
    const firstRound: ReworkRound = {
      id: generateId("round"),
      taskId: task.id,
      roundNumber: 1,
      startedAt: new Date().toISOString(),
    };
    reworkRounds.set(firstRound.id, firstRound);
    return task;
  }

  function getCurrentRound(taskId: string): ReworkRound {
    requireTask(taskId);
    const current = [...reworkRounds.values()].find(
      (r) => r.taskId === taskId && r.endedAt === undefined,
    );
    if (!current) throw new NotFoundError(`No active rework round for task: ${taskId}`);
    return current;
  }

  function getReworkRounds(taskId: string): ReworkRound[] {
    requireTask(taskId);
    return [...reworkRounds.values()]
      .filter((r) => r.taskId === taskId)
      .sort((a, b) => a.roundNumber - b.roundNumber);
  }

  function rejectTask(taskId: string): ReworkRound {
    const current = getCurrentRound(taskId);
    current.endedAt = new Date().toISOString();
    const nextRound: ReworkRound = {
      id: generateId("round"),
      taskId,
      roundNumber: current.roundNumber + 1,
      startedAt: new Date().toISOString(),
    };
    reworkRounds.set(nextRound.id, nextRound);
    return nextRound;
  }

  function startTask(taskId: string): Task {
    const task = requireTask(taskId);
    if (task.status !== "待處理") {
      throw new ValidationError(`Cannot start a task from status: ${task.status}`);
    }
    task.status = "進行中";
    return task;
  }

  function completeTask(taskId: string): Task {
    const task = requireTask(taskId);
    if (task.status !== "進行中") {
      throw new ValidationError(`Cannot complete a task from status: ${task.status}`);
    }
    task.status = "完成";
    task.closedDate = today();
    return task;
  }

  function pauseTask(taskId: string): Task {
    const task = requireTask(taskId);
    if (task.status !== "待處理" && task.status !== "進行中") {
      throw new ValidationError(`Cannot pause a task from status: ${task.status}`);
    }
    task.pausedFrom = task.status;
    task.status = "暫停";
    return task;
  }

  function resumeTask(taskId: string): Task {
    const task = requireTask(taskId);
    if (task.status !== "暫停" || task.pausedFrom === undefined) {
      throw new ValidationError(`Cannot resume a task from status: ${task.status}`);
    }
    task.status = task.pausedFrom;
    task.pausedFrom = undefined;
    return task;
  }

  function getSpecWithTasks(specId: string): SpecWithTasks {
    const spec = requireSpec(specId);
    const specTasks = [...tasks.values()].filter((t) => t.specId === specId);
    return { ...spec, tasks: specTasks };
  }

  function getRequirement(requirementId: string): RequirementWithSpecs {
    const requirement = requireRequirement(requirementId);
    const reqSpecs = [...specs.values()]
      .filter((s) => s.requirementId === requirementId)
      .map((s) => getSpecWithTasks(s.id));
    return { ...requirement, specs: reqSpecs };
  }

  function listRequirements(): RequirementWithSpecs[] {
    return [...requirements.values()].map((r) => getRequirement(r.id));
  }

  function logWork(
    taskId: string,
    entry: { person: string; date: string; hours: number; note?: string },
  ): WorkLogEntry {
    const round = getCurrentRound(taskId);
    const workLog: WorkLogEntry = {
      id: generateId("worklog"),
      taskId,
      roundId: round.id,
      ...entry,
    };
    workLogs.set(workLog.id, workLog);
    return workLog;
  }

  function getWorkLogs(taskId: string): WorkLogEntry[] {
    requireTask(taskId);
    return [...workLogs.values()].filter((w) => w.taskId === taskId);
  }

  function getReworkRoundsWithWorkLogs(
    taskId: string,
  ): Array<ReworkRound & { workLogs: WorkLogEntry[] }> {
    return getReworkRounds(taskId).map((round) => ({
      ...round,
      workLogs: [...workLogs.values()].filter((w) => w.roundId === round.id),
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
      actualHours: logs
        .filter((l) => l.person === person)
        .reduce((sum, l) => sum + l.hours, 0),
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
    const reminder: Reminder = {
      ...params,
      id: generateId("reminder"),
      status: "未處理",
      priority: params.priority ?? "中",
    };
    reminders.set(reminder.id, reminder);
    return reminder;
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
    reminder.status = "已結案";
    reminder.closedDate = today();
    return reminder;
  }

  function logReminderWork(
    reminderId: string,
    entry: { person: string; date: string; hours: number; note?: string },
  ): ReminderWorkLogEntry {
    requireReminder(reminderId);
    const workLog: ReminderWorkLogEntry = {
      id: generateId("reminder-worklog"),
      reminderId,
      ...entry,
    };
    reminderWorkLogs.set(workLog.id, workLog);
    return workLog;
  }

  function getReminderWorkLogs(reminderId: string): ReminderWorkLogEntry[] {
    requireReminder(reminderId);
    return [...reminderWorkLogs.values()].filter((w) => w.reminderId === reminderId);
  }

  // 個人雜事對建立者以外的人預設不可見，一旦被報工就對其他人可見；
  // 非雜事的提醒（掛勾規格，或建給別人）一律可見，不受此限制。
  function isReminderVisibleTo(reminder: Reminder, viewer: string): boolean {
    if (!isChore(reminder)) return true;
    if (reminder.createdBy === viewer) return true;
    return getReminderWorkLogs(reminder.id).length > 0;
  }

  function listRemindersVisibleTo(viewer: string): Reminder[] {
    return [...reminders.values()].filter((reminder) => isReminderVisibleTo(reminder, viewer));
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
    reminders.delete(reminderId);
    return task;
  }

  function getTodoList(): TodoItem[] {
    const allItems: TodoItem[] = [
      ...[...tasks.values()].map(
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
      ),
      ...[...reminders.values()].map(
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
      ),
    ];
    const byId = new Map(allItems.map((item) => [item.id, item]));

    const manualItems = manualOrderSequence
      .map((id) => byId.get(id))
      .filter((item): item is TodoItem => item !== undefined);

    const manualIds = new Set(manualOrderSequence);
    const defaultItems = allItems
      .filter((item) => !manualIds.has(item.id))
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
    if (!tasks.has(itemId) && !reminders.has(itemId)) {
      throw new NotFoundError(`Todo item not found: ${itemId}`);
    }
    const currentIndex = manualOrderSequence.indexOf(itemId);
    if (currentIndex !== -1) manualOrderSequence.splice(currentIndex, 1);
    const clampedIndex = Math.max(0, Math.min(toIndex, manualOrderSequence.length));
    manualOrderSequence.splice(clampedIndex, 0, itemId);
  }

  // 依「我／某位同仁／全觀」查詢，套用 ADR-0001（任務進度與報工全公開）
  // 與個人雜事的可見性規則（viewer 以外的人看不到未報工的雜事）。
  function getScopedTodoList(viewer: string, scope: Scope): TodoItem[] {
    return getTodoList().filter((item) => {
      if (item.kind === "task") {
        const task = requireTask(item.id);
        if (scope !== "all" && !task.assignees.some((a) => a.person === scope.person)) {
          return false;
        }
        return true;
      }
      const reminder = requireReminder(item.id);
      if (scope !== "all" && reminder.assignedTo !== scope.person) return false;
      return isReminderVisibleTo(reminder, viewer);
    });
  }

  // ADR-0002：完成/結案的項目不是看板常駐欄位——只有今天結案的才短暫可見，
  // 隔天起從活躍清單與「今日剛完成」查詢中都消失，只留在工時統計裡可查。
  function isClosedToday(item: TodoItem): boolean {
    if (item.kind === "task") {
      const task = requireTask(item.id);
      return task.status === "完成" && task.closedDate === today();
    }
    const reminder = requireReminder(item.id);
    return reminder.status === "已結案" && reminder.closedDate === today();
  }

  function isClosedBeforeToday(item: TodoItem): boolean {
    if (item.kind === "task") {
      const task = requireTask(item.id);
      return task.status === "完成" && task.closedDate !== today();
    }
    const reminder = requireReminder(item.id);
    return reminder.status === "已結案" && reminder.closedDate !== today();
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
    for (const task of tasks.values()) {
      if (task.status === "完成") continue;
      for (const assignee of task.assignees) {
        if (matchesScope(scope, assignee.person) && assignee.estimatedHours !== undefined) {
          pendingHours += assignee.estimatedHours;
        }
      }
    }

    let loggedHours = 0;
    for (const log of [...workLogs.values(), ...reminderWorkLogs.values()]) {
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
    for (const task of tasks.values()) {
      for (const assignee of task.assignees) {
        if (!matchesScope(scope, assignee.person) || assignee.estimatedHours === undefined) continue;
        estimatedByPerson.set(
          assignee.person,
          (estimatedByPerson.get(assignee.person) ?? 0) + assignee.estimatedHours,
        );
      }
    }

    const actualByPerson = new Map<string, number>();
    for (const log of [...workLogs.values(), ...reminderWorkLogs.values()]) {
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
    createTask,
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
    createReminder,
    isChore,
    closeReminder,
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
