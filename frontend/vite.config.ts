import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [vue()],
  server: {
    // Dev-only convenience so the browser's same-origin fetches reach the
    // Express API without needing CORS headers on the backend.
    proxy: {
      "/todo": "http://localhost:3000",
      "/tasks": "http://localhost:3000",
      "/reminders": "http://localhost:3000",
      "/requirements": "http://localhost:3000",
      "/specs": "http://localhost:3000",
      "/stats": "http://localhost:3000",
    },
  },
  test: {
    environment: "jsdom",
    globals: false,
    setupFiles: ["./src/testSetup.ts"],
  },
});
