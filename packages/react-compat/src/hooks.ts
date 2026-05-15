import { scheduleCallback } from "./fiber-scheduler.js";
import {
  Activity,
  Fragment,
  FORWARD_REF_TYPE,
  MEMO_TYPE,
  Profiler,
  isReactCompatElement,
  type ForwardRefType,
  type MemoType,
  type ReactCompatElement,
  type ReactCompatNode,
} from "./element.js";
import {
  isReactCompatContext,
  isReactCompatConsumer,
  isReactCompatProvider,
  renderWithContextProvider,
  useContext,
} from "./context.js";
import { isThenable } from "./thenable.js";
import { isDangerousHtmlAttribute, isDangerousHtmlOptIn } from "./url-safety.js";
import { escapeHtmlAttribute as escapeHtml } from "@reckona/mreact-shared/html-escape";

export interface RootRuntime {
  currentElement?: unknown;
  instances: Map<string, ComponentInstance>;
  activeInstanceKeys: Set<string> | undefined;
  activeProfilerPaths: Set<string> | undefined;
  mountedProfilerPaths: Set<string>;
  profilerBaseDurations: Map<string, number>;
  pendingProfilerCommits: PendingProfilerCommit[];
  pendingInsertionEffects: PendingEffect[];
  pendingLayoutEffects: PendingEffect[];
  pendingEffects: PendingEffect[];
  externalStoreChecks: ExternalStoreCheck[];
  portalContainers: Set<Element>;
  idCounter: number;
  identifierPrefix: string;
  idMode: "client" | "server";
  strictModeDepth: number;
  profilerFlushDepth: number;
  rerender(priority?: RenderPriority): void;
  beginRender(): void;
  endRender(committed?: boolean): void;
  flushEffects(): void;
  dispose(): void;
}

interface ComponentInstance {
  hooks: HookSlot[];
  hookIndex: number;
  dirty: boolean;
  devToolsHooks: DevToolsHookValue[];
  devToolsHookTypes: string[];
  devToolsHookSuppressionDepth: number;
}

type EffectCallback = () => void | (() => void);
type ProfilerPhase = "mount" | "update" | "nested-update";
type ProfilerOnRender = (
  id: string,
  phase: ProfilerPhase,
  actualDuration: number,
  baseDuration: number,
  startTime: number,
  commitTime: number,
) => void;

interface PendingEffect {
  slot: Extract<HookSlot, { kind: "effect" }>;
}

interface PendingProfilerCommit {
  id: string;
  phase: ProfilerPhase;
  onRender: ProfilerOnRender;
  actualDuration: number;
  baseDuration: number;
  startTime: number;
}

interface ExternalStoreCheck {
  getSnapshot: () => unknown;
  value: unknown;
}

export interface CacheScope {
  functionCaches: WeakMap<(...args: never[]) => unknown, CacheTrieNode>;
  controller: AbortController;
  ownerStack: string[];
}

interface CacheTrieNode {
  primitiveChildren: Map<unknown, CacheTrieNode>;
  objectChildren: WeakMap<object, CacheTrieNode>;
  status?: "fulfilled" | "rejected";
  value?: unknown;
  reason?: unknown;
}

export interface DevToolsHookState {
  hooks: DevToolsHookValue[];
  hookTypes: string[];
}

export type DevToolsHookValue =
  | { kind: "state"; value: unknown }
  | { kind: "reducer"; value: unknown }
  | { kind: "store"; value: unknown }
  | { kind: "ref"; value: unknown }
  | { kind: "memo"; value: unknown; deps?: readonly unknown[] }
  | { kind: "callback"; value: unknown; deps?: readonly unknown[] }
  | { kind: "id"; value: unknown }
  | { kind: "imperative-handle"; deps?: readonly unknown[] }
  | { kind: "transition"; value: unknown }
  | { kind: "deferred"; value: unknown }
  | { kind: "debug"; value: unknown }
  | { kind: "effect"; effectKind: "insertion" | "layout" | "normal"; deps?: readonly unknown[] };

type HookSlot =
  | { kind: "state"; value: unknown }
  | {
      kind: "action-state";
      state: unknown;
      pendingCount: number;
      action: (previousState: unknown, payload: unknown) => unknown;
      dispatch?: (payload: unknown) => void;
      error?: unknown;
    }
  | {
      kind: "optimistic";
      baseState: unknown;
      optimisticState: unknown;
      update: (state: unknown, payload: unknown) => unknown;
      dispatch?: (payload: unknown) => void;
    }
  | { kind: "store"; value: unknown }
  | { kind: "ref"; value: { current: unknown } }
  | { kind: "memo"; value: unknown; deps?: readonly unknown[] }
  | { kind: "debug"; value: unknown }
  | {
      kind: "effect";
      effectKind: "insertion" | "layout" | "normal";
      callback: EffectCallback;
      deps?: readonly unknown[];
      cleanup?: () => void;
      disposed?: boolean;
      strictReplay?: boolean;
    };

let currentRuntime: RootRuntime | undefined;
let currentInstance: ComponentInstance | undefined;
let currentCacheScope: CacheScope | undefined;
const CACHE_SCOPE_SYMBOL = Symbol.for("modular.react.cache_scope");
const emptyCacheOwnerStack: string[] = [];
let syncVersion = 0;
let transitionVersion = 0;
let transitionDepth = 0;
let currentTransitionContext: TransitionContext | undefined;
let transitionRerenderScheduled = false;
let eventBatchDepth = 0;
let currentEventPriority: EventPriority = "default";
let eventRerenderScheduled = false;
const queuedTransitionRerenders = new Map<RootRuntime, TransitionContext>();
const queuedEventRerenders = new Set<RootRuntime>();
export const version = "19.2.6";

export function act<T>(callback: () => T): T extends PromiseLike<unknown> ? Promise<void> : void {
  const result = callback();

  return (isThenable(result) ? Promise.resolve(result).then(() => undefined) : undefined) as T extends PromiseLike<unknown>
    ? Promise<void>
    : void;
}

export type EventPriority = "discrete" | "continuous" | "default";
export type RenderPriority = "sync" | "transition" | "continuous";

interface TransitionContext {
  syncVersion: number;
  transitionVersion: number;
}

export interface RootRuntimeOptions {
  identifierPrefix?: string;
  idMode?: "client" | "server";
}

export interface RuntimeSnapshot {
  instanceKeys: Set<string>;
  portalContainers: Set<Element>;
  pendingInsertionEffectsLength: number;
  pendingLayoutEffectsLength: number;
  pendingEffectsLength: number;
  pendingProfilerCommitsLength: number;
  profilerBaseDurations: Map<string, number>;
  idCounter: number;
  identifierPrefix: string;
  idMode: "client" | "server";
  strictModeDepth: number;
  profilerFlushDepth: number;
}

export function createRootRuntime(
  rerender: (priority?: RenderPriority) => void,
  options: RootRuntimeOptions = {},
): RootRuntime {
  return {
    instances: new Map(),
    activeInstanceKeys: undefined,
    activeProfilerPaths: undefined,
    mountedProfilerPaths: new Set(),
    profilerBaseDurations: new Map(),
    pendingProfilerCommits: [],
    pendingInsertionEffects: [],
    pendingLayoutEffects: [],
    pendingEffects: [],
    externalStoreChecks: [],
    portalContainers: new Set(),
    idCounter: 0,
    identifierPrefix: options.identifierPrefix ?? "",
    idMode: options.idMode ?? "client",
    strictModeDepth: 0,
    profilerFlushDepth: 0,
    rerender,
    beginRender() {
      this.activeInstanceKeys = new Set();
      this.activeProfilerPaths = new Set();
      this.pendingProfilerCommits = [];
      this.pendingInsertionEffects = [];
      this.pendingLayoutEffects = [];
      this.pendingEffects = [];
      this.externalStoreChecks = [];
    },
    endRender(committed = true) {
      const profilerCommits = committed ? this.pendingProfilerCommits.splice(0) : [];
      const activeProfilerPaths = this.activeProfilerPaths;
      if (committed) {
        cleanupInactiveInstances(this);
        this.mountedProfilerPaths =
          activeProfilerPaths === undefined ? new Set() : new Set(activeProfilerPaths);
      } else {
        this.pendingProfilerCommits = [];
      }
      this.activeInstanceKeys = undefined;
      this.activeProfilerPaths = undefined;
      currentRuntime = undefined;
      currentInstance = undefined;
      if (committed) {
        flushProfilerCommits(this, profilerCommits);
      }
    },
    flushEffects() {
      this.profilerFlushDepth += 1;
      try {
        flushPendingEffects(this.pendingInsertionEffects);
        const strictLayoutEffects = flushPendingEffects(this.pendingLayoutEffects);
        const strictEffects = flushPendingEffects(this.pendingEffects);
        const strictReplayEffects = [...strictLayoutEffects, ...strictEffects];
        cleanupStrictEffects(strictReplayEffects);
        replayStrictEffects(strictReplayEffects);
      } finally {
        this.profilerFlushDepth -= 1;
      }
    },
    dispose() {
      for (const instance of this.instances.values()) {
        cleanupInstance(instance);
      }

      this.pendingLayoutEffects = [];
      this.pendingInsertionEffects = [];
      this.pendingEffects = [];
      this.pendingProfilerCommits = [];
      this.activeProfilerPaths = undefined;
      this.mountedProfilerPaths.clear();
      this.profilerBaseDurations.clear();
      for (const container of this.portalContainers) {
        container.replaceChildren();
      }
      this.portalContainers.clear();
    },
  };
}

export function createCacheScope(): CacheScope {
  return {
    functionCaches: new WeakMap(),
    controller: new AbortController(),
    ownerStack: [],
  };
}

export function refreshCacheScope(scope: CacheScope): void {
  scope.controller.abort();
  scope.functionCaches = new WeakMap();
  scope.controller = new AbortController();
}

export function runWithCacheScope<T>(scope: CacheScope, callback: () => T): T {
  const previousScope = currentCacheScope;
  const previousGlobalScope = getGlobalCacheScope();
  currentCacheScope = scope;
  setGlobalCacheScope(scope);

  try {
    const result = callback();

    if (isThenable(result)) {
      return Promise.resolve(result).finally(() => {
        currentCacheScope = previousScope;
        setGlobalCacheScope(previousGlobalScope);
      }) as T;
    }

    currentCacheScope = previousScope;
    setGlobalCacheScope(previousGlobalScope);
    return result;
  } catch (error) {
    currentCacheScope = previousScope;
    setGlobalCacheScope(previousGlobalScope);
    throw error;
  }
}

export function renderWithProfiler<T>(
  runtime: RootRuntime,
  path: string,
  props: Record<string, unknown>,
  render: () => T,
): T {
  const startTime = getCurrentTime();
  const phase: ProfilerPhase =
    runtime.profilerFlushDepth > 0
      ? "nested-update"
      : runtime.mountedProfilerPaths.has(path)
        ? "update"
        : "mount";

  try {
    return render();
  } finally {
    runtime.activeProfilerPaths?.add(path);
    const onRender = props.onRender;
    const id = props.id;

    if (typeof onRender === "function" && typeof id === "string") {
      const actualDuration = Math.max(0, getCurrentTime() - startTime);
      const baseDuration = Math.max(
        runtime.profilerBaseDurations.get(path) ?? 0,
        actualDuration,
      );
      runtime.profilerBaseDurations.set(path, baseDuration);
      runtime.pendingProfilerCommits.push({
        id,
        phase,
        onRender: onRender as ProfilerOnRender,
        actualDuration,
        baseDuration,
        startTime,
      });
    }
  }
}

export function renderWithRootRuntime<T>(
  runtime: RootRuntime,
  path: string,
  render: () => T,
): T {
  const previousRuntime = currentRuntime;
  const previousInstance = currentInstance;
  const instance = runtime.instances.get(path) ?? {
    hooks: [],
    hookIndex: 0,
    dirty: false,
    devToolsHooks: [],
    devToolsHookTypes: [],
    devToolsHookSuppressionDepth: 0,
  };
  runtime.instances.set(path, instance);
  runtime.activeInstanceKeys?.add(path);
  instance.hookIndex = 0;
  instance.dirty = false;
  instance.devToolsHooks = [];
  instance.devToolsHookTypes = [];
  instance.devToolsHookSuppressionDepth = 0;
  currentRuntime = runtime;
  currentInstance = instance;

  try {
    return render();
  } finally {
    currentRuntime = previousRuntime;
    currentInstance = previousInstance;
  }
}

export function getDevToolsHookState(
  runtime: RootRuntime,
  path: string,
): DevToolsHookState | undefined {
  const instance = runtime.instances.get(path);

  if (instance === undefined) {
    return undefined;
  }

  return {
    hooks: [...instance.devToolsHooks],
    hookTypes: [...instance.devToolsHookTypes],
  };
}

export function renderWithStrictMode<T>(
  runtime: RootRuntime,
  render: () => T,
): T {
  runtime.strictModeDepth += 1;

  try {
    return render();
  } finally {
    runtime.strictModeDepth -= 1;
  }
}

export function takeRuntimeSnapshot(runtime: RootRuntime): RuntimeSnapshot {
  return {
    instanceKeys: new Set(runtime.instances.keys()),
    portalContainers: new Set(runtime.portalContainers),
    pendingInsertionEffectsLength: runtime.pendingInsertionEffects.length,
    pendingLayoutEffectsLength: runtime.pendingLayoutEffects.length,
    pendingEffectsLength: runtime.pendingEffects.length,
    pendingProfilerCommitsLength: runtime.pendingProfilerCommits.length,
    profilerBaseDurations: new Map(runtime.profilerBaseDurations),
    idCounter: runtime.idCounter,
    identifierPrefix: runtime.identifierPrefix,
    idMode: runtime.idMode,
    strictModeDepth: runtime.strictModeDepth,
    profilerFlushDepth: runtime.profilerFlushDepth,
  };
}

export function restoreRuntimeSnapshot(
  runtime: RootRuntime,
  snapshot: RuntimeSnapshot,
): void {
  runtime.pendingInsertionEffects.length = snapshot.pendingInsertionEffectsLength;
  runtime.pendingLayoutEffects.length = snapshot.pendingLayoutEffectsLength;
  runtime.pendingEffects.length = snapshot.pendingEffectsLength;
  runtime.pendingProfilerCommits.length = snapshot.pendingProfilerCommitsLength;
  runtime.profilerBaseDurations = new Map(snapshot.profilerBaseDurations);
  runtime.idCounter = snapshot.idCounter;
  runtime.identifierPrefix = snapshot.identifierPrefix;
  runtime.idMode = snapshot.idMode;
  runtime.strictModeDepth = snapshot.strictModeDepth;
  runtime.profilerFlushDepth = snapshot.profilerFlushDepth;

  for (const key of runtime.instances.keys()) {
    if (!snapshot.instanceKeys.has(key)) {
      runtime.instances.delete(key);
    }
  }

  for (const container of runtime.portalContainers) {
    if (!snapshot.portalContainers.has(container)) {
      container.replaceChildren();
    }
  }

  runtime.portalContainers.clear();
  for (const container of snapshot.portalContainers) {
    runtime.portalContainers.add(container);
  }
}

export function useState<T>(
  initial: T | (() => T),
): [T, (value: T | ((previous: T) => T)) => void] {
  const runtime = requireRuntime();
  const instance = requireInstance();
  const index = instance.hookIndex;
  instance.hookIndex += 1;

  let slot = instance.hooks[index];

  if (slot === undefined) {
    slot = {
      kind: "state",
      value: typeof initial === "function" ? (initial as () => T)() : initial,
    };
    instance.hooks[index] = slot;
  }

  if (slot.kind !== "state") {
    throw new Error("Hook order changed between renders.");
  }

  const setState = (value: T | ((previous: T) => T)): void => {
    const nextValue =
      typeof value === "function"
        ? (value as (previous: T) => T)(slot.value as T)
        : value;

    if (Object.is(slot.value, nextValue)) {
      return;
    }

    slot.value = nextValue;
    scheduleInstanceUpdate(runtime, instance);
  };

  recordDevToolsHook("useState", {
    kind: "state",
    value: slot.value,
  });

  return [slot.value as T, setState];
}

export function useReducer<TState, TAction, TInitial = TState>(
  reducer: (state: TState, action: TAction) => TState,
  initialArg: TInitial,
  init?: (initialArg: TInitial) => TState,
): [TState, (action: TAction) => void] {
  const [state, setState] = runWithoutDevToolsHookTracking(() =>
    useState<TState>(() =>
      init === undefined ? (initialArg as unknown as TState) : init(initialArg),
    ),
  );
  const reducerRef = runWithoutDevToolsHookTracking(() => useRef(reducer));
  const dispatchRef = runWithoutDevToolsHookTracking(() =>
    useRef<((action: TAction) => void) | undefined>(
      undefined,
    )
  );
  reducerRef.current = reducer;

  if (dispatchRef.current === undefined) {
    dispatchRef.current = (action: TAction): void => {
      setState((previousState) => reducerRef.current(previousState, action));
    };
  }

  recordDevToolsHook("useReducer", {
    kind: "reducer",
    value: state,
  });

  return [state, dispatchRef.current];
}

export function useRef<T>(initial: T): { current: T } {
  const instance = requireInstance();
  const index = instance.hookIndex;
  instance.hookIndex += 1;

  let slot = instance.hooks[index];

  if (slot === undefined) {
    slot = { kind: "ref", value: { current: initial } };
    instance.hooks[index] = slot;
  }

  if (slot.kind !== "ref") {
    throw new Error("Hook order changed between renders.");
  }

  recordDevToolsHook("useRef", {
    kind: "ref",
    value: slot.value,
  });

  return slot.value as { current: T };
}

export function useId(): string {
  const runtime = requireRuntime();
  const idRef = runWithoutDevToolsHookTracking(() =>
    useRef<string | undefined>(undefined)
  );

  if (idRef.current === undefined) {
    const mode = runtime.idMode === "server" ? "R" : "r";
    idRef.current = `_${runtime.identifierPrefix}${mode}_${runtime.idCounter}_`;
    runtime.idCounter += 1;
  }

  recordDevToolsHook("useId", {
    kind: "id",
    value: idRef.current,
  });

  return idRef.current;
}

export function useImperativeHandle<T>(
  ref: unknown,
  create: () => T,
  deps?: readonly unknown[],
): void {
  const handle = runWithoutDevToolsHookTracking(() => useMemo(create, deps));

  runWithoutDevToolsHookTracking(() =>
    useInsertionEffect(() => {
      assignRef(ref, handle);
      return () => {
        assignRef(ref, null);
      };
    }, [ref, handle])
  );
  recordDevToolsHook("useImperativeHandle", deps === undefined
    ? { kind: "imperative-handle" }
    : { kind: "imperative-handle", deps });
}

export function useMemo<T>(factory: () => T, deps?: readonly unknown[]): T {
  const instance = requireInstance();
  const index = instance.hookIndex;
  instance.hookIndex += 1;

  let slot = instance.hooks[index];

  if (slot !== undefined && slot.kind !== "memo") {
    throw new Error("Hook order changed between renders.");
  }

  if (
    slot === undefined ||
    deps === undefined ||
    slot.deps === undefined ||
    !areHookInputsEqual(deps, slot.deps)
  ) {
    const value = factory();
    slot =
      deps === undefined
        ? { kind: "memo", value }
        : { kind: "memo", value, deps };
    instance.hooks[index] = slot;
  }

  recordDevToolsHook("useMemo", slot.deps === undefined
    ? { kind: "memo", value: slot.value }
    : { kind: "memo", value: slot.value, deps: slot.deps });

  return slot.value as T;
}

function assignRef<T>(ref: unknown, value: T | null): void {
  if (typeof ref === "function") {
    ref(value);
    return;
  }

  if (typeof ref === "object" && ref !== null && "current" in ref) {
    (ref as { current: T | null }).current = value;
  }
}

function recordDevToolsHook(type: string, value: DevToolsHookValue): void {
  const instance = currentInstance;

  if (instance === undefined || instance.devToolsHookSuppressionDepth > 0) {
    return;
  }

  instance.devToolsHookTypes.push(type);
  instance.devToolsHooks.push(value);
}

function runWithoutDevToolsHookTracking<T>(callback: () => T): T {
  const instance = requireInstance();
  instance.devToolsHookSuppressionDepth += 1;

  try {
    return callback();
  } finally {
    instance.devToolsHookSuppressionDepth -= 1;
  }
}

export function useCallback<T extends (...args: never[]) => unknown>(
  callback: T,
  deps?: readonly unknown[],
): T {
  const value = runWithoutDevToolsHookTracking(() => useMemo(() => callback, deps));
  recordDevToolsHook("useCallback", deps === undefined
    ? { kind: "callback", value }
    : { kind: "callback", value, deps });
  return value;
}

export function useDebugValue(_value: unknown, _format?: (value: unknown) => unknown): void {
  const instance = requireInstance();
  const index = instance.hookIndex;
  instance.hookIndex += 1;

  const value = _format === undefined ? _value : _format(_value);
  let slot = instance.hooks[index];

  if (slot !== undefined && slot.kind !== "debug") {
    throw new Error("Hook order changed between renders.");
  }

  if (slot === undefined) {
    slot = { kind: "debug", value };
    instance.hooks[index] = slot;
    recordDevToolsHook("useDebugValue", {
      kind: "debug",
      value,
    });
    return;
  }

  slot.value = value;
  recordDevToolsHook("useDebugValue", {
    kind: "debug",
    value,
  });
}

export function useEffectEvent<TArgs extends unknown[], TResult>(
  callback: (...args: TArgs) => TResult,
): (...args: TArgs) => TResult {
  const ref = runWithoutDevToolsHookTracking(() => useRef(callback));
  ref.current = callback;

  const event = runWithoutDevToolsHookTracking(() =>
    useCallback((...args: TArgs) => ref.current(...args), [])
  );
  recordDevToolsHook("useEffectEvent", {
    kind: "callback",
    value: event,
    deps: [],
  });
  return event;
}

export function useEffect(
  callback: EffectCallback,
  deps?: readonly unknown[],
): void {
  useEffectImpl("normal", callback, deps);
  recordDevToolsHook("useEffect", deps === undefined
    ? { kind: "effect", effectKind: "normal" }
    : { kind: "effect", effectKind: "normal", deps });
}

export function useInsertionEffect(
  callback: EffectCallback,
  deps?: readonly unknown[],
): void {
  useEffectImpl("insertion", callback, deps);
  recordDevToolsHook("useInsertionEffect", deps === undefined
    ? { kind: "effect", effectKind: "insertion" }
    : { kind: "effect", effectKind: "insertion", deps });
}

export function useLayoutEffect(
  callback: EffectCallback,
  deps?: readonly unknown[],
): void {
  useEffectImpl("layout", callback, deps);
  recordDevToolsHook("useLayoutEffect", deps === undefined
    ? { kind: "effect", effectKind: "layout" }
    : { kind: "effect", effectKind: "layout", deps });
}

export function useSyncExternalStore<T>(
  subscribe: (listener: () => void) => () => void,
  getSnapshot: () => T,
  getServerSnapshot: () => T = getSnapshot,
): T {
  const runtime = requireRuntime();
  const instance = requireInstance();
  const index = instance.hookIndex;
  instance.hookIndex += 1;
  let slot = instance.hooks[index];

  if (slot === undefined) {
    slot = { kind: "store", value: getServerSnapshot() };
    instance.hooks[index] = slot;
  }

  if (slot.kind !== "store") {
    throw new Error("Hook order changed between renders.");
  }

  const currentSnapshot = getSnapshot();

  if (!Object.is(slot.value, currentSnapshot)) {
    slot.value = currentSnapshot;
  }

  recordExternalStoreCheck(getSnapshot, currentSnapshot);

  runWithoutDevToolsHookTracking(() => useEffect(() => {
    const checkForUpdates = (): void => {
      const nextSnapshot = getSnapshot();

      if (!Object.is(slot.value, nextSnapshot)) {
        slot.value = nextSnapshot;
        runtime.rerender("sync");
      }
    };

    checkForUpdates();
    return subscribe(checkForUpdates);
  }, [subscribe, getSnapshot]));

  recordDevToolsHook("useSyncExternalStore", {
    kind: "store",
    value: slot.value,
  });

  return slot.value as T;
}

export function useActionState<TState, TPayload>(
  action: (previousState: TState, payload: TPayload) => TState | Promise<TState>,
  initialState: TState,
): [TState, (payload: TPayload) => void, boolean] {
  const runtime = requireRuntime();
  const instance = requireInstance();
  const index = instance.hookIndex;
  instance.hookIndex += 1;
  let slot = instance.hooks[index];

  if (slot !== undefined && slot.kind !== "action-state") {
    throw new Error("Hook order changed between renders.");
  }

  if (slot === undefined) {
    slot = {
      kind: "action-state",
      state: initialState,
      pendingCount: 0,
      action: action as (previousState: unknown, payload: unknown) => unknown,
    };
    instance.hooks[index] = slot;
  }

  if ("error" in slot) {
    throw slot.error;
  }

  slot.action = action as (previousState: unknown, payload: unknown) => unknown;

  if (slot.dispatch === undefined) {
    slot.dispatch = (payload: unknown): void => {
      runActionStateDispatch(slot, runtime, instance, payload);
    };
  }

  recordDevToolsHook("useActionState", {
    kind: "state",
    value: slot.state,
  });

  return [
    slot.state as TState,
    slot.dispatch as (payload: TPayload) => void,
    slot.pendingCount > 0,
  ];
}

export function useOptimistic<TState, TPayload>(
  state: TState,
  update?: (state: TState, payload: TPayload) => TState,
): [TState, (payload: TPayload) => void] {
  const runtime = requireRuntime();
  const instance = requireInstance();
  const index = instance.hookIndex;
  instance.hookIndex += 1;
  let slot = instance.hooks[index];
  const updateFn =
    update === undefined
      ? (_current: unknown, payload: unknown) => payload
      : update as (state: unknown, payload: unknown) => unknown;

  if (slot !== undefined && slot.kind !== "optimistic") {
    throw new Error("Hook order changed between renders.");
  }

  if (slot === undefined) {
    slot = {
      kind: "optimistic",
      baseState: state,
      optimisticState: state,
      update: updateFn,
    };
    instance.hooks[index] = slot;
  }

  slot.update = updateFn;

  if (!Object.is(slot.baseState, state)) {
    slot.baseState = state;
    slot.optimisticState = state;
  }

  if (slot.dispatch === undefined) {
    slot.dispatch = (payload: unknown): void => {
      slot.optimisticState = slot.update(slot.optimisticState, payload);
      scheduleInstanceUpdate(runtime, instance);
    };
  }

  recordDevToolsHook("useOptimistic", {
    kind: "state",
    value: slot.optimisticState,
  });

  return [slot.optimisticState as TState, slot.dispatch as (payload: TPayload) => void];
}

export function use<T>(usable: PromiseLike<T> | unknown): T {
  if (isReactCompatContext(usable)) {
    return useContext(usable) as T;
  }

  if (isThenable(usable)) {
    return readThenable(usable as PromiseLike<T>);
  }

  return usable as T;
}

export function cache<TArgs extends unknown[], TResult>(
  callback: (...args: TArgs) => TResult,
): (...args: TArgs) => TResult {
  return (...args) => {
    const scope = getCurrentCacheScope();

    if (scope === undefined) {
      return callback(...args);
    }

    const leaf = getCacheLeaf(scope, callback, args);

    if (leaf.status === "fulfilled") {
      return leaf.value as TResult;
    }

    if (leaf.status === "rejected") {
      throw leaf.reason;
    }

    try {
      const value = callback(...args);
      leaf.status = "fulfilled";
      leaf.value = value;
      return value;
    } catch (error) {
      leaf.status = "rejected";
      leaf.reason = error;
      throw error;
    }
  };
}

export function cacheSignal(): AbortSignal | null {
  return getCurrentCacheScope()?.controller.signal ?? null;
}

export function captureOwnerStack(): string | null {
  const stack = getCurrentCacheScope()?.ownerStack ?? emptyCacheOwnerStack;
  return stack.length === 0 ? null : stack.join("\n");
}

export function unstable_useCacheRefresh(): () => void {
  return useCallback(() => undefined, []);
}

export function hasStableExternalStores(
  runtime: RootRuntime,
): boolean {
  return runtime.externalStoreChecks.every((check) =>
    Object.is(check.getSnapshot(), check.value),
  );
}

export function renderToString<TProps>(
  component: (props: TProps) => ReactCompatNode,
  props?: TProps,
  options: RootRuntimeOptions = {},
): string {
  const runtime = createRootRuntime(() => undefined, {
    ...options,
    idMode: "server",
  });

  return runWithCacheScope(createCacheScope(), () => {
    try {
      const rendered = renderWithRootRuntime(runtime, "0", () => component(props as TProps));
      return typeof rendered === "string"
        ? rendered
        : renderNodeToString(rendered, runtime, "0");
    } finally {
      runtime.dispose();
    }
  });
}

function renderNodeToString(
  node: ReactCompatNode,
  runtime: RootRuntime,
  path: string,
): string {
  if (node === null || node === undefined || typeof node === "boolean") {
    return "";
  }

  if (typeof node === "string" || typeof node === "number") {
    return escapeHtml(node);
  }

  if (Array.isArray(node)) {
    return node.map((child, index) => renderNodeToString(child, runtime, `${path}.${index}`)).join("");
  }

  if (!isReactCompatElement(node)) {
    return "";
  }

  return renderElementToString(node, runtime, path);
}

function renderElementToString(
  element: ReactCompatElement,
  runtime: RootRuntime,
  path: string,
): string {
  if (typeof element.type === "string") {
    if (element.type === "textarea") {
      return renderTextareaToString(element, runtime, path);
    }

    if (element.type === "select") {
      return renderSelectToString(element, runtime, path);
    }

    const attributes = element.type === "input"
      ? renderInputAttributesToString(element.props)
      : Object.entries(element.props)
          .map(([name, value]) => renderHtmlAttribute(name, value))
          .filter((attribute) => attribute !== "")
          .join("");
    if (voidHtmlElements.has(element.type)) {
      return `<${element.type}${attributes}/>`;
    }

    return `<${element.type}${attributes}>${renderNodeToString(element.props.children, runtime, `${path}.children`)}</${element.type}>`;
  }

  if (element.type === Fragment) {
    return renderNodeToString(element.props.children, runtime, `${path}.fragment`);
  }

  if (element.type === Activity) {
    if ((element.props as { mode?: unknown }).mode === "hidden") {
      return "";
    }

    return `<!--&-->${renderNodeToString(element.props.children, runtime, `${path}.activity`)}<!--/&-->`;
  }

  if (element.type === Profiler) {
    return renderNodeToString(element.props.children, runtime, `${path}.profiler`);
  }

  if (isReactCompatProvider(element.type)) {
    return renderWithContextProvider(
      element.type,
      (element.props as { value?: unknown }).value,
      () => renderNodeToString(element.props.children, runtime, `${path}.provider`),
    );
  }

  if (isReactCompatConsumer(element.type)) {
    const children = element.props.children;

    if (typeof children === "function") {
      return renderNodeToString(
        (children as (value: unknown) => ReactCompatNode)(useContext(element.type.context)),
        runtime,
        `${path}.consumer`,
      );
    }

    return "";
  }

  if (isForwardRefType(element.type)) {
    const forwardRefType = element.type;
    return renderNodeToString(
      renderWithRootRuntime(runtime, `${path}.forwardRef`, () =>
        forwardRefType.render(element.props, element.ref),
      ),
      runtime,
      `${path}.forwardRef`,
    );
  }

  if (isMemoType(element.type)) {
    return renderNodeToString(
      {
        ...element,
        type: element.type.type,
      },
      runtime,
      `${path}.memo`,
    );
  }

  if (isClassComponentType(element.type)) {
    const instance = new element.type(element.props);
    return renderNodeToString(
      renderWithRootRuntime(runtime, path, () => instance.render()),
      runtime,
      path,
    );
  }

  if (typeof element.type === "function") {
    const component = element.type as (props: typeof element.props) => ReactCompatNode;
    return renderNodeToString(
      renderWithRootRuntime(runtime, path, () => component(element.props)),
      runtime,
      path,
    );
  }

  return "";
}

function isClassComponentType(
  value: unknown,
): value is new (props: Record<string, unknown>) => { render(): ReactCompatNode } {
  return (
    typeof value === "function" &&
    typeof (value as { prototype?: { render?: unknown } }).prototype?.render === "function"
  );
}

function renderTextareaToString(
  element: ReactCompatElement,
  runtime: RootRuntime,
  path: string,
): string {
  const value =
    (element.props as { value?: unknown; defaultValue?: unknown }).value ??
    (element.props as { value?: unknown; defaultValue?: unknown }).defaultValue ??
    element.props.children;
  const attributes = Object.entries(element.props)
    .filter(([name]) => name !== "value" && name !== "defaultValue")
    .map(([name, child]) => renderHtmlAttribute(name, child))
    .filter((attribute) => attribute !== "")
    .join("");

  return `<textarea${attributes}>${renderNodeToString(value as ReactCompatNode, runtime, `${path}.textarea`)}</textarea>`;
}

function renderSelectToString(
  element: ReactCompatElement,
  runtime: RootRuntime,
  path: string,
): string {
  const selectedValue =
    (element.props as { value?: unknown; defaultValue?: unknown }).value ??
    (element.props as { value?: unknown; defaultValue?: unknown }).defaultValue;
  const attributes = Object.entries(element.props)
    .filter(([name]) => name !== "value" && name !== "defaultValue")
    .map(([name, child]) => renderHtmlAttribute(name, child))
    .filter((attribute) => attribute !== "")
    .join("");

  return `<select${attributes}>${renderSelectChildrenToString(
    element.props.children,
    selectedValue,
    runtime,
    `${path}.select`,
  )}</select>`;
}

function renderSelectChildrenToString(
  children: ReactCompatNode,
  selectedValue: unknown,
  runtime: RootRuntime,
  path: string,
): string {
  const childArray = Array.isArray(children) ? children : [children];

  return childArray.map((child, index) => {
    if (!isReactCompatElement(child) || child.type !== "option") {
      return renderNodeToString(child, runtime, `${path}.${index}`);
    }

    const optionValue =
      (child.props as { value?: unknown }).value ?? child.props.children;
    const selected =
      selectedValue !== undefined && String(optionValue) === String(selectedValue);
    const props = selected
      ? { ...child.props, selected: true }
      : child.props;

    return renderElementToString({ ...child, props }, runtime, `${path}.${index}`);
  }).join("");
}

function renderInputAttributesToString(props: Record<string, unknown>): string {
  const hasValue = props.value !== undefined;
  const hasChecked = props.checked !== undefined;

  return Object.entries(props)
    .filter(([name]) =>
      !((name === "defaultValue" && hasValue) || (name === "defaultChecked" && hasChecked))
    )
    .sort(([leftName], [rightName]) =>
      Number(isInputValueAttribute(leftName)) - Number(isInputValueAttribute(rightName))
    )
    .map(([name, value]) => renderHtmlAttribute(toInputHtmlAttributeName(name), value))
    .filter((attribute) => attribute !== "")
    .join("");
}

function renderHtmlAttribute(name: string, value: unknown): string {
  if (
    name === "children" ||
    name === "key" ||
    name === "ref" ||
    /^on[A-Z]/.test(name) ||
    value === null ||
    value === undefined ||
    value === false ||
    typeof value === "function"
  ) {
    return "";
  }

  if (name === "style") {
    const style = renderStyleAttribute(value);
    return style === "" ? "" : ` style="${escapeHtml(style)}"`;
  }

  const attributeName = toHtmlAttributeName(name);
  if (isDangerousHtmlAttribute(attributeName)) {
    return isDangerousHtmlOptIn(value)
      ? ` ${attributeName}="${escapeHtml(value.__html)}"`
      : "";
  }

  if (typeof value === "object") {
    return "";
  }

  if (value === true) {
    return ` ${attributeName}=""`;
  }

  return ` ${attributeName}="${escapeHtml(value)}"`;
}

function isInputValueAttribute(name: string): boolean {
  return name === "value" || name === "defaultValue";
}

function toInputHtmlAttributeName(name: string): string {
  if (name === "defaultValue") {
    return "value";
  }

  if (name === "defaultChecked") {
    return "checked";
  }

  return name;
}

function toHtmlAttributeName(name: string): string {
  return HTML_ATTRIBUTE_ALIASES[name] ?? name;
}

const HTML_ATTRIBUTE_ALIASES: Record<string, string> = {
  acceptCharset: "accept-charset",
  autoFocus: "autofocus",
  autoPlay: "autoplay",
  charSet: "charset",
  className: "class",
  colSpan: "colspan",
  contentEditable: "contenteditable",
  crossOrigin: "crossorigin",
  encType: "enctype",
  formAction: "formaction",
  frameBorder: "frameborder",
  htmlFor: "for",
  httpEquiv: "http-equiv",
  maxLength: "maxlength",
  minLength: "minlength",
  noValidate: "novalidate",
  playsInline: "playsinline",
  readOnly: "readOnly",
  rowSpan: "rowspan",
  spellCheck: "spellcheck",
  srcDoc: "srcdoc",
  srcSet: "srcset",
  tabIndex: "tabindex",
  useMap: "usemap",
};

function renderStyleAttribute(value: unknown): string {
  if (typeof value !== "object" || value === null) {
    return "";
  }

  return Object.entries(value)
    .filter(([, propertyValue]) =>
      propertyValue !== null &&
      propertyValue !== undefined &&
      typeof propertyValue !== "boolean" &&
      propertyValue !== "",
    )
    .map(([name, propertyValue]) =>
      `${toKebabCase(name)}:${renderCssValue(name, propertyValue)}`,
    )
    .join(";");
}

function renderCssValue(name: string, value: unknown): string {
  if (typeof value !== "number" || value === 0 || isUnitlessCssProperty(name)) {
    return String(value);
  }

  return `${value}px`;
}

function toKebabCase(value: string): string {
  return value.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

function isUnitlessCssProperty(name: string): boolean {
  return (
    name === "flex" ||
    name === "fontWeight" ||
    name === "lineHeight" ||
    name === "opacity" ||
    name === "order" ||
    name === "zIndex" ||
    name === "zoom"
  );
}

const voidHtmlElements = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr",
]);

function isForwardRefType(value: unknown): value is ForwardRefType {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { $$typeof?: unknown }).$$typeof === FORWARD_REF_TYPE
  );
}

function isMemoType(value: unknown): value is MemoType {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { $$typeof?: unknown }).$$typeof === MEMO_TYPE
  );
}

function readThenable<T>(thenable: PromiseLike<T>): T {
  const record = thenable as PromiseLike<T> & {
    status?: "pending" | "fulfilled" | "rejected";
    value?: T;
    reason?: unknown;
  };

  if (record.status === "fulfilled") {
    return record.value as T;
  }

  if (record.status === "rejected") {
    throw record.reason;
  }

  if (record.status === undefined) {
    record.status = "pending";
    thenable.then(
      (value) => {
        if (record.status === "pending") {
          record.status = "fulfilled";
          record.value = value;
        }
      },
      (reason) => {
        if (record.status === "pending") {
          record.status = "rejected";
          record.reason = reason;
        }
      },
    );
  }

  throw thenable;
}

export type TransitionScope = () => void;
export type StartTransition = (scope: TransitionScope) => void;

export function startTransition(scope: TransitionScope): void {
  const context = {
    syncVersion,
    transitionVersion: ++transitionVersion,
  };
  scheduleCallback("low", () => {
    if (!isTransitionContextCurrent(context)) {
      return;
    }

    runTransitionScope(scope, context);
  });
}

export function runWithEventPriority<T>(
  priority: EventPriority,
  callback: () => T,
): T {
  const previousPriority = currentEventPriority;
  currentEventPriority = priority;
  eventBatchDepth += 1;

  try {
    return callback();
  } finally {
    eventBatchDepth -= 1;
    currentEventPriority = previousPriority;

    if (eventBatchDepth === 0) {
      flushEventRerendersForPriority(priority);
    }
  }
}

export function flushSyncUpdates<T>(callback: () => T): T {
  const previousEventBatchDepth = eventBatchDepth;
  const previousEventPriority = currentEventPriority;
  eventBatchDepth = 0;
  currentEventPriority = "discrete";

  try {
    const value = callback();
    flushQueuedEventRerenders();
    return value;
  } finally {
    eventBatchDepth = previousEventBatchDepth;
    currentEventPriority = previousEventPriority;
  }
}

export function useTransition(): [boolean, StartTransition] {
  const [pending, setPending] = runWithoutDevToolsHookTracking(() => useState(false));
  const startTransitionWithPending: StartTransition = (scope) => {
    setPending(true);
    const context = {
      syncVersion,
      transitionVersion: ++transitionVersion,
    };
    scheduleCallback("low", () => {
      if (!isTransitionContextCurrent(context)) {
        setPending(false);
        return;
      }

      runTransitionScope(() => {
        scope();
        setPending(false);
      }, context);
    });
  };

  recordDevToolsHook("useTransition", {
    kind: "transition",
    value: pending,
  });

  return [
    pending,
    startTransitionWithPending,
  ];
}

export function useDeferredValue<T>(value: T): T {
  const [deferredValue, setDeferredValue] = runWithoutDevToolsHookTracking(() =>
    useState(value)
  );

  runWithoutDevToolsHookTracking(() =>
    useEffect(() => {
      if (Object.is(deferredValue, value)) {
        return;
      }

      startTransition(() => {
        setDeferredValue(value);
      });
    }, [value, deferredValue])
  );

  const currentValue = Object.is(deferredValue, value) ? value : deferredValue;

  recordDevToolsHook("useDeferredValue", {
    kind: "deferred",
    value: currentValue,
  });

  return currentValue;
}

function runTransitionScope(
  scope: TransitionScope,
  context: TransitionContext,
): void {
  transitionDepth += 1;
  const previousContext = currentTransitionContext;
  currentTransitionContext = context;

  try {
    scope();
  } finally {
    currentTransitionContext = previousContext;
    transitionDepth -= 1;
  }
}

function queueTransitionRerender(
  runtime: RootRuntime,
  context: TransitionContext,
): void {
  queuedTransitionRerenders.set(runtime, context);

  if (transitionRerenderScheduled) {
    return;
  }

  transitionRerenderScheduled = true;
  scheduleCallback("low", flushQueuedTransitionRerenders);
}

function queueEventRerender(runtime: RootRuntime): void {
  queuedEventRerenders.add(runtime);
}

function flushEventRerendersForPriority(priority: EventPriority): void {
  if (priority === "discrete") {
    flushQueuedEventRerenders("sync");
    return;
  }

  if (eventRerenderScheduled || queuedEventRerenders.size === 0) {
    return;
  }

  eventRerenderScheduled = true;
  scheduleCallback(priority === "continuous" ? "normal" : "low", () => {
    eventRerenderScheduled = false;
    flushQueuedEventRerenders(
      priority === "continuous" ? "continuous" : "sync",
    );
  });
}

function flushQueuedEventRerenders(priority: RenderPriority = "sync"): void {
  const runtimes = Array.from(queuedEventRerenders);
  queuedEventRerenders.clear();

  for (const runtime of runtimes) {
    runtime.rerender(priority);
  }
}

function flushQueuedTransitionRerenders(): void {
  transitionRerenderScheduled = false;
  const entries = Array.from(queuedTransitionRerenders.entries());
  queuedTransitionRerenders.clear();

  for (const [runtime, context] of entries) {
    if (isTransitionContextCurrent(context)) {
      runtime.rerender("transition");
    }
  }
}

function isTransitionContextCurrent(context: TransitionContext): boolean {
  return (
    context.syncVersion === syncVersion &&
    context.transitionVersion === transitionVersion
  );
}

function useEffectImpl(
  effectKind: "insertion" | "layout" | "normal",
  callback: EffectCallback,
  deps?: readonly unknown[],
): void {
  const runtime = requireRuntime();
  const instance = requireInstance();
  const index = instance.hookIndex;
  instance.hookIndex += 1;

  let slot = instance.hooks[index];

  if (slot !== undefined && slot.kind !== "effect") {
    throw new Error("Hook order changed between renders.");
  }

  const shouldRun =
    slot === undefined ||
    deps === undefined ||
    slot.deps === undefined ||
    !areHookInputsEqual(deps, slot.deps);

  if (slot === undefined) {
    slot =
      deps === undefined
        ? { kind: "effect", effectKind, callback }
        : { kind: "effect", effectKind, callback, deps };
    instance.hooks[index] = slot;
  } else {
    slot.effectKind = effectKind;
    slot.callback = callback;
    slot.disposed = false;

    if (deps === undefined) {
      delete slot.deps;
    } else {
      slot.deps = deps;
    }
  }

  slot.strictReplay =
    runtime.strictModeDepth > 0 && effectKind !== "insertion";

  if (shouldRun) {
    const queue =
      effectKind === "insertion"
        ? runtime.pendingInsertionEffects
        : effectKind === "layout"
        ? runtime.pendingLayoutEffects
        : runtime.pendingEffects;
    queue.push({ slot });
  }
}

function recordExternalStoreCheck<T>(
  getSnapshot: () => T,
  value: T,
): void {
  currentRuntime?.externalStoreChecks.push({ getSnapshot, value });
}

function flushPendingEffects(queue: PendingEffect[]): PendingEffect[] {
  const pending = queue.splice(0);
  const strictReplay: PendingEffect[] = [];

  for (const { slot } of pending) {
    if (slot.disposed === true) {
      continue;
    }

    slot.cleanup?.();
    const shouldReplay = slot.strictReplay === true && slot.cleanup === undefined;
    const cleanup = slot.callback();

    if (typeof cleanup === "function") {
      slot.cleanup = cleanup;
    } else {
      delete slot.cleanup;
    }

    if (shouldReplay) {
      strictReplay.push({ slot });
    }
  }

  return strictReplay;
}

function replayStrictEffects(effects: PendingEffect[]): void {
  for (const { slot } of effects) {
    if (slot.disposed === true) {
      continue;
    }

    const cleanup = slot.callback();

    if (typeof cleanup === "function") {
      slot.cleanup = cleanup;
    } else {
      delete slot.cleanup;
    }
  }
}

function flushProfilerCommits(
  runtime: RootRuntime,
  commits: PendingProfilerCommit[],
): void {
  if (commits.length === 0) {
    return;
  }

  const commitTime = getCurrentTime();
  runtime.profilerFlushDepth += 1;

  try {
    for (const commit of commits) {
      commit.onRender(
        commit.id,
        commit.phase,
        commit.actualDuration,
        commit.baseDuration,
        commit.startTime,
        commitTime,
      );
    }
  } finally {
    runtime.profilerFlushDepth -= 1;
  }
}

function runActionStateDispatch(
  slot: Extract<HookSlot, { kind: "action-state" }>,
  runtime: RootRuntime,
  instance: ComponentInstance,
  payload: unknown,
): void {
  let result: unknown;

  try {
    result = slot.action(slot.state, payload);
  } catch (error) {
    slot.error = error;
    scheduleInstanceUpdate(runtime, instance);
    return;
  }

  if (!isThenable(result)) {
    slot.state = result;
    scheduleInstanceUpdate(runtime, instance);
    return;
  }

  slot.pendingCount += 1;
  scheduleInstanceUpdate(runtime, instance);
  result.then(
    (nextState) => {
      slot.state = nextState;
      slot.pendingCount = Math.max(0, slot.pendingCount - 1);
      scheduleInstanceUpdate(runtime, instance);
    },
    (error) => {
      slot.error = error;
      slot.pendingCount = Math.max(0, slot.pendingCount - 1);
      scheduleInstanceUpdate(runtime, instance);
    },
  );
}

function scheduleInstanceUpdate(
  runtime: RootRuntime,
  instance: ComponentInstance,
): void {
  instance.dirty = true;
  if (transitionDepth === 0) {
    syncVersion += 1;
    if (eventBatchDepth > 0) {
      queueEventRerender(runtime);
      return;
    }
    runtime.rerender("sync");
    return;
  }

  if (currentTransitionContext !== undefined) {
    queueTransitionRerender(runtime, currentTransitionContext);
  }
}

function getCacheLeaf(
  scope: CacheScope,
  callback: (...args: never[]) => unknown,
  args: readonly unknown[],
): CacheTrieNode {
  let node = scope.functionCaches.get(callback);

  if (node === undefined) {
    node = createCacheTrieNode();
    scope.functionCaches.set(callback, node);
  }

  for (const arg of args) {
    node = getCacheChild(node, arg);
  }

  return node;
}

function getCacheChild(node: CacheTrieNode, key: unknown): CacheTrieNode {
  if ((typeof key === "object" && key !== null) || typeof key === "function") {
    const objectKey = key as object;
    let child = node.objectChildren.get(objectKey);

    if (child === undefined) {
      child = createCacheTrieNode();
      node.objectChildren.set(objectKey, child);
    }

    return child;
  }

  let child = node.primitiveChildren.get(key);

  if (child === undefined) {
    child = createCacheTrieNode();
    node.primitiveChildren.set(key, child);
  }

  return child;
}

function createCacheTrieNode(): CacheTrieNode {
  return {
    primitiveChildren: new Map(),
    objectChildren: new WeakMap(),
  };
}

function getCurrentCacheScope(): CacheScope | undefined {
  return currentCacheScope ?? getGlobalCacheScope();
}

function getGlobalCacheScope(): CacheScope | undefined {
  return (globalThis as { [CACHE_SCOPE_SYMBOL]?: CacheScope })[CACHE_SCOPE_SYMBOL];
}

function setGlobalCacheScope(scope: CacheScope | undefined): void {
  if (scope === undefined) {
    delete (globalThis as { [CACHE_SCOPE_SYMBOL]?: CacheScope })[CACHE_SCOPE_SYMBOL];
    return;
  }

  (globalThis as { [CACHE_SCOPE_SYMBOL]?: CacheScope })[CACHE_SCOPE_SYMBOL] = scope;
}

function cleanupStrictEffects(effects: PendingEffect[]): void {
  for (const { slot } of effects) {
    if (slot.disposed !== true) {
      slot.cleanup?.();
    }
  }
}

function cleanupInactiveInstances(runtime: RootRuntime): void {
  const activeInstanceKeys = runtime.activeInstanceKeys;

  if (activeInstanceKeys === undefined) {
    return;
  }

  for (const [key, instance] of runtime.instances) {
    if (!activeInstanceKeys.has(key)) {
      cleanupInstance(instance);
      runtime.instances.delete(key);
    }
  }
}

function cleanupInstance(instance: ComponentInstance): void {
  for (const slot of instance.hooks) {
    if (slot?.kind === "effect") {
      slot.disposed = true;
      slot.cleanup?.();
      delete slot.cleanup;
    }
  }
}

function requireRuntime(): RootRuntime {
  if (currentRuntime === undefined) {
    throw new Error("Hooks can only be called while rendering.");
  }

  return currentRuntime;
}

function requireInstance(): ComponentInstance {
  if (currentInstance === undefined) {
    throw new Error("Hooks can only be called while rendering.");
  }

  return currentInstance;
}

function areHookInputsEqual(
  nextDeps: readonly unknown[],
  previousDeps: readonly unknown[],
): boolean {
  if (nextDeps.length !== previousDeps.length) {
    return false;
  }

  for (let index = 0; index < nextDeps.length; index += 1) {
    if (!Object.is(nextDeps[index], previousDeps[index])) {
      return false;
    }
  }

  return true;
}

function getCurrentTime(): number {
  return typeof performance === "undefined" ? Date.now() : performance.now();
}
