export async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
}

export async function flushEffects(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}
