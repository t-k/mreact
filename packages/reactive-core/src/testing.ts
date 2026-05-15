import { flushQueuedComputations } from "./scheduler.js";

export async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
}

export async function flushEffects(): Promise<void> {
  flushQueuedComputations();
  await Promise.resolve();
  flushQueuedComputations();
}
