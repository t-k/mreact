export function emitStoreDevtoolsEvent(event: Record<string, unknown>): void {
  const devtools = (
    globalThis as typeof globalThis & {
      __mreactDevtools?: { emit?: (event: Record<string, unknown>) => void };
    }
  ).__mreactDevtools;

  devtools?.emit?.({
    package: "@modular-react/store",
    timestamp: Date.now(),
    ...event,
  });
}
