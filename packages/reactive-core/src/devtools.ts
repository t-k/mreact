type DevtoolsEmitter = (event: Record<string, unknown>) => void;

export function emitReactiveDevtoolsEvent(event: Record<string, unknown>): void {
  const devtools = currentDevtools();
  const emit = devtools?.emit;

  if (typeof emit !== "function") {
    return;
  }

  emit.call(devtools, {
    package: "@reckona/mreact-reactive-core",
    timestamp: Date.now(),
    ...event,
  });
}

export function hasReactiveDevtoolsEmitter(): boolean {
  return typeof currentDevtools()?.emit === "function";
}

export function currentDevtoolsEmitter(): DevtoolsEmitter | undefined {
  const devtools = currentDevtools();
  const emit = devtools?.emit;

  return typeof emit === "function" ? emit.bind(devtools) : undefined;
}

function currentDevtools():
  | { emit?: DevtoolsEmitter | undefined }
  | undefined {
  const devtools = (
    globalThis as typeof globalThis & {
      __mreactDevtools?: { emit?: DevtoolsEmitter } | undefined;
    }
  ).__mreactDevtools;

  return devtools;
}
