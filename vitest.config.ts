import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // frontend/ is its own npm project with its own vitest config (Vue plugin,
    // jsdom environment) — don't let this project's run try to pick it up too.
    exclude: ["**/node_modules/**", "frontend/**"],
  },
});
