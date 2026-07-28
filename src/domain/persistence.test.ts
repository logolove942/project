import { createRequire } from "node:module";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createDatabase, type DatabaseSync } from "./database.js";
import { createTaskService } from "./taskService.js";

const { DatabaseSync: RawDatabaseSync } = createRequire(import.meta.url)("node:sqlite") as typeof import("node:sqlite");

// 這組測試跟其他測試不同：其他測試每個 it 都拿一份全新、互相隔離的 :memory: 資料庫；
// 這裡刻意驗證「同一個檔案路徑」在服務重建（模擬 server 重啟）後資料還在。
describe("taskService - SQLite 持久化（issue #44）", () => {
  let dir: string;
  let dbPath: string;
  let openDbs: DatabaseSync[];

  // 每個 it 打開的檔案型資料庫連線都要在刪除暫存目錄前關閉，
  // 否則 Windows 會因為檔案仍被佔用而讓 rmSync 失敗（EBUSY）。
  function openFileDatabase(): DatabaseSync {
    const db = createDatabase(dbPath);
    openDbs.push(db);
    return db;
  }

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "task-reminder-db-"));
    dbPath = join(dir, "app.db");
    openDbs = [];
  });

  afterEach(() => {
    for (const db of openDbs) db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("persists requirements/specs/tasks across a fresh service instance against the same file", () => {
    const first = createTaskService(openFileDatabase());
    const requirement = first.createRequirement("會員系統改版", "測試描述");
    const spec = first.createSpec(requirement.id, "會員登入規格", "測試描述");
    const task = first.createTask(spec.id, {
      type: "開發任務",
      title: "登入 API 開發",
      assignees: [{ person: "小美", estimatedHours: 8 }],
    });
    first.logWork(task.id, { person: "小美", date: "2026-07-20", hours: 3, note: "串接中" });

    expect(existsSync(dbPath)).toBe(true);

    // 模擬 server 重啟：重新開一個連到同一個檔案的服務實例，不沿用任何記憶體狀態。
    const second = createTaskService(openFileDatabase());
    const reloadedRequirement = second.getRequirement(requirement.id);
    expect(reloadedRequirement.title).toBe("會員系統改版");
    expect(reloadedRequirement.specs).toHaveLength(1);
    expect(reloadedRequirement.specs[0].tasks).toHaveLength(1);
    expect(reloadedRequirement.specs[0].tasks[0].title).toBe("登入 API 開發");
    expect(reloadedRequirement.specs[0].tasks[0].assignees).toEqual([
      { person: "小美", estimatedHours: 8 },
    ]);

    const logs = second.getWorkLogs(task.id);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ person: "小美", date: "2026-07-20", hours: 3, note: "串接中" });
  });

  it("keeps id generation continuous across a service instance recreated against the same file", () => {
    const first = createTaskService(openFileDatabase());
    const requirementA = first.createRequirement("A", "測試描述");

    const second = createTaskService(openFileDatabase());
    const requirementB = second.createRequirement("B", "測試描述");

    expect(requirementB.id).not.toBe(requirementA.id);
    // 兩個需求應該都能各自查得回來，不因為重建服務而互相覆蓋或遺失。
    expect(second.listRequirements().map((r) => r.title).sort()).toEqual(["A", "B"]);
  });

  it("each call to createTaskService() with no arguments still gets a fresh, isolated in-memory database", () => {
    const a = createTaskService();
    const b = createTaskService();
    a.createRequirement("只在 a 裡面", "測試描述");
    expect(b.listRequirements()).toHaveLength(0);
  });

  it("persists description across a fresh service instance against the same file", () => {
    const first = createTaskService(openFileDatabase());
    const requirement = first.createRequirement("需求", "需求描述");
    const spec = first.createSpec(requirement.id, "規格", "規格描述");

    const second = createTaskService(openFileDatabase());
    expect(second.getRequirement(requirement.id).description).toBe("需求描述");
    expect(second.getSpecWithTasks(spec.id).description).toBe("規格描述");
  });

  // 描述欄位是後來才加的：既有的 db 檔案（建表時還沒有這個欄位）開啟時要自動補上，
  // 不能因為缺欄位就整個炸掉；舊資料的描述補空字串即可，不強制回填（見 CONTEXT 討論）。
  it("migrates an existing db file created before the description column existed", () => {
    const rawDb = new RawDatabaseSync(dbPath);
    openDbs.push(rawDb as unknown as DatabaseSync);
    rawDb.exec(`
      CREATE TABLE requirements (id TEXT PRIMARY KEY, title TEXT NOT NULL, status TEXT NOT NULL);
      CREATE TABLE specs (id TEXT PRIMARY KEY, requirement_id TEXT NOT NULL, title TEXT NOT NULL, status TEXT NOT NULL);
    `);
    rawDb.prepare("INSERT INTO requirements (id, title, status) VALUES (?, ?, ?)").run(
      "req-old",
      "舊資料",
      "待處理",
    );
    rawDb.close();
    openDbs.pop();

    const migrated = createTaskService(openFileDatabase());
    expect(migrated.getRequirement("req-old").description).toBe("");
  });
});
