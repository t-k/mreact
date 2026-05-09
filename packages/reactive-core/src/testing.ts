import { flushQueuedComputations } from "./scheduler.js";

export async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
}

export async function flushEffects(): Promise<void> {
  await Promise.resolve();
  flushQueuedComputations();
  await Promise.resolve();
}
