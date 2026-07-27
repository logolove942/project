// Mirrors the shape of src/domain/types.ts's TodoItem (kept local so the
// frontend has no runtime dependency on the backend source tree).

export type Priority = "高" | "中" | "低";
export type TaskStatus = "待處理" | "進行中" | "暫停" | "完成";
export type ReminderStatus = "未處理" | "已結案";

export interface TodoItem {
  id: string;
  kind: "task" | "reminder";
  title: string;
  priority: Priority;
  dueDate?: string;
  status: TaskStatus | ReminderStatus;
  closedDate?: string;
  specId?: string;
  owners: string[];
  isChore: boolean;
}

export interface Requirement {
  id: string;
  title: string;
  status: TaskStatus;
}

export interface Spec {
  id: string;
  requirementId: string;
  title: string;
  status: TaskStatus;
}

export interface TaskAssignee {
  person: string;
  estimatedHours?: number;
}

export interface Task {
  id: string;
  specId: string;
  type: "開發任務" | "測試任務";
  title: string;
  assignees: TaskAssignee[];
  status: TaskStatus;
  pausedFrom?: TaskStatus;
  priority: Priority;
  dueDate?: string;
  closedDate?: string;
}

export interface SpecWithTasks extends Spec {
  tasks: Task[];
}

export interface RequirementWithSpecs extends Requirement {
  specs: SpecWithTasks[];
}

export interface Reminder {
  id: string;
  createdBy: string;
  assignedTo: string;
  title: string;
  specId?: string;
  status: ReminderStatus;
  priority: Priority;
  dueDate?: string;
  closedDate?: string;
}

export interface WorkLogEntry {
  id: string;
  person: string;
  date: string;
  hours: number;
  note?: string;
}

export interface ReworkRound {
  id: string;
  roundNumber: number;
  startedAt: string;
  endedAt?: string;
}

export type Role = "管理職" | "一般同仁";

export interface Account {
  id: string;
  name: string;
  role: Role;
}
