import { flushPromises } from "@vue/test-utils";

// Real fetch() calls need actual event-loop turns to resolve, not just a
// microtask flush — poll until the predicate holds (or time out).
export async function waitFor(predicate: () => boolean, timeoutMs = 4000): Promise<void> {
  const start = Date.now();
  await flushPromises();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error("waitFor: condition not met within timeout");
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
    await flushPromises();
  }
}
