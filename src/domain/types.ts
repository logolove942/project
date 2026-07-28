// Vocabulary follows CONTEXT.md: 需求 (Requirement) -> 規格 (Spec) -> 任務 (Task).

export type TaskType = "開發任務" | "測試任務";

// 混合排序用：優先級為先，同優先級依到期日排序。
export type Priority = "高" | "中" | "低";

// 待處理／進行中／暫停／完成，需求、規格、任務三層共用同一組狀態字面值。
// 任務的狀態轉換受狀態機驗證（見 taskService 的 start/complete/pause/resume）；
// 規格、需求的狀態則由管理職手動設定，系統不驗證、不與底下任務連動。
export type LifecycleStatus = "待處理" | "進行中" | "暫停" | "完成";

// description 是必填的 Markdown 純文字（見 docs/adr 討論）：描述需求/規格在做什麼，
// 可能包含連結、圖片（`[文字](網址)`、`![說明](網址)`）；渲染由前端 markdown.ts 自己刻，
// 不引入外部套件（ADR-0003）。
export interface Requirement {
  id: string;
  title: string;
  description: string;
  status: LifecycleStatus;
}

export interface Spec {
  id: string;
  requirementId: string;
  title: string;
  description: string;
  status: LifecycleStatus;
}

// 任務可指派給多人；預計工時可依人拆分（不拆分則為 undefined）。
export interface TaskAssignee {
  person: string;
  estimatedHours?: number;
}

export interface Task {
  id: string;
  specId: string;
  type: TaskType;
  title: string;
  assignees: TaskAssignee[];
  status: LifecycleStatus;
  // 只有 status 為「暫停」時才有值，記錄暫停前的狀態，供解除暫停時還原。
  pausedFrom?: LifecycleStatus;
  priority: Priority;
  dueDate?: string;
  // 只有 status 為「完成」時才有值；用來判斷是否還在「今天剛完成」的範圍內（ADR-0002）。
  closedDate?: string;
}

export interface SpecWithTasks extends Spec {
  tasks: Task[];
}

export interface RequirementWithSpecs extends Requirement {
  specs: SpecWithTasks[];
}

// 重工回合：每次退件產生新回合，任務本身維持一筆，不因退件次數增生。
export interface ReworkRound {
  id: string;
  taskId: string;
  roundNumber: number;
  startedAt: string;
  endedAt?: string;
}

// 報工 / 工時記錄：每筆天生歸屬於記錄者本人 (person)，可多筆、可跨日；
// 同時歸屬於當下的重工回合，累積起來就是該回合的報工。
export interface WorkLogEntry {
  id: string;
  taskId: string;
  roundId: string;
  person: string;
  date: string;
  hours: number;
  note?: string;
}

// 提醒只有兩態；報工不影響狀態機（見 CONTEXT.md「提醒狀態」）。
export type ReminderStatus = "未處理" | "已結案";

// 自建給自己、且未掛勾規格的提醒＝個人雜事，不是獨立實體（見 isChore()）。
export interface Reminder {
  id: string;
  createdBy: string;
  assignedTo: string;
  title: string;
  specId?: string;
  status: ReminderStatus;
  priority: Priority;
  dueDate?: string;
  // 只有 status 為「已結案」時才有值；用來判斷是否還在「今天剛結案」的範圍內（ADR-0002）。
  closedDate?: string;
}

// 混合排序查詢用的統一視圖：任務與提醒攤平在同一份清單裡。
// 欄位足夠讓看板直接分欄、判斷今天剛完成、顯示擁有者，不必為每張卡片額外查詢。
export interface TodoItem {
  id: string;
  kind: "task" | "reminder";
  title: string;
  priority: Priority;
  dueDate?: string;
  status: LifecycleStatus | ReminderStatus;
  closedDate?: string;
  specId?: string;
  owners: string[];
  // 提醒是否為個人雜事（沿用 isChore() 判斷）；任務一律為 false。
  isChore: boolean;
}

// 身分範圍：「我／某位同仁」用 { person } 查詢單一人的範圍；"all" 是全觀。
export type Scope = "all" | { person: string };

// 提醒的報工，跟任務的報工是分開的紀錄（提醒沒有重工回合的概念）。
export interface ReminderWorkLogEntry {
  id: string;
  reminderId: string;
  person: string;
  date: string;
  hours: number;
  note?: string;
}
