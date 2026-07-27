import { beforeEach } from "vitest";

// jsdom's localStorage persists across tests within the same file/environment;
// clear it so one test's viewerName doesn't leak into the next.
beforeEach(() => {
  localStorage.clear();
});
