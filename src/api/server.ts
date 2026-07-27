import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createAccountService } from "../domain/accountService.js";
import { createDatabase } from "../domain/database.js";
import { createSessionService } from "../domain/sessionService.js";
import { createTaskService } from "../domain/taskService.js";
import { createApp } from "./app.js";

const port = Number(process.env.PORT) || 3000;

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const dataDir = join(projectRoot, "data");
mkdirSync(dataDir, { recursive: true });
const db = createDatabase(join(dataDir, "app.db"));

const app = createApp(createTaskService(db), createAccountService(db), createSessionService(db));

app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`Task/reminder API listening on http://localhost:${port}`);
});
