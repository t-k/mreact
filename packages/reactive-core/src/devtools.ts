type DevtoolsEmitter = (event: Record<string, unknown>) => void;

declare const __MREACT_CLIENT_DEVTOOLS__: boolean | undefined;

const clientDevtoolsDisabled =
  typeof __MREACT_CLIENT_DEVTOOLS__ !== "undefined" && __MREACT_CLIENT_DEVTOOLS__ === false;

export type ReactiveDevtoolsResourceKind =
  | "computed"
  | "effect"
  | "scope"
  | "other"
  | (string & {});

export interface ReactiveDevtoolsResourceHandle {
  dispose(): void;
  update(patch: Record<string, unknown>): void;
}

interface ReactiveDevtoolsResourceRegistry {
  register(input: Record<string, unknown>): ReactiveDevtoolsResourceHandle;
}

interface ReactiveDevtools {
  emit?: DevtoolsEmitter | undefined;
  resources?: (() => ReactiveDevtoolsResourceRegistry) | undefined;
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

/** Registers metadata only when a development resource inspector is attached. */
export function registerReactiveDevtoolsResource(
  kind: ReactiveDevtoolsResourceKind,
  input: Record<string, unknown> = {},
): ReactiveDevtoolsResourceHandle {
  if (clientDevtoolsDisabled) {
    return emptyResourceHandle();
  }

  const registry = currentDevtools()?.resources?.();
  return registry?.register({ kind, ...input }) ?? emptyResourceHandle();
}

function emptyResourceHandle(): ReactiveDevtoolsResourceHandle {
  return { dispose() {}, update() {} };
}

export function hasReactiveDevtoolsEmitter(): boolean {
  return typeof currentDevtools()?.emit === "function";
}

export function currentDevtoolsEmitter(): DevtoolsEmitter | undefined {
  const devtools = currentDevtools();
  const emit = devtools?.emit;

  return typeof emit === "function" ? emit.bind(devtools) : undefined;
}

export function currentReactiveDevtools(): ReactiveDevtools | undefined {
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

function currentDevtools(): ReactiveDevtools | undefined {
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
