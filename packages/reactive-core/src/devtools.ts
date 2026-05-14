type DevtoolsEmitter = (event: Record<string, unknown>) => void;

export function emitReactiveDevtoolsEvent(event: Record<string, unknown>): void {
  const emit = currentDevtoolsEmitter();

  if (emit === undefined) {
    return;
  }

  emit({
    package: "@modular-react/reactive-core",
    timestamp: Date.now(),
    ...event,
  });
}

export function currentDevtoolsEmitter(): DevtoolsEmitter | undefined {
  const devtools = (
    globalThis as typeof globalThis & {
      __mreactDevtools?: { emit?: DevtoolsEmitter } | undefined;
    }
  ).__mreactDevtools;

  return typeof devtools?.emit === "function" ? devtools.emit.bind(devtools) : undefined;
}
