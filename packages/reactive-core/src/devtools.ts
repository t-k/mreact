type DevtoolsEmitter = (event: Record<string, unknown>) => void;

interface ReactiveDevtools {
  emit?: DevtoolsEmitter | undefined;
}

export interface ReactiveEffectRunDevtoolsEvent {
  devtools: ReactiveDevtools;
  emit: DevtoolsEmitter;
  startedAt: number;
}

let cachedReactiveDevtools: ReactiveDevtools | null | undefined;

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

export function currentReactiveDevtools():
  | ReactiveDevtools
  | undefined {
  return currentDevtools();
}

export function invalidateReactiveDevtoolsCache(): void {
  cachedReactiveDevtools = undefined;
}

export function prepareReactiveEffectRunDevtoolsEvent():
  | ReactiveEffectRunDevtoolsEvent
  | undefined {
  if (cachedReactiveDevtools === null) {
    return undefined;
  }

  const live = currentDevtools();
  const devtools =
    cachedReactiveDevtools !== undefined && cachedReactiveDevtools === live
      ? cachedReactiveDevtools
      : resolveCachedReactiveDevtools(live);

  if (devtools === null) {
    return undefined;
  }

  const emit = devtools.emit;

  if (typeof emit !== "function") {
    return undefined;
  }

  return {
    devtools,
    emit,
    startedAt: performanceNow(),
  };
}

export function emitReactiveEffectRunDevtoolsEvent(
  event: ReactiveEffectRunDevtoolsEvent,
  id: number,
): void {
  event.emit.call(event.devtools, {
    durationMs: performanceNow() - event.startedAt,
    id,
    package: "@reckona/mreact-reactive-core",
    timestamp: Date.now(),
    type: "reactive:effect:run",
  });
}

function resolveCachedReactiveDevtools(
  live: ReactiveDevtools | undefined,
): ReactiveDevtools | null {
  const resolved = live !== undefined && typeof live.emit === "function" ? live : null;
  cachedReactiveDevtools = resolved;
  return resolved;
}

function currentDevtools():
  | ReactiveDevtools
  | undefined {
  const devtools = (
    globalThis as typeof globalThis & {
      __mreactDevtools?: ReactiveDevtools | undefined;
    }
  ).__mreactDevtools;

  return devtools;
}

function performanceNow(): number {
  return typeof performance === "undefined" ? Date.now() : performance.now();
}
