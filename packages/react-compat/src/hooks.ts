import {
  flushPendingComputed,
  flushQueuedComputations,
} from "@reckona/mreact-reactive-core/internal";
import { scheduleCallback } from "./fiber-scheduler.js";
import { removeChildIfPresent } from "./dom-children.js";
import {
  type ReactCompatContextLike,
  isReactCompatContext,
  readContextValue,
  useContext,
  withContextReadObserver,
} from "./context.js";
import { REACTIVE_TEXT_BINDING_META } from "./element.js";
import { isThenable } from "./thenable.js";

export interface RootRuntime {
  currentElement?: unknown;
  instances: Map<string, ComponentInstance>;
  instanceKeysByPrefix: Map<string, Set<string>>;
  activeInstanceKeys: Set<string> | undefined;
  activeProfilerPaths: Set<string> | undefined;
  mountedProfilerPaths: Set<string>;
  profilerBaseDurations: Map<string, number>;
  pendingProfilerCommits: PendingProfilerCommit[];
  pendingInsertionEffects: PendingEffect[];
  pendingImperativeHandleEffects: PendingEffect[];
  pendingLayoutEffects: PendingEffect[];
  pendingEffects: PendingEffect[];
  externalStoreChecks: ExternalStoreCheck[];
  portalContainers: Set<Element>;
  portalNodes: Map<Element, Set<Node>>;
  idCounter: number;
  identifierPrefix: string;
  idMode: "client" | "server";
  strictModeDepth: number;
  strictReplayDepth: number;
  strictMemoCapture: unknown[] | undefined;
  strictMemoCaptureByHook: Map<string, unknown> | undefined;
  strictMemoReplay: { values: readonly unknown[]; index: number } | undefined;
  strictMemoReplayByHook: ReadonlyMap<string, unknown> | undefined;
  profilerFlushDepth: number;
  effectFlushPhase: "insertion" | "imperative-handle" | "layout" | "normal" | undefined;
  externalStoreUpdate: boolean;
  renderPhaseUpdate: boolean;
  rerender(priority?: RenderPriority): void;
  beginRender(): void;
  endRender(committed?: boolean): void;
  flushEffects(): void;
  dispose(): void;
}

interface ComponentInstance {
  owner: unknown | undefined;
  path: string;
  hooks: HookSlot[];
  hookIndex: number;
  dirty: boolean;
  disposed?: boolean;
  contextDependencies?: Map<ReactCompatContextLike<unknown>, unknown>;
  devToolsHooks?: DevToolsHookValue[];
  devToolsHookTypes?: string[];
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

/** Cache scope that stores memoized cache() results and cancellation state. */
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
  | { kind: "state"; value: unknown; hostCommitValue?: unknown; textBinding?: ReactiveTextBinding }
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
  | { kind: "store"; value: unknown; hasMounted?: boolean; hostCommitValue?: unknown }
  | { kind: "ref"; value: { current: unknown } }
  | { kind: "memo"; value: unknown; deps?: readonly unknown[] }
  | { kind: "debug"; value: unknown }
  | {
      kind: "effect";
      effectKind: "insertion" | "imperative-handle" | "layout" | "normal";
      callback: EffectCallback;
      deps?: readonly unknown[];
      cleanup?: () => void;
      disposed?: boolean;
      mounted?: boolean;
      strictReplay?: boolean;
    };

interface HookRenderState {
  currentRuntime: RootRuntime | undefined;
  currentInstance: ComponentInstance | undefined;
  currentCacheScope: CacheScope | undefined;
  hostCommitDepth: number;
  queuedHostCommitRerenders: Set<RootRuntime>;
  queuedEffectFlushRerenders: Set<RootRuntime>;
}

const HOOK_RENDER_STATE_KEY = Symbol.for("modular.react.hook_render_state");
const hookRenderState =
  ((globalThis as typeof globalThis & Record<symbol, HookRenderState | undefined>)[
    HOOK_RENDER_STATE_KEY
  ] ??= {
    currentRuntime: undefined,
    currentInstance: undefined,
    currentCacheScope: undefined,
    hostCommitDepth: 0,
    queuedHostCommitRerenders: new Set<RootRuntime>(),
    queuedEffectFlushRerenders: new Set<RootRuntime>(),
  });
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
let automaticRerenderScheduled = false;
let effectFlushRerenderDepth = 0;
let hostCommitRerenderDepth = 0;
let strictMemoOwnerId = 0;
const strictMemoObjectOwnerIds = new WeakMap<object, number>();
const queuedTransitionRerenders = new Map<RootRuntime, TransitionContext>();
const queuedEventRerenders = new Set<RootRuntime>();
/** React version string matched by the compatibility layer. */
export const version = "19.2.6";

export interface ReactiveTextBinding {
  value: unknown;
  subscribers: Set<Text>;
}

const reactiveTextBindingsByNode = new WeakMap<Text, ReactiveTextBinding>();
const hydratedIdsByRuntime = new WeakMap<RootRuntime, Map<string, string>>();

/** Flushes React-compatible updates produced inside a test interaction. */
export function act<T>(callback: () => T): T extends PromiseLike<unknown> ? Promise<void> : void {
  const previousPriority = currentEventPriority;
  currentEventPriority = "discrete";
  eventBatchDepth += 1;
  let result: T;

  try {
    result = callback();
  } catch (error) {
    eventBatchDepth -= 1;
    currentEventPriority = previousPriority;
    if (eventBatchDepth === 0) {
      flushEventRerendersForPriority("discrete");
    }
    throw error;
  }

  const finishActScope = (): void => {
    eventBatchDepth -= 1;
    currentEventPriority = previousPriority;
    if (eventBatchDepth === 0) {
      flushEventRerendersForPriority("discrete");
    }
  };

  if (isThenable(result)) {
    return Promise.resolve(result).then(
      async () => {
        finishActScope();
        await flushActWorkAsync();
      },
      (error: unknown) => {
        finishActScope();
        throw error;
      },
    ) as T extends PromiseLike<unknown> ? Promise<void> : void;
  }

  finishActScope();
  flushActWork();
  return undefined as T extends PromiseLike<unknown>
    ? Promise<void>
    : void;
}

async function flushActWorkAsync(): Promise<void> {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    await Promise.resolve();
    flushActWork();
  }
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
    flushActWork();
  }
}

function flushActWork(): void {
  flushQueuedEventRerenders("sync");
  flushQueuedTransitionRerenders();
  flushHostCommitRerenders();
  flushEffectFlushRerenders();
}

/** Priority category used while batching an event callback. */
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
  portalNodes: Map<Element, Set<Node>>;
  pendingInsertionEffectsLength: number;
  pendingImperativeHandleEffectsLength: number;
  pendingLayoutEffectsLength: number;
  pendingEffectsLength: number;
  pendingProfilerCommitsLength: number;
  profilerBaseDurations: Map<string, number>;
  idCounter: number;
  identifierPrefix: string;
  idMode: "client" | "server";
  strictModeDepth: number;
  strictReplayDepth: number;
  strictMemoCapture: unknown[] | undefined;
  strictMemoCaptureByHook: Map<string, unknown> | undefined;
  strictMemoReplay: { values: readonly unknown[]; index: number } | undefined;
  strictMemoReplayByHook: ReadonlyMap<string, unknown> | undefined;
  profilerFlushDepth: number;
}

export function createRootRuntime(
  rerender: (priority?: RenderPriority) => void,
  options: RootRuntimeOptions = {},
): RootRuntime {
  return {
    instances: new Map(),
    instanceKeysByPrefix: new Map(),
    activeInstanceKeys: undefined,
    activeProfilerPaths: undefined,
    mountedProfilerPaths: new Set(),
    profilerBaseDurations: new Map(),
    pendingProfilerCommits: [],
    pendingInsertionEffects: [],
    pendingImperativeHandleEffects: [],
    pendingLayoutEffects: [],
    pendingEffects: [],
    externalStoreChecks: [],
    portalContainers: new Set(),
    portalNodes: new Map(),
    idCounter: 0,
    identifierPrefix: options.identifierPrefix ?? "",
    idMode: options.idMode ?? "client",
    strictModeDepth: 0,
    strictReplayDepth: 0,
    strictMemoCapture: undefined,
    strictMemoCaptureByHook: undefined,
    strictMemoReplay: undefined,
    strictMemoReplayByHook: undefined,
    profilerFlushDepth: 0,
    effectFlushPhase: undefined,
    externalStoreUpdate: false,
    renderPhaseUpdate: false,
    rerender,
    beginRender() {
      this.activeInstanceKeys = new Set();
      this.activeProfilerPaths = new Set();
      this.pendingProfilerCommits = [];
      this.pendingInsertionEffects = [];
      this.pendingImperativeHandleEffects = [];
      this.pendingLayoutEffects = [];
      this.pendingEffects = [];
      this.externalStoreChecks = [];
      this.renderPhaseUpdate = false;
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
      hookRenderState.currentRuntime = undefined;
      hookRenderState.currentInstance = undefined;
      if (committed) {
        flushProfilerCommits(this, profilerCommits);
      }
    },
    flushEffects() {
      this.profilerFlushDepth += 1;
      try {
        this.effectFlushPhase = "insertion";
        flushPendingEffects(this.pendingInsertionEffects);
        this.effectFlushPhase = "imperative-handle";
        flushPendingEffects(this.pendingImperativeHandleEffects);
        this.effectFlushPhase = "layout";
        const strictLayoutEffects = flushPendingEffects(this.pendingLayoutEffects);
        this.effectFlushPhase = "normal";
        const strictEffects = flushPendingEffects(this.pendingEffects);
        this.effectFlushPhase = undefined;
        const strictReplayEffects = [...strictLayoutEffects, ...strictEffects];
        cleanupStrictEffects(strictReplayEffects);
        replayStrictEffects(strictReplayEffects);
      } finally {
        this.effectFlushPhase = undefined;
        this.profilerFlushDepth -= 1;
        if (this.profilerFlushDepth === 0) {
          flushHostCommitRerenders();
          flushEffectFlushRerenders();
          this.externalStoreUpdate = false;
        }
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
      clearRuntimePortalNodes(this);
    },
  };
}

/** Creates an isolated cache scope for cache() and cacheSignal(). */
export function createCacheScope(): CacheScope {
  return {
    functionCaches: new WeakMap(),
    controller: new AbortController(),
    ownerStack: [],
  };
}

/** Clears a cache scope and aborts work tied to its previous signal. */
export function refreshCacheScope(scope: CacheScope): void {
  scope.controller.abort();
  scope.functionCaches = new WeakMap();
  scope.controller = new AbortController();
}

/** Runs a callback with a cache scope active for nested cache() calls. */
export function runWithCacheScope<T>(scope: CacheScope, callback: () => T): T {
  const previousScope = hookRenderState.currentCacheScope;
  const previousGlobalScope = getGlobalCacheScope();
  hookRenderState.currentCacheScope = scope;
  setGlobalCacheScope(scope);

  try {
    const result = callback();

    if (isThenable(result)) {
      return Promise.resolve(result).finally(() => {
        hookRenderState.currentCacheScope = previousScope;
        setGlobalCacheScope(previousGlobalScope);
      }) as T;
    }

    hookRenderState.currentCacheScope = previousScope;
    setGlobalCacheScope(previousGlobalScope);
    return result;
  } catch (error) {
    hookRenderState.currentCacheScope = previousScope;
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
    runtime.profilerFlushDepth > 0 || effectFlushRerenderDepth > 0
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
  owner?: unknown,
): T {
  const previousRuntime = hookRenderState.currentRuntime;
  const previousInstance = hookRenderState.currentInstance;
  let instance = runtime.instances.get(path);

  if (instance !== undefined && owner !== undefined && instance.owner !== owner) {
    cleanupInstance(instance);
    instance = undefined;
  }

  instance ??= {
    owner,
    path,
    hooks: [],
    hookIndex: 0,
    dirty: false,
    devToolsHookSuppressionDepth: 0,
  };
  instance.owner = owner;
  instance.path = path;
  runtime.instances.set(path, instance);
  indexInstanceKey(runtime, path);
  runtime.activeInstanceKeys?.add(path);
  instance.hookIndex = 0;
  instance.dirty = false;
  instance.disposed = false;
  delete instance.contextDependencies;
  if (hasInstalledDevToolsHook()) {
    instance.devToolsHooks = [];
    instance.devToolsHookTypes = [];
  } else {
    delete instance.devToolsHooks;
    delete instance.devToolsHookTypes;
  }
  instance.devToolsHookSuppressionDepth = 0;
  hookRenderState.currentRuntime = runtime;
  hookRenderState.currentInstance = instance;

  try {
    return withContextReadObserver((context, value) => {
      (instance.contextDependencies ??= new Map()).set(context, value);
    }, render);
  } finally {
    hookRenderState.currentRuntime = previousRuntime;
    hookRenderState.currentInstance = previousInstance;
  }
}

export function hasChangedContextDependency(
  runtime: RootRuntime,
  keys: readonly string[],
): boolean {
  for (const key of keys) {
    const dependencies = runtime.instances.get(key)?.contextDependencies;

    if (dependencies === undefined) {
      continue;
    }

    for (const [context, value] of dependencies) {
      if (!Object.is(readContextValue(context), value)) {
        return true;
      }
    }
  }

  return false;
}

export function hasContextDependency(
  runtime: RootRuntime,
  keys: readonly string[],
): boolean {
  return keys.some((key) => runtime.instances.get(key)?.contextDependencies !== undefined);
}

export function collectRuntimeInstanceKeys(runtime: RootRuntime, prefix: string): string[] {
  const keys = runtime.instanceKeysByPrefix.get(prefix);

  if (keys === undefined) {
    return [];
  }

  const activeKeys: string[] = [];

  for (const key of keys) {
    if (runtime.instances.has(key)) {
      activeKeys.push(key);
    }
  }

  return activeKeys;
}

export function getDevToolsHookState(
  runtime: RootRuntime,
  path: string,
): DevToolsHookState | undefined {
  const instance = runtime.instances.get(path);

  if (
    instance === undefined ||
    instance.devToolsHooks === undefined ||
    instance.devToolsHookTypes === undefined
  ) {
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

export function renderWithStrictModeMemoCapture<T>(
  runtime: RootRuntime,
  render: () => T,
): { result: T; memoValues: readonly unknown[]; memoValuesByHook: ReadonlyMap<string, unknown> } {
  const previousCapture = runtime.strictMemoCapture;
  const previousCaptureByHook = runtime.strictMemoCaptureByHook;
  runtime.strictMemoCapture = [];
  runtime.strictMemoCaptureByHook = new Map();

  try {
    const result = renderWithStrictMode(runtime, render);
    return {
      result,
      memoValues: runtime.strictMemoCapture,
      memoValuesByHook: runtime.strictMemoCaptureByHook,
    };
  } finally {
    runtime.strictMemoCapture = previousCapture;
    runtime.strictMemoCaptureByHook = previousCaptureByHook;
  }
}

export function renderStrictModeReplay<T>(
  runtime: RootRuntime,
  memoValues: readonly unknown[],
  memoValuesByHook: ReadonlyMap<string, unknown>,
  render: () => T,
): T {
  const previousReplay = runtime.strictMemoReplay;
  const previousReplayByHook = runtime.strictMemoReplayByHook;
  runtime.strictReplayDepth += 1;
  runtime.strictMemoReplay = { values: memoValues, index: 0 };
  runtime.strictMemoReplayByHook = memoValuesByHook;

  try {
    return render();
  } finally {
    runtime.strictMemoReplay = previousReplay;
    runtime.strictMemoReplayByHook = previousReplayByHook;
    runtime.strictReplayDepth -= 1;
  }
}

export function takeRuntimeSnapshot(runtime: RootRuntime): RuntimeSnapshot {
  return {
    instanceKeys: new Set(runtime.instances.keys()),
    portalContainers: new Set(runtime.portalContainers),
    portalNodes: clonePortalNodes(runtime.portalNodes),
    pendingInsertionEffectsLength: runtime.pendingInsertionEffects.length,
    pendingImperativeHandleEffectsLength: runtime.pendingImperativeHandleEffects.length,
    pendingLayoutEffectsLength: runtime.pendingLayoutEffects.length,
    pendingEffectsLength: runtime.pendingEffects.length,
    pendingProfilerCommitsLength: runtime.pendingProfilerCommits.length,
    profilerBaseDurations: new Map(runtime.profilerBaseDurations),
    idCounter: runtime.idCounter,
    identifierPrefix: runtime.identifierPrefix,
    idMode: runtime.idMode,
    strictModeDepth: runtime.strictModeDepth,
    strictReplayDepth: runtime.strictReplayDepth,
    strictMemoCapture: runtime.strictMemoCapture,
    strictMemoCaptureByHook: runtime.strictMemoCaptureByHook,
    strictMemoReplay: runtime.strictMemoReplay,
    strictMemoReplayByHook: runtime.strictMemoReplayByHook,
    profilerFlushDepth: runtime.profilerFlushDepth,
  };
}

export function restoreRuntimeSnapshot(
  runtime: RootRuntime,
  snapshot: RuntimeSnapshot,
): void {
  runtime.pendingInsertionEffects.length = snapshot.pendingInsertionEffectsLength;
  runtime.pendingImperativeHandleEffects.length = snapshot.pendingImperativeHandleEffectsLength;
  runtime.pendingLayoutEffects.length = snapshot.pendingLayoutEffectsLength;
  runtime.pendingEffects.length = snapshot.pendingEffectsLength;
  runtime.pendingProfilerCommits.length = snapshot.pendingProfilerCommitsLength;
  runtime.profilerBaseDurations = new Map(snapshot.profilerBaseDurations);
  runtime.idCounter = snapshot.idCounter;
  runtime.identifierPrefix = snapshot.identifierPrefix;
  runtime.idMode = snapshot.idMode;
  runtime.strictModeDepth = snapshot.strictModeDepth;
  runtime.strictReplayDepth = snapshot.strictReplayDepth;
  runtime.strictMemoCapture = snapshot.strictMemoCapture;
  runtime.strictMemoCaptureByHook = snapshot.strictMemoCaptureByHook;
  runtime.strictMemoReplay = snapshot.strictMemoReplay;
  runtime.strictMemoReplayByHook = snapshot.strictMemoReplayByHook;
  runtime.profilerFlushDepth = snapshot.profilerFlushDepth;

  for (const key of runtime.instances.keys()) {
    if (!snapshot.instanceKeys.has(key)) {
      runtime.instances.delete(key);
    }
  }

  clearRuntimePortalNodesExcept(runtime, snapshot.portalNodes);
  runtime.portalContainers.clear();
  for (const container of snapshot.portalContainers) {
    runtime.portalContainers.add(container);
  }
  runtime.portalNodes = clonePortalNodes(snapshot.portalNodes);
}

export function clearRuntimePortalNodes(runtime: RootRuntime): void {
  for (const [container, nodes] of runtime.portalNodes) {
    for (const node of nodes) {
      removeChildIfPresent(container, node);
    }
  }

  runtime.portalNodes.clear();
  runtime.portalContainers.clear();
}

function clearRuntimePortalNodesExcept(
  runtime: RootRuntime,
  preserved: Map<Element, Set<Node>>,
): void {
  for (const [container, nodes] of runtime.portalNodes) {
    const preservedNodes = preserved.get(container);

    for (const node of nodes) {
      if (preservedNodes?.has(node) !== true) {
        removeChildIfPresent(container, node);
      }
    }
  }
}

function clonePortalNodes(source: Map<Element, Set<Node>>): Map<Element, Set<Node>> {
  const clone = new Map<Element, Set<Node>>();

  for (const [container, nodes] of source) {
    clone.set(container, new Set(nodes));
  }

  return clone;
}

/** Stores component-local state and returns the current value with an updater. */
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
    const previousValue = slot.value;
    const nextValue =
      typeof value === "function"
        ? (value as (previous: T) => T)(slot.value as T)
        : value;

    if (Object.is(slot.value, nextValue)) {
      return;
    }

    if (hookRenderState.hostCommitDepth > 0 && !Object.hasOwn(slot, "hostCommitValue")) {
      slot.hostCommitValue = previousValue;
    }

    slot.value = nextValue;
    const canUseDirectTextBinding =
      hookRenderState.hostCommitDepth === 0 &&
      hookRenderState.currentRuntime !== runtime &&
      hookRenderState.currentInstance !== instance &&
      runtime.effectFlushPhase === undefined &&
      eventBatchDepth === 0 &&
      transitionDepth === 0 &&
      optionsAllowDirectTextBinding(value) &&
      updateDirectTextBinding(slot.textBinding, nextValue);

    if (canUseDirectTextBinding) {
      return;
    }

    if (hookRenderState.hostCommitDepth > 0) {
      updateHostCommitDirtyState(instance);
      hookRenderState.queuedHostCommitRerenders.add(runtime);
      return;
    }

    scheduleInstanceUpdate(runtime, instance, { deferSync: typeof value === "function" });
  };

  recordDevToolsHook("useState", {
    kind: "state",
    value: slot.value,
  });

  const result = [slot.value as T, setState] as [
    T,
    (value: T | ((previous: T) => T)) => void,
  ] & Record<PropertyKey, unknown>;
  result[REACTIVE_TEXT_BINDING_META] = getStateTextBinding(slot);
  return result;
}

export function subscribeReactiveTextBinding(binding: unknown, node: Text): void {
  if (!isReactiveTextBinding(binding)) {
    clearReactiveTextBinding(node);
    return;
  }

  const previous = reactiveTextBindingsByNode.get(node);

  if (previous !== undefined && previous !== binding) {
    previous.subscribers.delete(node);
  }

  reactiveTextBindingsByNode.set(node, binding);
  binding.subscribers.add(node);
}

function clearReactiveTextBinding(node: Text): void {
  const previous = reactiveTextBindingsByNode.get(node);

  if (previous === undefined) {
    return;
  }

  previous.subscribers.delete(node);
  reactiveTextBindingsByNode.delete(node);
}

function clearReactiveTextBindingSubscribers(binding: ReactiveTextBinding): void {
  for (const node of binding.subscribers) {
    if (reactiveTextBindingsByNode.get(node) === binding) {
      reactiveTextBindingsByNode.delete(node);
    }
  }
  binding.subscribers.clear();
}

function getStateTextBinding(slot: Extract<HookSlot, { kind: "state" }>): ReactiveTextBinding {
  slot.textBinding ??= {
    value: slot.value,
    subscribers: new Set(),
  };
  slot.textBinding.value = slot.value;
  return slot.textBinding;
}

function optionsAllowDirectTextBinding(value: unknown): boolean {
  return typeof value !== "function";
}

function updateDirectTextBinding(binding: ReactiveTextBinding | undefined, value: unknown): boolean {
  if (binding === undefined || binding.subscribers.size === 0) {
    return false;
  }

  let updated = false;
  const nextText = String(value);

  for (const node of binding.subscribers) {
    if (node.parentNode === null) {
      binding.subscribers.delete(node);
      reactiveTextBindingsByNode.delete(node);
      continue;
    }

    if (node.data !== nextText) {
      node.data = nextText;
    }
    updated = true;
  }

  binding.value = value;
  return updated;
}

function isReactiveTextBinding(value: unknown): value is ReactiveTextBinding {
  return (
    typeof value === "object" &&
    value !== null &&
    "subscribers" in value &&
    (value as { subscribers?: unknown }).subscribers instanceof Set
  );
}

/** Stores reducer-managed component state and returns the current state with a dispatch function. */
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
  const stateRef = runWithoutDevToolsHookTracking(() => useRef(state));
  const dispatchRef = runWithoutDevToolsHookTracking(() =>
    useRef<((action: TAction) => void) | undefined>(
      undefined,
    )
  );
  reducerRef.current = reducer;
  stateRef.current = state;

  if (dispatchRef.current === undefined) {
    dispatchRef.current = (action: TAction): void => {
      const nextState = reducerRef.current(stateRef.current, action);
      stateRef.current = nextState;
      setState(nextState);
    };
  }

  recordDevToolsHook("useReducer", {
    kind: "reducer",
    value: state,
  });

  return [state, dispatchRef.current];
}

/** Returns a stable mutable ref object for the component instance. */
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

/** Returns a stable id string that matches server and client rendering. */
export function useId(): string {
  const runtime = requireRuntime();
  const instance = requireInstance();
  const idSlotKey = `${instance.path}:${instance.hookIndex}`;
  const idRef = runWithoutDevToolsHookTracking(() =>
    useRef<string | undefined>(undefined)
  );

  if (idRef.current === undefined) {
    const hydratedId = runtime.idMode === "client"
      ? hydratedIdsByRuntime.get(runtime)?.get(idSlotKey)
      : undefined;

    if (hydratedId !== undefined) {
      idRef.current = hydratedId;
    } else {
      const mode = runtime.idMode === "server" ? "R" : "r";
      idRef.current = `_${runtime.identifierPrefix}${mode}_${runtime.idCounter}_`;
      runtime.idCounter += 1;

      if (runtime.idMode === "server") {
        const hydratedIds = hydratedIdsByRuntime.get(runtime) ?? new Map<string, string>();
        hydratedIds.set(idSlotKey, idRef.current);
        hydratedIdsByRuntime.set(runtime, hydratedIds);
      }
    }
  }

  recordDevToolsHook("useId", {
    kind: "id",
    value: idRef.current,
  });

  return idRef.current;
}

/** Assigns a custom imperative handle to a forwarded ref. */
export function useImperativeHandle<T>(
  ref: unknown,
  create: () => T,
  deps?: readonly unknown[],
): void {
  runWithoutDevToolsHookTracking(() =>
    useEffectImpl("imperative-handle", () => {
      const handle = create();
      assignRef(ref, handle);
      return () => {
        assignRef(ref, null);
      };
    }, deps === undefined ? undefined : [ref, ...deps])
  );
  recordDevToolsHook("useImperativeHandle", deps === undefined
    ? { kind: "imperative-handle" }
    : { kind: "imperative-handle", deps });
}

/** Memoizes a computed value until its dependency list changes. */
export function useMemo<T>(factory: () => T, deps?: readonly unknown[]): T {
  const runtime = requireRuntime();
  const instance = requireInstance();
  const index = instance.hookIndex;
  instance.hookIndex += 1;

  let slot = instance.hooks[index];

  if (slot !== undefined && slot.kind !== "memo") {
    throw new Error("Hook order changed between renders.");
  }

  let value: unknown;
  const shouldRecompute =
    slot === undefined ||
    deps === undefined ||
    slot.deps === undefined ||
    !areHookInputsEqual(deps, slot.deps);

  if (runtime.strictReplayDepth > 0) {
    const replayValue = factory();
    if (slot === undefined) {
      slot =
        deps === undefined
          ? { kind: "memo", value: replayValue }
          : { kind: "memo", value: replayValue, deps };
      instance.hooks[index] = slot;
    }
    const hookKey = getStrictMemoHookKey(instance, index);
    const replayByHook = runtime.strictMemoReplayByHook;
    const replay = runtime.strictMemoReplay;
    value = replayByHook?.has(hookKey) === true
      ? replayByHook.get(hookKey)
      : replay === undefined || replay.index >= replay.values.length
        ? slot.value
        : replay.values[replay.index++];
  } else if (shouldRecompute) {
    value = factory();
    slot =
      deps === undefined
        ? { kind: "memo", value }
        : { kind: "memo", value, deps };
    instance.hooks[index] = slot;
  } else {
    value = slot!.value;
  }

  if (runtime.strictModeDepth > 0 && runtime.strictReplayDepth === 0) {
    runtime.strictMemoCapture?.push(value);
    runtime.strictMemoCaptureByHook?.set(getStrictMemoHookKey(instance, index), value);
  }

  const memoSlot = slot;
  if (memoSlot === undefined) {
    throw new Error("Hook order changed between renders.");
  }

  recordDevToolsHook("useMemo", memoSlot.deps === undefined
    ? { kind: "memo", value }
    : { kind: "memo", value, deps: memoSlot.deps });

  return value as T;
}

function getStrictMemoHookKey(
  instance: ComponentInstance,
  index: number,
): string {
  return `${instance.path}:${getStrictMemoOwnerKey(instance.owner)}:${index}`;
}

export function __getStrictMemoOwnerKeyForTesting(owner: unknown): string {
  return getStrictMemoOwnerKey(owner);
}

function getStrictMemoOwnerKey(owner: unknown): string {
  if ((typeof owner === "object" && owner !== null) || typeof owner === "function") {
    const objectOwner = owner as object;
    let ownerId = strictMemoObjectOwnerIds.get(objectOwner);
    if (ownerId === undefined) {
      ownerId = strictMemoOwnerId++;
      strictMemoObjectOwnerIds.set(objectOwner, ownerId);
    }
    return `o:${ownerId}`;
  }

  if (typeof owner === "symbol") {
    const globalKey = Symbol.keyFor(owner);
    return globalKey === undefined
      ? `p:symbol:${String(owner)}`
      : `p:symbol-global:${globalKey}`;
  }

  return `p:${typeof owner}:${String(owner)}`;
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
  const instance = hookRenderState.currentInstance;

  if (
    instance === undefined ||
    instance.devToolsHookSuppressionDepth > 0 ||
    instance.devToolsHooks === undefined ||
    instance.devToolsHookTypes === undefined
  ) {
    return;
  }

  instance.devToolsHookTypes.push(type);
  instance.devToolsHooks.push(value);
}

function hasInstalledDevToolsHook(): boolean {
  return typeof (globalThis as {
    __REACT_DEVTOOLS_GLOBAL_HOOK__?: { inject?: unknown } | undefined;
  }).__REACT_DEVTOOLS_GLOBAL_HOOK__?.inject === "function";
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

/** Memoizes a callback reference until its dependency list changes. */
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

/** Records a value for React DevTools hook inspection. */
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

/** Creates a stable event callback that always calls the latest implementation. */
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

/** Runs an effect after the rendered output has been committed. */
export function useEffect(
  callback: EffectCallback,
  deps?: readonly unknown[],
): void {
  useEffectImpl("normal", callback, deps);
  recordDevToolsHook("useEffect", deps === undefined
    ? { kind: "effect", effectKind: "normal" }
    : { kind: "effect", effectKind: "normal", deps });
}

/** Runs an insertion effect before layout effects are flushed. */
export function useInsertionEffect(
  callback: EffectCallback,
  deps?: readonly unknown[],
): void {
  useEffectImpl("insertion", callback, deps);
  recordDevToolsHook("useInsertionEffect", deps === undefined
    ? { kind: "effect", effectKind: "insertion" }
    : { kind: "effect", effectKind: "insertion", deps });
}

/** Runs a layout effect after DOM mutations and before normal effects. */
export function useLayoutEffect(
  callback: EffectCallback,
  deps?: readonly unknown[],
): void {
  useEffectImpl("layout", callback, deps);
  recordDevToolsHook("useLayoutEffect", deps === undefined
    ? { kind: "effect", effectKind: "layout" }
    : { kind: "effect", effectKind: "layout", deps });
}

/** Subscribes to an external store with snapshot checks for consistent rendering. */
export function useSyncExternalStore<T>(
  subscribe: (listener: () => void) => () => void,
  getSnapshot: () => T,
  getServerSnapshot?: () => T,
): T {
  const runtime = requireRuntime();
  const instance = requireInstance();
  const index = instance.hookIndex;
  instance.hookIndex += 1;
  let slot = instance.hooks[index];

  if (slot === undefined) {
    slot = {
      kind: "store",
      value: runtime.idMode === "server" && getServerSnapshot !== undefined
        ? getServerSnapshot()
        : getSnapshot(),
    };
    instance.hooks[index] = slot;
  }

  if (slot.kind !== "store") {
    throw new Error("Hook order changed between renders.");
  }

  const isHydrationMount =
    runtime.idMode === "server" && slot.hasMounted !== true && getServerSnapshot !== undefined;
  const currentSnapshot = isHydrationMount ? slot.value as T : getSnapshot();

  if (!Object.is(slot.value, currentSnapshot)) {
    slot.value = currentSnapshot;
  }

  if (!isHydrationMount) {
    recordExternalStoreCheck(getSnapshot, currentSnapshot);
  }

  runWithoutDevToolsHookTracking(() => useEffect(() => {
    const checkForUpdates = (): void => {
      if (instance.disposed === true) {
        return;
      }

      const nextSnapshot = getSnapshot();

      if (!Object.is(slot.value, nextSnapshot)) {
        if (hookRenderState.hostCommitDepth > 0 && !Object.hasOwn(slot, "hostCommitValue")) {
          slot.hostCommitValue = slot.value;
        }
        slot.value = nextSnapshot;
        runtime.externalStoreUpdate = true;
        if (hookRenderState.hostCommitDepth > 0) {
          updateHostCommitDirtyState(instance);
          hookRenderState.queuedHostCommitRerenders.add(runtime);
          return;
        }
        instance.dirty = true;
        if (runtime.profilerFlushDepth > 0) {
          hookRenderState.queuedEffectFlushRerenders.add(runtime);
          return;
        }
        if (eventBatchDepth > 0) {
          queueEventRerender(runtime);
          return;
        }
        runtime.rerender("sync");
      }
    };

    if (slot.hasMounted !== true) {
      checkForUpdates();
    }
    const unsubscribe = subscribe(checkForUpdates);
    slot.hasMounted = true;
    return () => {
      unsubscribe();
    };
  }, [subscribe, getSnapshot]));

  recordDevToolsHook("useSyncExternalStore", {
    kind: "store",
    value: slot.value,
  });

  return slot.value as T;
}

/** Tracks state and pending status for an action that receives the previous state. */
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

/** Returns an optimistic state value and dispatcher layered on top of a base state. */
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

/** Reads a context-like value or suspends on a thenable until it resolves. */
export function use<T>(usable: PromiseLike<T> | unknown): T {
  if (isReactCompatContext(usable)) {
    return useContext(usable) as T;
  }

  if (isThenable(usable)) {
    return readThenable(usable as PromiseLike<T>);
  }

  return usable as T;
}

/** Memoizes a function within the currently active cache scope. */
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

/** Returns the abort signal for the currently active cache scope. */
export function cacheSignal(): AbortSignal | null {
  return getCurrentCacheScope()?.controller.signal ?? null;
}

/** Returns the current owner stack captured for cache diagnostics. */
export function captureOwnerStack(): string | null {
  const stack = getCurrentCacheScope()?.ownerStack ?? emptyCacheOwnerStack;
  return stack.length === 0 ? null : stack.join("\n");
}

/** Returns a callback placeholder for refreshing the current cache boundary. */
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

/** Callback body scheduled as transition work. */
export type TransitionScope = () => void;
/** Function that schedules a transition scope. */
export type StartTransition = (scope: TransitionScope) => void;

/** Schedules non-urgent updates produced inside a transition scope. */
export function startTransition(scope: TransitionScope): void {
  const context = {
    syncVersion,
    transitionVersion: ++transitionVersion,
  };

  runTransitionScope(scope, context);
}

/** Runs a callback while updates are batched at the requested event priority. */
export function runWithEventPriority<T>(
  priority: EventPriority,
  callback: () => T,
  deferFlush?: (flush: () => void) => void,
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
      const flush = () => {
        flushEventRerendersForPriority(priority);
      };
      if (deferFlush === undefined) {
        flush();
      } else {
        deferFlush(flush);
      }
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
    // Reactive-core cell/computed updates flush in a scheduled microtask by
    // default; drain them here so flushSync guarantees committed DOM on return
    // for compiled (cell-driven) components as well as compat hook state.
    flushPendingComputed();
    flushQueuedComputations();
    flushQueuedEventRerenders();
    return value;
  } finally {
    eventBatchDepth = previousEventBatchDepth;
    currentEventPriority = previousEventPriority;
  }
}

export function runWithHostCommit<T>(callback: () => T): T {
  hookRenderState.hostCommitDepth += 1;
  try {
    return callback();
  } finally {
    hookRenderState.hostCommitDepth -= 1;
  }
}

/** Returns transition pending state and a function that starts transition work. */
export function useTransition(): [boolean, StartTransition] {
  const instance = requireInstance();
  const [pending, setPending] = runWithoutDevToolsHookTracking(() => useState(false));
  const startTransitionWithPending: StartTransition = (scope) => {
    setPending(true);
    const context = {
      syncVersion,
      transitionVersion: ++transitionVersion,
    };
    scheduleCallback("low", () => {
      if (instance.disposed === true) {
        return;
      }

      if (!isTransitionContextCurrent(context)) {
        setPending(false);
        return;
      }

      runTransitionScope(() => {
        scope();
        if (instance.disposed === true) {
          return;
        }
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

/** Defers a value update so urgent renders can commit first. */
export function useDeferredValue<T>(value: T, initialValue?: T): T {
  const [deferredValue, setDeferredValue] = runWithoutDevToolsHookTracking(() =>
    useState(arguments.length > 1 ? (initialValue as T) : value)
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

function queueAutomaticRerender(runtime: RootRuntime): void {
  queueEventRerender(runtime);

  if (automaticRerenderScheduled) {
    return;
  }

  automaticRerenderScheduled = true;
  queueMicrotask(() => {
    automaticRerenderScheduled = false;
    flushQueuedEventRerenders("sync");
  });
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
  effectKind: "insertion" | "imperative-handle" | "layout" | "normal",
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
    slot.mounted !== true ||
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
    (runtime.strictModeDepth > 0 || runtime.strictReplayDepth > 0) &&
    effectKind !== "insertion" &&
    effectKind !== "imperative-handle";

  if (shouldRun) {
    const queue =
      effectKind === "insertion"
        ? runtime.pendingInsertionEffects
        : effectKind === "imperative-handle"
        ? runtime.pendingImperativeHandleEffects
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
  hookRenderState.currentRuntime?.externalStoreChecks.push({ getSnapshot, value });
}

function flushPendingEffects(queue: PendingEffect[]): PendingEffect[] {
  const pending = queue.splice(0);
  const strictReplay: PendingEffect[] = [];
  const runnable: { slot: Extract<HookSlot, { kind: "effect" }>; shouldReplay: boolean }[] = [];

  for (const { slot } of pending) {
    if (slot.disposed === true) {
      continue;
    }

    const shouldReplay = slot.strictReplay === true && slot.cleanup === undefined;
    slot.cleanup?.();
    runnable.push({ slot, shouldReplay });
  }

  for (const { slot, shouldReplay } of runnable) {
    if (slot.disposed === true) {
      continue;
    }

    const cleanup = slot.callback();

    if (typeof cleanup === "function") {
      slot.cleanup = cleanup;
    } else {
      delete slot.cleanup;
    }
    slot.mounted = true;

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

export function scheduleRuntimeRerender(
  runtime: RootRuntime,
  options: { deferSync?: boolean } = {},
): void {
  if (transitionDepth === 0) {
    syncVersion += 1;
    if (hookRenderState.hostCommitDepth > 0) {
      hookRenderState.queuedHostCommitRerenders.add(runtime);
      return;
    }
    if (runtime.effectFlushPhase !== undefined) {
      hookRenderState.queuedEffectFlushRerenders.add(runtime);
      return;
    }
    if (eventBatchDepth > 0) {
      queueEventRerender(runtime);
      return;
    }
    if (options.deferSync === true) {
      queueAutomaticRerender(runtime);
      return;
    }
    runtime.rerender("sync");
    return;
  }

  if (currentTransitionContext !== undefined) {
    queueTransitionRerender(runtime, currentTransitionContext);
  }
}

function scheduleInstanceUpdate(
  runtime: RootRuntime,
  instance: ComponentInstance,
  options: { deferSync?: boolean } = {},
): void {
  if (instance.disposed === true) {
    return;
  }

  instance.dirty = true;
  if (
    hookRenderState.currentRuntime === runtime &&
    hookRenderState.currentInstance === instance
  ) {
    runtime.renderPhaseUpdate = true;
    return;
  }

  scheduleRuntimeRerender(runtime, options);
}

function flushHostCommitRerenders(): void {
  if (
    hostCommitRerenderDepth > 0 ||
    hookRenderState.hostCommitDepth > 0 ||
    hookRenderState.queuedHostCommitRerenders.size === 0
  ) {
    return;
  }

  hostCommitRerenderDepth += 1;
  try {
    for (
      let attempt = 0;
      attempt < 3 && hookRenderState.queuedHostCommitRerenders.size > 0;
      attempt += 1
    ) {
      const runtimes = [...hookRenderState.queuedHostCommitRerenders];
      hookRenderState.queuedHostCommitRerenders.clear();
      for (const runtime of runtimes) {
        const hasDirtyInstance = Array.from(runtime.instances.values()).some(
          (instance) => instance.dirty,
        );
        clearHostCommitStateBaselines(runtime);

        if (hasDirtyInstance) {
          runtime.rerender("sync");
        }
      }
    }
    hookRenderState.queuedHostCommitRerenders.clear();
  } finally {
    hostCommitRerenderDepth -= 1;
  }
}

function flushEffectFlushRerenders(): void {
  if (
    effectFlushRerenderDepth > 0 ||
    hookRenderState.queuedEffectFlushRerenders.size === 0
  ) {
    return;
  }

  effectFlushRerenderDepth += 1;
  try {
    for (
      let attempt = 0;
      attempt < 3 && hookRenderState.queuedEffectFlushRerenders.size > 0;
      attempt += 1
    ) {
      const runtimes = [...hookRenderState.queuedEffectFlushRerenders];
      hookRenderState.queuedEffectFlushRerenders.clear();
      for (const runtime of runtimes) {
        const hasDirtyInstance = Array.from(runtime.instances.values()).some(
          (instance) => instance.dirty,
        );

        if (hasDirtyInstance) {
          runtime.rerender("sync");
        }
      }
    }
    hookRenderState.queuedEffectFlushRerenders.clear();
  } finally {
    effectFlushRerenderDepth -= 1;
  }
}

function updateHostCommitDirtyState(
  instance: ComponentInstance,
): void {
  instance.dirty = instance.hooks.some(
    (slot) =>
      (slot.kind === "state" || slot.kind === "store") &&
      Object.hasOwn(slot, "hostCommitValue") &&
      !Object.is(slot.hostCommitValue, slot.value),
  );
}

function clearHostCommitStateBaselines(runtime: RootRuntime): void {
  for (const instance of runtime.instances.values()) {
    for (const slot of instance.hooks) {
      if (slot.kind === "state" || slot.kind === "store") {
        delete slot.hostCommitValue;
      }
    }
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
  return hookRenderState.currentCacheScope ?? getGlobalCacheScope();
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
      removeInstanceKeyFromIndex(runtime, key);
    }
  }
}

function indexInstanceKey(runtime: RootRuntime, key: string): void {
  forEachInstanceKeyPrefix(key, (prefix) => {
    let keys = runtime.instanceKeysByPrefix.get(prefix);

    if (keys === undefined) {
      keys = new Set();
      runtime.instanceKeysByPrefix.set(prefix, keys);
    }

    keys.add(key);
  });
}

function removeInstanceKeyFromIndex(runtime: RootRuntime, key: string): void {
  forEachInstanceKeyPrefix(key, (prefix) => {
    const keys = runtime.instanceKeysByPrefix.get(prefix);

    if (keys === undefined) {
      return;
    }

    keys.delete(key);

    if (keys.size === 0) {
      runtime.instanceKeysByPrefix.delete(prefix);
    }
  });
}

function forEachInstanceKeyPrefix(
  key: string,
  callback: (prefix: string) => void,
): void {
  let start = 0;

  while (start < key.length) {
    const next = key.indexOf(".", start);

    if (next === -1) {
      break;
    }

    callback(key.slice(0, next));
    start = next + 1;
  }

  callback(key);
}

function cleanupInstance(instance: ComponentInstance): void {
  instance.disposed = true;
  for (const slot of instance.hooks) {
    if (slot?.kind === "effect") {
      slot.disposed = true;
      slot.mounted = false;
      slot.cleanup?.();
      delete slot.cleanup;
    } else if (slot?.kind === "state" && slot.textBinding !== undefined) {
      clearReactiveTextBindingSubscribers(slot.textBinding);
    }
  }
}

function requireRuntime(): RootRuntime {
  if (hookRenderState.currentRuntime === undefined) {
    throw new Error("Hooks can only be called while rendering.");
  }

  return hookRenderState.currentRuntime;
}

function requireInstance(): ComponentInstance {
  if (hookRenderState.currentInstance === undefined) {
    throw new Error("Hooks can only be called while rendering.");
  }

  return hookRenderState.currentInstance;
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
