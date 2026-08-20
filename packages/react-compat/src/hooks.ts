import {
  flushPendingComputed,
  flushQueuedComputations,
  notifySubscribers,
  trackSource,
  withCleanupScope as withReactiveCleanupScope,
  type Source,
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
import { REACTIVE_STATE_BINDING_META, REACTIVE_TEXT_BINDING_META } from "./element.js";
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
  effectFlushPhase:
    | "insertion"
    | "imperative-handle"
    | "layout"
    | "normal"
    | "strict-replay"
    | undefined;
  externalStoreUpdate: boolean;
  renderPhaseUpdate: boolean;
  rerender(priority?: RenderPriority): void;
  beginRender(priority?: RenderPriority): void;
  prepareInactiveMutationEffectCleanups(): void;
  reportMutationEffectErrors(errors: readonly unknown[]): void;
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
  nonStateDirty: boolean;
  disposed?: boolean;
  contextDependencies?: Map<ReactCompatContextLike<unknown>, unknown>;
  devToolsHooks?: DevToolsHookValue[];
  devToolsHookTypes?: string[];
  devToolsHookSuppressionDepth: number;
  committedReactiveCleanups?: Set<() => void>;
  pendingReactiveCleanups?: Set<() => void>;
  transitionListeners?: Map<TransitionContext, () => boolean>;
}

/** Effect callback that may return a cleanup function. */
export type EffectCallback = () => void | (() => void);
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
  instancePath: string;
  order: number;
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

interface PreparedMutationEffectState {
  instance: ComponentInstance;
  slots: Array<{
    slot: Extract<HookSlot, { kind: "effect" }>;
    mounted: boolean | undefined;
    cleanupRan: boolean;
  }>;
}

interface StateUpdate {
  action: unknown;
  lane: "sync" | "transition" | "replay";
}

interface StateRenderDraft {
  instance: ComponentInstance;
  slot: Extract<HookSlot, { kind: "state" }>;
  value: unknown;
  baseState: unknown;
  remainingUpdates: StateUpdate[];
  processedUpdateCount: number;
}

interface OptimisticUpdate {
  payload: unknown;
  context?: TransitionContext;
}

interface ActionStateDispatch {
  payload: unknown;
  action: (previousState: unknown, payload: unknown) => unknown;
  context?: TransitionContext;
  completed: boolean;
}

type ThenFunction = (
  this: unknown,
  onFulfilled: (value: unknown) => void,
  onRejected: (reason: unknown) => void,
) => unknown;

interface OptimisticRenderDraft {
  instance: ComponentInstance;
  slot: Extract<HookSlot, { kind: "optimistic" }>;
  baseState: unknown;
  optimisticState: unknown;
  remainingUpdates: OptimisticUpdate[];
  processedUpdateCount: number;
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
  | {
      kind: "state";
      value: unknown;
      baseState?: unknown;
      updates?: StateUpdate[];
      dispatch?: (value: unknown) => void;
      hostCommitValue?: unknown;
      textBinding?: ReactiveTextBinding;
      stateBinding?: ReactiveStateBinding;
    }
  | {
      kind: "action-state";
      state: unknown;
      pendingCount: number;
      action: (previousState: unknown, payload: unknown) => unknown;
      dispatch?: (payload: unknown) => void;
      error?: unknown;
      queue: ActionStateDispatch[];
      running: boolean;
    }
  | {
      kind: "optimistic";
      baseState: unknown;
      optimisticState: unknown;
      updates: OptimisticUpdate[];
      update: (state: unknown, payload: unknown) => unknown;
      dispatch?: (payload: unknown) => void;
    }
  | {
      kind: "store";
      value: unknown;
      getSnapshot?: () => unknown;
      hasMounted?: boolean;
      hostCommitValue?: unknown;
    }
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

interface PendingInstanceContext {
  runtime: RootRuntime;
  path: string;
  owner: unknown;
  existing: ComponentInstance | undefined;
}

interface HookRenderState {
  currentRuntime: RootRuntime | undefined;
  currentInstance: ComponentInstance | undefined;
  // Deferred instance for the component currently rendering. The instance is
  // only materialized (created, registered, prefix-indexed) when a hook or a
  // context read first needs it, so components with no hooks/context (e.g. a
  // pure host-rendering memo row) pay none of that per-render cost.
  pendingInstance: PendingInstanceContext | undefined;
  currentCacheScope: CacheScope | undefined;
  hostCommitDepth: number;
  queuedHostCommitRerenders: Set<RootRuntime>;
  queuedEffectFlushRerenders: Set<RootRuntime>;
}

const HOOK_RENDER_STATE_KEY = Symbol.for("modular.react.hook_render_state");
const hookRenderState = ((
  globalThis as typeof globalThis & Record<symbol, HookRenderState | undefined>
)[HOOK_RENDER_STATE_KEY] ??= {
  currentRuntime: undefined,
  currentInstance: undefined,
  pendingInstance: undefined,
  currentCacheScope: undefined,
  hostCommitDepth: 0,
  queuedHostCommitRerenders: new Set<RootRuntime>(),
  queuedEffectFlushRerenders: new Set<RootRuntime>(),
});
const CACHE_SCOPE_SYMBOL = Symbol.for("modular.react.cache_scope");
const NO_TRANSITION_ERROR = Symbol("mreact.no-transition-error");
let cacheScopeStorage = createCacheScopeStorage();
let fallbackAsyncCacheScopeActive = false;
const emptyCacheOwnerStack: string[] = [];
let syncVersion = 0;
let transitionVersion = 0;
let globalClientIdCounter = 0;
let transitionDepth = 0;
let currentTransitionContext: TransitionContext | undefined;
let currentCommitTransitionContext: TransitionContext | undefined;
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
const queuedForcedSyncRerenders = new Map<RootRuntime, TransitionContext | undefined>();
const SYNC_STATE_DISPATCH = Symbol("mreact.sync-state-dispatch");
type InternalStateDispatch = ((value: unknown) => void) & {
  [SYNC_STATE_DISPATCH]: (value: unknown) => void;
};
const renderPriorities = new WeakMap<RootRuntime, RenderPriority>();
const stateRenderDrafts = new WeakMap<
  RootRuntime,
  Map<Extract<HookSlot, { kind: "state" }>, StateRenderDraft>
>();
const optimisticRenderDrafts = new WeakMap<
  RootRuntime,
  Map<Extract<HookSlot, { kind: "optimistic" }>, OptimisticRenderDraft>
>();
/** React version string matched by the compatibility layer. */
export const version = "19.2.6";

export interface ReactiveTextBinding {
  value: unknown;
  subscribers: Set<Text>;
}

export interface ReactiveStateBinding {
  get(): unknown;
  source: Source;
  value: unknown;
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
  return undefined as T extends PromiseLike<unknown> ? Promise<void> : void;
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
  pendingTasks: number;
  scopeClosed: boolean;
  settled: boolean;
  optimisticTargets: Map<
    Extract<HookSlot, { kind: "optimistic" }>,
    { runtime: RootRuntime; instance: ComponentInstance }
  >;
  settlementListeners: Set<() => boolean>;
  rejection?: unknown;
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
  let preparedInactiveInstances: Array<[string, ComponentInstance]> | undefined;
  let preparedMutationEffectStates: PreparedMutationEffectState[] | undefined;
  let preparedMutationEffectErrorStart: number | undefined;
  const pendingMutationEffectErrors: unknown[] = [];

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
    beginRender(priority = "sync") {
      renderPriorities.set(this, priority);
      stateRenderDrafts.set(this, new Map());
      this.activeInstanceKeys = new Set();
      this.activeProfilerPaths = new Set();
      this.pendingProfilerCommits = [];
      this.pendingInsertionEffects = [];
      this.pendingImperativeHandleEffects = [];
      this.pendingLayoutEffects = [];
      this.pendingEffects = [];
      this.externalStoreChecks = [];
      this.renderPhaseUpdate = false;
      preparedInactiveInstances = undefined;
      preparedMutationEffectStates = undefined;
      preparedMutationEffectErrorStart = undefined;
    },
    prepareInactiveMutationEffectCleanups() {
      preparedInactiveInstances = collectInactiveInstances(this);
      preparedMutationEffectStates = [];
      preparedMutationEffectErrorStart = pendingMutationEffectErrors.length;

      for (const [, instance] of preparedInactiveInstances) {
        const state: PreparedMutationEffectState = {
          instance,
          slots: [],
        };
        preparedMutationEffectStates.push(state);
        instance.disposed = true;
        for (const slot of instance.hooks) {
          if (
            slot?.kind !== "effect" ||
            (slot.effectKind !== "imperative-handle" && slot.effectKind !== "layout")
          ) {
            continue;
          }

          const cleanup = slot.cleanup;
          state.slots.push({
            slot,
            mounted: slot.mounted,
            cleanupRan: cleanup !== undefined,
          });
          slot.disposed = true;
          slot.mounted = false;
          delete slot.cleanup;
          try {
            cleanup?.();
          } catch (error) {
            pendingMutationEffectErrors.push(error);
          }
        }
      }
    },
    reportMutationEffectErrors(errors) {
      pendingMutationEffectErrors.push(...errors);
    },
    endRender(committed = true) {
      const shouldFlushStateBindings = finishStateRender(this, committed);
      finishOptimisticRender(this, committed);
      optimisticRenderDrafts.get(this)?.clear();
      const profilerCommits = committed ? this.pendingProfilerCommits.splice(0) : [];
      const activeProfilerPaths = this.activeProfilerPaths;
      if (committed) {
        commitReactiveCleanups(this);
        cleanupInactiveInstances(this, preparedInactiveInstances);
        this.mountedProfilerPaths =
          activeProfilerPaths === undefined ? new Set() : new Set(activeProfilerPaths);
      } else {
        restorePreparedMutationEffectStates(
          preparedMutationEffectStates,
          pendingMutationEffectErrors,
          preparedMutationEffectErrorStart,
        );
        discardPendingReactiveCleanups(this);
        this.pendingProfilerCommits = [];
      }
      preparedInactiveInstances = undefined;
      preparedMutationEffectStates = undefined;
      preparedMutationEffectErrorStart = undefined;
      this.activeInstanceKeys = undefined;
      this.activeProfilerPaths = undefined;
      hookRenderState.currentRuntime = undefined;
      hookRenderState.currentInstance = undefined;
      renderPriorities.delete(this);
      stateRenderDrafts.delete(this);
      if (committed && shouldFlushStateBindings) {
        try {
          flushQueuedComputations();
        } catch (error) {
          pendingMutationEffectErrors.push(error);
        }
      }
      if (committed) {
        flushProfilerCommits(this, profilerCommits);
      }
    },
    flushEffects() {
      const effectErrors = pendingMutationEffectErrors.splice(0);
      const reportEffectError = (error: unknown): void => {
        effectErrors.push(error);
      };
      this.profilerFlushDepth += 1;
      try {
        this.effectFlushPhase = "insertion";
        flushPendingEffects(this.pendingInsertionEffects, reportEffectError);
        this.effectFlushPhase = "imperative-handle";
        flushPendingEffects(this.pendingImperativeHandleEffects, reportEffectError);
        this.effectFlushPhase = "layout";
        const strictLayoutEffects = flushPendingEffects(
          this.pendingLayoutEffects,
          reportEffectError,
        );
        if (flushHostCommitRerenders()) {
          dedupePendingEffects(this.pendingEffects);
        }
        this.effectFlushPhase = "normal";
        const strictEffects = flushPendingEffects(this.pendingEffects, reportEffectError);
        this.effectFlushPhase = "strict-replay";
        const strictReplayEffects = [...strictLayoutEffects, ...strictEffects];
        cleanupStrictEffects(strictReplayEffects, reportEffectError);
        replayStrictEffects(strictReplayEffects, reportEffectError);
        this.effectFlushPhase = undefined;

        if (effectErrors.length === 1) {
          throw effectErrors[0];
        }
        if (effectErrors.length > 1) {
          throw new AggregateError(
            effectErrors,
            "Multiple errors occurred while flushing effects.",
          );
        }
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

function disposeRootCleanups(cleanups: Set<() => void> | undefined): void {
  if (cleanups === undefined) return;
  let firstError: unknown;
  for (const dispose of cleanups) {
    try {
      dispose();
    } catch (error) {
      firstError ??= error;
    }
  }
  cleanups.clear();
  if (firstError !== undefined) throw firstError;
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
  if (cacheScopeStorage !== undefined) {
    return cacheScopeStorage.run(scope, callback);
  }

  if (fallbackAsyncCacheScopeActive) {
    throw new Error(
      "mreact cache scope requires AsyncLocalStorage for concurrent async server renders.",
    );
  }

  const previousScope = hookRenderState.currentCacheScope;
  const previousGlobalScope = getGlobalCacheScope();
  hookRenderState.currentCacheScope = scope;
  setGlobalCacheScope(scope);

  try {
    const result = callback();

    if (isThenable(result)) {
      fallbackAsyncCacheScopeActive = true;
      return Promise.resolve(result).finally(() => {
        fallbackAsyncCacheScopeActive = false;
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
      const baseDuration = Math.max(runtime.profilerBaseDurations.get(path) ?? 0, actualDuration);
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

export function retainMountedProfilerPaths(runtime: RootRuntime, prefix: string): void {
  for (const path of runtime.mountedProfilerPaths) {
    if (path === prefix || path.startsWith(`${prefix}.`)) {
      runtime.activeProfilerPaths?.add(path);
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
  const previousPending = hookRenderState.pendingInstance;

  let existing = runtime.instances.get(path);
  if (existing !== undefined && owner !== undefined && existing.owner !== owner) {
    cleanupInstance(existing);
    runtime.instances.delete(path);
    removeInstanceKeyFromIndex(runtime, path);
    existing = undefined;
  }

  // Defer instance materialization: hooks / context reads call
  // materializeInstance() lazily. A component that touches neither never
  // allocates or registers an instance.
  hookRenderState.currentRuntime = runtime;
  hookRenderState.currentInstance = undefined;
  hookRenderState.pendingInstance = { runtime, path, owner, existing };
  const reactiveCleanups = new Set<() => void>();

  try {
    const value = withReactiveCleanupScope(
      (dispose) => reactiveCleanups.add(dispose),
      () => withContextReadObserver(recordContextDependency, render),
    );
    const instance = hookRenderState.currentInstance;
    if (instance !== undefined || existing !== undefined || reactiveCleanups.size > 0) {
      const target = instance ?? materializeInstance();
      disposeRootCleanups(target.pendingReactiveCleanups);
      target.pendingReactiveCleanups = reactiveCleanups;
    }
    return value;
  } catch (error) {
    disposeRootCleanups(reactiveCleanups);
    throw error;
  } finally {
    hookRenderState.currentRuntime = previousRuntime;
    hookRenderState.currentInstance = previousInstance;
    hookRenderState.pendingInstance = previousPending;
  }
}

// Materialize the deferred instance for the rendering component the first time
// a hook or context read needs it.
function materializeInstance(): ComponentInstance {
  const pending = hookRenderState.pendingInstance;
  if (pending === undefined) {
    throw new Error("Hooks can only be called while rendering.");
  }

  const { runtime, path, owner } = pending;
  let instance = pending.existing;
  if (instance === undefined) {
    instance = {
      owner,
      path,
      hooks: [],
      hookIndex: 0,
      dirty: false,
      nonStateDirty: false,
      devToolsHookSuppressionDepth: 0,
    };
    runtime.instances.set(path, instance);
    indexInstanceKey(runtime, path);
  } else {
    instance.owner = owner;
  }
  runtime.activeInstanceKeys?.add(path);
  instance.hookIndex = 0;
  instance.dirty = false;
  instance.nonStateDirty = false;
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
  hookRenderState.currentInstance = instance;
  hookRenderState.pendingInstance = undefined;
  return instance;
}

function recordContextDependency(context: ReactCompatContextLike<unknown>, value: unknown): void {
  const instance = hookRenderState.currentInstance ?? materializeInstance();
  (instance.contextDependencies ??= new Map()).set(context, value);
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

export function hasContextDependency(runtime: RootRuntime, keys: readonly string[]): boolean {
  return keys.some((key) => runtime.instances.get(key)?.contextDependencies !== undefined);
}

// Shared read-only empty result so components with no registered instances
// (e.g. hookless rows under lazy instance materialization) don't each allocate
// a fresh array. Callers treat instance-key lists as read-only.
const EMPTY_INSTANCE_KEYS: string[] = [];

export function collectRuntimeInstanceKeys(runtime: RootRuntime, prefix: string): string[] {
  const keys = runtime.instanceKeysByPrefix.get(prefix);

  if (keys === undefined) {
    return EMPTY_INSTANCE_KEYS;
  }

  let activeKeys: string[] | undefined;

  for (const key of keys) {
    if (runtime.instances.has(key)) {
      (activeKeys ??= []).push(key);
    }
  }

  return activeKeys ?? EMPTY_INSTANCE_KEYS;
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

export function renderWithStrictMode<T>(runtime: RootRuntime, render: () => T): T {
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

export function restoreRuntimeSnapshot(runtime: RootRuntime, snapshot: RuntimeSnapshot): void {
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
export function useState<T>(initial: T | (() => T)): [T, (value: T | ((previous: T) => T)) => void];
export function useState<T = undefined>(): [
  T | undefined,
  (value: T | undefined | ((previous: T | undefined) => T | undefined)) => void,
];
export function useState<T>(
  initial?: T | (() => T),
): [T | undefined, (value: T | undefined | ((previous: T | undefined) => T | undefined)) => void] {
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

  if (slot.dispatch === undefined) {
    const dispatch = ((value: unknown): void => {
      enqueueStateUpdate(runtime, instance, slot, value, typeof value === "function");
    }) as InternalStateDispatch;
    dispatch[SYNC_STATE_DISPATCH] = (value: unknown): void => {
      enqueueStateUpdate(runtime, instance, slot, value, false);
    };
    slot.dispatch = dispatch;
  }
  const setState = slot.dispatch as (value: T | ((previous: T) => T)) => void;
  const state = readStateForRender(runtime, instance, slot);

  recordDevToolsHook("useState", {
    kind: "state",
    value: state,
  });

  const result = [state as T, setState] as [T, (value: T | ((previous: T) => T)) => void] &
    Record<PropertyKey, unknown>;
  result[REACTIVE_TEXT_BINDING_META] = getStateTextBinding(slot, state);
  result[REACTIVE_STATE_BINDING_META] = getStateBinding(slot);
  return result as [
    T | undefined,
    (value: T | undefined | ((previous: T | undefined) => T | undefined)) => void,
  ];
}

function enqueueStateUpdate(
  runtime: RootRuntime,
  instance: ComponentInstance,
  slot: Extract<HookSlot, { kind: "state" }>,
  dispatchedValue: unknown,
  deferSync: boolean,
): void {
  const updates = slot.updates ?? [];
  let value = dispatchedValue;
  const lane = currentTransitionContext === undefined ? "sync" : "transition";
  const canApplyDirectUpdate =
    lane === "sync" &&
    updates.length === 0 &&
    hookRenderState.hostCommitDepth === 0 &&
    hookRenderState.currentRuntime !== runtime &&
    hookRenderState.currentInstance !== instance &&
    runtime.effectFlushPhase === undefined &&
    eventBatchDepth === 0;
  if (canApplyDirectUpdate && deferSync === false && typeof value === "function") {
    value = (value as (previous: unknown) => unknown)(slot.value);
  }
  if (updates.length === 0 && typeof value !== "function" && Object.is(slot.value, value)) {
    return;
  }
  const renderDraft =
    hookRenderState.hostCommitDepth > 0 ? stateRenderDrafts.get(runtime)?.get(slot) : undefined;
  if (
    lane === "sync" &&
    typeof value === "function" &&
    hookRenderState.hostCommitDepth > 0 &&
    renderDraft !== undefined &&
    renderDraft.remainingUpdates.length === 0 &&
    updates.length === renderDraft.processedUpdateCount
  ) {
    const previousValue = renderDraft.value;
    value = (value as (previous: unknown) => unknown)(previousValue);
    if (Object.is(previousValue, value)) {
      return;
    }
  }
  if (canApplyDirectUpdate && typeof value !== "function" && optionsAllowDirectTextBinding(value)) {
    const updatedText = updateDirectTextBinding(slot.textBinding, value);
    const updatedState = updateDirectStateBinding(slot.stateBinding, value);
    if (updatedText || updatedState) {
      slot.value = value;
      slot.baseState = value;
      return;
    }
  }
  if (hookRenderState.hostCommitDepth > 0 && !Object.hasOwn(slot, "hostCommitValue")) {
    slot.hostCommitValue = renderDraft?.value ?? slot.value;
  }
  updates.push({
    action: value,
    lane,
  });
  slot.updates = updates;
  scheduleInstanceUpdate(runtime, instance, { deferSync, stateUpdate: true });
}

function readStateForRender(
  runtime: RootRuntime,
  instance: ComponentInstance,
  slot: Extract<HookSlot, { kind: "state" }>,
): unknown {
  const drafts = stateRenderDrafts.get(runtime);
  const existing = drafts?.get(slot);
  if (existing !== undefined) {
    return existing.value;
  }

  const priority = renderPriorities.get(runtime) ?? "sync";
  const updates = slot.updates ?? [];
  let state = Object.hasOwn(slot, "baseState") ? slot.baseState : slot.value;
  let baseState = state;
  let skipped = false;
  const remainingUpdates: StateUpdate[] = [];

  for (const update of updates) {
    const shouldSkip = priority !== "transition" && update.lane === "transition";
    if (shouldSkip) {
      if (!skipped) {
        baseState = state;
        skipped = true;
      }
      remainingUpdates.push(update);
      continue;
    }

    state =
      typeof update.action === "function"
        ? (update.action as (previous: unknown) => unknown)(state)
        : update.action;
    if (skipped) {
      remainingUpdates.push({ action: update.action, lane: "replay" });
    }
  }

  if (!skipped) {
    baseState = state;
  }

  drafts?.set(slot, {
    instance,
    slot,
    value: state,
    baseState,
    remainingUpdates,
    processedUpdateCount: updates.length,
  });
  return state;
}

function finishStateRender(runtime: RootRuntime, committed: boolean): boolean {
  const drafts = stateRenderDrafts.get(runtime);
  if (drafts === undefined || drafts.size === 0) {
    return false;
  }

  const touchedInstances = new Set<ComponentInstance>();
  let publishedStateBinding = false;
  for (const draft of drafts.values()) {
    touchedInstances.add(draft.instance);
    if (!committed) {
      draft.instance.dirty = true;
      continue;
    }

    const appendedUpdates = (draft.slot.updates ?? []).slice(draft.processedUpdateCount);
    const compactedAppendedUpdates =
      draft.remainingUpdates.length === 0
        ? compactLiteralNoopUpdates(draft.value, appendedUpdates)
        : appendedUpdates;
    const remainingUpdates = [...draft.remainingUpdates, ...compactedAppendedUpdates];
    draft.slot.value = draft.value;
    draft.slot.baseState = draft.baseState;
    const stateBinding = draft.slot.stateBinding;
    if (stateBinding !== undefined && !Object.is(stateBinding.value, draft.value)) {
      stateBinding.value = draft.value;
      notifySubscribers(stateBinding.source);
      publishedStateBinding = true;
    }
    if (remainingUpdates.length === 0) {
      delete draft.slot.updates;
    } else {
      draft.slot.updates = remainingUpdates;
    }
  }

  if (committed) {
    for (const instance of touchedInstances) {
      updateHostCommitDirtyState(instance);
    }
  }
  return committed && publishedStateBinding;
}

function finishOptimisticRender(runtime: RootRuntime, committed: boolean): void {
  const drafts = optimisticRenderDrafts.get(runtime);
  if (drafts === undefined || drafts.size === 0) {
    return;
  }

  const touchedInstances = new Set<ComponentInstance>();
  for (const draft of drafts.values()) {
    touchedInstances.add(draft.instance);
    if (!committed) {
      draft.instance.dirty = true;
      continue;
    }

    const appendedUpdates = draft.slot.updates.slice(draft.processedUpdateCount);
    draft.slot.baseState = draft.baseState;
    draft.slot.optimisticState = draft.optimisticState;
    draft.slot.updates = [...draft.remainingUpdates, ...appendedUpdates];
  }

  if (committed) {
    for (const instance of touchedInstances) {
      updateHostCommitDirtyState(instance);
    }
  }
}

function compactLiteralNoopUpdates(state: unknown, updates: readonly StateUpdate[]): StateUpdate[] {
  const lane = updates[0]?.lane;
  if (
    updates.length === 0 ||
    updates.some((update) => typeof update.action === "function" || update.lane !== lane)
  ) {
    return [...updates];
  }

  const finalState = updates.at(-1)?.action;
  return Object.is(state, finalState) ? [] : [...updates];
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

function getStateTextBinding(
  slot: Extract<HookSlot, { kind: "state" }>,
  value: unknown,
): ReactiveTextBinding {
  slot.textBinding ??= {
    value,
    subscribers: new Set(),
  };
  slot.textBinding.value = value;
  return slot.textBinding;
}

function getStateBinding(slot: Extract<HookSlot, { kind: "state" }>): ReactiveStateBinding {
  slot.stateBinding ??= {
    value: slot.value,
    source: { subscribers: null },
    get() {
      trackSource(this.source);
      return this.value;
    },
  };
  return slot.stateBinding;
}

function optionsAllowDirectTextBinding(value: unknown): boolean {
  return typeof value !== "function";
}

function updateDirectTextBinding(
  binding: ReactiveTextBinding | undefined,
  value: unknown,
): boolean {
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

function updateDirectStateBinding(
  binding: ReactiveStateBinding | undefined,
  value: unknown,
): boolean {
  if (binding === undefined || binding.source.subscribers === null) {
    return false;
  }

  binding.value = value;
  notifySubscribers(binding.source);
  flushQueuedComputations();
  return true;
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
export function useReducer<TState>(
  reducer: (state: TState) => TState,
  initialArg: TState,
): [TState, () => void];
export function useReducer<TState, TAction, TInitial = TState>(
  reducer: (state: TState, action: TAction) => TState,
  initialArg: TInitial,
  init?: (initialArg: TInitial) => TState,
): [TState, (action: TAction) => void];
export function useReducer<TState, TAction, TInitial = TState>(
  reducer: (state: TState, action: TAction) => TState,
  initialArg: TInitial,
  init?: (initialArg: TInitial) => TState,
): [TState, (action: TAction) => void] {
  const stateTuple = runWithoutDevToolsHookTracking(() =>
    useState<TState>(() =>
      init === undefined ? (initialArg as unknown as TState) : init(initialArg),
    ),
  );
  const [state, setState] = stateTuple;
  const reducerRef = runWithoutDevToolsHookTracking(() => useRef(reducer));
  const stateRef = runWithoutDevToolsHookTracking(() => useRef(state));
  const dispatchRef = runWithoutDevToolsHookTracking(() =>
    useRef<((action: TAction) => void) | undefined>(undefined),
  );
  reducerRef.current = reducer;
  stateRef.current = state;

  if (dispatchRef.current === undefined) {
    dispatchRef.current = (action: TAction): void => {
      const update = (previous: TState) => reducerRef.current(previous, action);
      if (currentTransitionContext === undefined && eventBatchDepth === 0) {
        (setState as unknown as InternalStateDispatch)[SYNC_STATE_DISPATCH](update);
      } else {
        setState(update);
      }
    };
  }

  recordDevToolsHook("useReducer", {
    kind: "reducer",
    value: state,
  });

  const result = [state, dispatchRef.current] as [TState, (action: TAction) => void] &
    Record<PropertyKey, unknown>;
  const stateBinding = (stateTuple as unknown as Record<PropertyKey, unknown>)[
    REACTIVE_STATE_BINDING_META
  ];

  if (stateBinding !== undefined) {
    result[REACTIVE_STATE_BINDING_META] = stateBinding;
  }
  return result;
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
  const idRef = runWithoutDevToolsHookTracking(() => useRef<string | undefined>(undefined));

  if (idRef.current === undefined) {
    const hydratedId =
      runtime.idMode === "client" ? hydratedIdsByRuntime.get(runtime)?.get(idSlotKey) : undefined;

    if (hydratedId !== undefined) {
      idRef.current = hydratedId;
    } else {
      const serverMode = runtime.idMode === "server";
      const mode = serverMode ? "R" : "r";
      const id = serverMode ? runtime.idCounter : globalClientIdCounter;
      idRef.current = `_${runtime.identifierPrefix}${mode}_${id}_`;
      if (serverMode) {
        runtime.idCounter += 1;
      } else {
        globalClientIdCounter += 1;
      }

      if (serverMode) {
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
    useEffectImpl(
      "imperative-handle",
      () => {
        const handle = create();
        assignRef(ref, handle);
        return () => {
          assignRef(ref, null);
        };
      },
      deps === undefined ? undefined : [ref, ...deps],
    ),
  );
  recordDevToolsHook(
    "useImperativeHandle",
    deps === undefined ? { kind: "imperative-handle" } : { kind: "imperative-handle", deps },
  );
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
    value =
      replayByHook?.has(hookKey) === true
        ? replayByHook.get(hookKey)
        : replay === undefined || replay.index >= replay.values.length
          ? slot.value
          : replay.values[replay.index++];
  } else if (shouldRecompute) {
    value = factory();
    slot = deps === undefined ? { kind: "memo", value } : { kind: "memo", value, deps };
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

  recordDevToolsHook(
    "useMemo",
    memoSlot.deps === undefined
      ? { kind: "memo", value }
      : { kind: "memo", value, deps: memoSlot.deps },
  );

  return value as T;
}

function getStrictMemoHookKey(instance: ComponentInstance, index: number): string {
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
    return globalKey === undefined ? `p:symbol:${String(owner)}` : `p:symbol-global:${globalKey}`;
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
  return (
    typeof (
      globalThis as {
        __REACT_DEVTOOLS_GLOBAL_HOOK__?: { inject?: unknown } | undefined;
      }
    ).__REACT_DEVTOOLS_GLOBAL_HOOK__?.inject === "function"
  );
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
  recordDevToolsHook(
    "useCallback",
    deps === undefined ? { kind: "callback", value } : { kind: "callback", value, deps },
  );
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
    useCallback((...args: TArgs) => ref.current(...args), []),
  );
  recordDevToolsHook("useEffectEvent", {
    kind: "callback",
    value: event,
    deps: [],
  });
  return event;
}

/** Runs an effect after the rendered output has been committed. */
export function useEffect(callback: EffectCallback, deps?: readonly unknown[]): void {
  useEffectImpl("normal", callback, deps);
  recordDevToolsHook(
    "useEffect",
    deps === undefined
      ? { kind: "effect", effectKind: "normal" }
      : { kind: "effect", effectKind: "normal", deps },
  );
}

/** Runs an insertion effect before layout effects are flushed. */
export function useInsertionEffect(callback: EffectCallback, deps?: readonly unknown[]): void {
  useEffectImpl("insertion", callback, deps);
  recordDevToolsHook(
    "useInsertionEffect",
    deps === undefined
      ? { kind: "effect", effectKind: "insertion" }
      : { kind: "effect", effectKind: "insertion", deps },
  );
}

/** Runs a layout effect after DOM mutations and before normal effects. */
export function useLayoutEffect(callback: EffectCallback, deps?: readonly unknown[]): void {
  useEffectImpl("layout", callback, deps);
  recordDevToolsHook(
    "useLayoutEffect",
    deps === undefined
      ? { kind: "effect", effectKind: "layout" }
      : { kind: "effect", effectKind: "layout", deps },
  );
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
      value:
        runtime.idMode === "server" && getServerSnapshot !== undefined
          ? getServerSnapshot()
          : getSnapshot(),
    };
    instance.hooks[index] = slot;
  }

  if (slot.kind !== "store") {
    throw new Error("Hook order changed between renders.");
  }
  slot.getSnapshot = getSnapshot as () => unknown;

  const isHydrationMount =
    runtime.idMode === "server" && slot.hasMounted !== true && getServerSnapshot !== undefined;
  const currentSnapshot = isHydrationMount ? (slot.value as T) : getSnapshot();

  if (!Object.is(slot.value, currentSnapshot)) {
    slot.value = currentSnapshot;
  }

  if (!isHydrationMount) {
    recordExternalStoreCheck(getSnapshot, currentSnapshot);
  }

  runWithoutDevToolsHookTracking(() =>
    useEffect(() => {
      const checkForUpdates = (): void => {
        if (instance.disposed === true) {
          return;
        }

        const nextSnapshot = (slot.getSnapshot ?? getSnapshot)();

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

      const unsubscribe = subscribe(checkForUpdates);
      try {
        checkForUpdates();
      } catch (error) {
        unsubscribe();
        throw error;
      }
      slot.hasMounted = true;
      return () => {
        unsubscribe();
      };
    }, [subscribe]),
  );

  recordDevToolsHook("useSyncExternalStore", {
    kind: "store",
    value: slot.value,
  });

  return slot.value as T;
}

/** Tracks state and pending status for an action that receives the previous state. */
export function useActionState<TState, TPayload>(
  action: (previousState: TState, payload: TPayload) => TState | PromiseLike<TState>,
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
      queue: [],
      running: false,
    };
    instance.hooks[index] = slot;
  }

  if ("error" in slot) {
    throw slot.error;
  }

  slot.action = action as (previousState: unknown, payload: unknown) => unknown;

  if (slot.dispatch === undefined) {
    slot.dispatch = (payload: unknown): void => {
      enqueueActionStateDispatch(slot, runtime, instance, payload);
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
      : (update as (state: unknown, payload: unknown) => unknown);

  if (slot !== undefined && slot.kind !== "optimistic") {
    throw new Error("Hook order changed between renders.");
  }

  if (slot === undefined) {
    slot = {
      kind: "optimistic",
      baseState: state,
      optimisticState: state,
      updates: [],
      update: updateFn,
    };
    instance.hooks[index] = slot;
  }

  slot.update = updateFn;

  const baseChanged = !Object.is(slot.baseState, state);
  const updatesForBase = !baseChanged
    ? slot.updates
    : slot.updates.filter((optimisticUpdate) => optimisticUpdate.context !== undefined);

  if (slot.dispatch === undefined) {
    slot.dispatch = (payload: unknown): void => {
      const context = currentTransitionContext ?? currentCommitTransitionContext;
      const hasHostCommitDraft =
        hookRenderState.hostCommitDepth > 0 &&
        optimisticRenderDrafts.get(runtime)?.has(slot) === true;
      if (context === undefined && slot.updates.length === 0 && !hasHostCommitDraft) {
        slot.optimisticState = slot.update(slot.optimisticState, payload);
        scheduleInstanceUpdate(runtime, instance, { forceSync: true });
        return;
      }
      slot.updates.push(context === undefined ? { payload } : { payload, context });
      if (context !== undefined) {
        context.optimisticTargets.set(slot, { runtime, instance });
      }
      scheduleInstanceUpdate(runtime, instance, { forceSync: true });
    };
  }

  const priority = renderPriorities.get(runtime) ?? "sync";
  const remainingUpdates =
    priority === "transition"
      ? updatesForBase.filter((optimisticUpdate) => optimisticUpdate.context?.settled !== true)
      : [...updatesForBase];
  let optimisticState: unknown = baseChanged ? state : slot.optimisticState;
  for (const optimisticUpdate of remainingUpdates) {
    optimisticState = slot.update(optimisticState, optimisticUpdate.payload);
  }
  if (!baseChanged && slot.updates.length === 0) {
    recordDevToolsHook("useOptimistic", {
      kind: "state",
      value: optimisticState,
    });
    return [optimisticState as TState, slot.dispatch as (payload: TPayload) => void];
  }
  let drafts = optimisticRenderDrafts.get(runtime);
  if (drafts === undefined) {
    drafts = new Map();
    optimisticRenderDrafts.set(runtime, drafts);
  }
  drafts.set(slot, {
    instance,
    slot,
    baseState: state,
    optimisticState: baseChanged ? state : slot.optimisticState,
    remainingUpdates,
    processedUpdateCount: slot.updates.length,
  });

  recordDevToolsHook("useOptimistic", {
    kind: "state",
    value: optimisticState,
  });

  return [optimisticState as TState, slot.dispatch as (payload: TPayload) => void];
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

export function hasStableExternalStores(runtime: RootRuntime): boolean {
  return runtime.externalStoreChecks.every((check) => Object.is(check.getSnapshot(), check.value));
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
export type TransitionScope = () => void | PromiseLike<void>;
/** Function that schedules a transition scope. */
export type StartTransition = (scope: TransitionScope) => void;

/** Schedules non-urgent updates produced inside a transition scope. */
export function startTransition(scope: TransitionScope): void {
  executeTransitionScope(scope, createTransitionContext());
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
  const pendingCount = runWithoutDevToolsHookTracking(() => useRef(0));
  const transitionError = runWithoutDevToolsHookTracking(() =>
    useRef<unknown>(NO_TRANSITION_ERROR),
  );
  const [renderedPendingCount, setRenderedPendingCount] = runWithoutDevToolsHookTracking(() =>
    useState(0),
  );
  if (transitionError.current !== NO_TRANSITION_ERROR) {
    throw transitionError.current;
  }
  const startTransitionWithPending: StartTransition = (scope) => {
    pendingCount.current += 1;
    setRenderedPendingCount(pendingCount.current);
    const context = createTransitionContext();
    const settlementListener = (): boolean => {
      instance.transitionListeners?.delete(context);
      pendingCount.current = Math.max(0, pendingCount.current - 1);
      if (instance.disposed === true) {
        return false;
      }
      if (Object.hasOwn(context, "rejection")) {
        transitionError.current = context.rejection;
      }
      runTransitionScope(() => {
        setRenderedPendingCount(pendingCount.current);
      }, context);
      return true;
    };
    context.settlementListeners.add(settlementListener);
    (instance.transitionListeners ??= new Map()).set(context, settlementListener);
    executeTransitionScope(scope, context);
  };

  recordDevToolsHook("useTransition", {
    kind: "transition",
    value: renderedPendingCount > 0,
  });

  return [renderedPendingCount > 0, startTransitionWithPending];
}

/** Defers a value update so urgent renders can commit first. */
export function useDeferredValue<T>(value: T, initialValue?: T): T {
  const [deferredValue, setDeferredValue] = runWithoutDevToolsHookTracking(() =>
    useState(arguments.length > 1 ? (initialValue as T) : value),
  );

  runWithoutDevToolsHookTracking(() =>
    useEffect(() => {
      if (Object.is(deferredValue, value)) {
        return;
      }

      startTransition(() => {
        setDeferredValue(value);
      });
    }, [value, deferredValue]),
  );

  const currentValue = Object.is(deferredValue, value) ? value : deferredValue;

  recordDevToolsHook("useDeferredValue", {
    kind: "deferred",
    value: currentValue,
  });

  return currentValue;
}

function createTransitionContext(): TransitionContext {
  return {
    syncVersion,
    transitionVersion: ++transitionVersion,
    pendingTasks: 0,
    scopeClosed: false,
    settled: false,
    optimisticTargets: new Map(),
    settlementListeners: new Set(),
  };
}

function executeTransitionScope(scope: TransitionScope, context: TransitionContext): void {
  try {
    try {
      const result = runTransitionScope(scope, context);
      const then = getThenFunction(result);
      if (then !== undefined) {
        registerTransitionTask(context, result, then);
      }
    } catch (error) {
      context.rejection = error;
    }
  } finally {
    context.scopeClosed = true;
    settleTransitionContextIfReady(context);
  }
}

function runTransitionScope<T>(scope: () => T, context: TransitionContext): T {
  transitionDepth += 1;
  const previousContext = currentTransitionContext;
  currentTransitionContext = context;

  try {
    return scope();
  } finally {
    currentTransitionContext = previousContext;
    transitionDepth -= 1;
    if (transitionDepth === 0) {
      flushQueuedForcedSyncRerenders();
    }
  }
}

function registerTransitionTask(
  context: TransitionContext,
  task: unknown,
  then: ThenFunction,
): void {
  context.pendingTasks += 1;
  let completed = false;
  const complete = (): void => {
    if (completed) {
      return;
    }
    completed = true;
    context.pendingTasks = Math.max(0, context.pendingTasks - 1);
    settleTransitionContextIfReady(context);
  };
  const reject = (reason: unknown): void => {
    if (completed) {
      return;
    }
    context.rejection = reason;
    complete();
  };
  try {
    then.call(task, complete, reject);
  } catch (error) {
    reject(error);
  }
}

function getThenFunction(value: unknown): ThenFunction | undefined {
  if ((typeof value !== "object" && typeof value !== "function") || value === null) {
    return undefined;
  }
  const then = (value as { then?: unknown }).then;
  return typeof then === "function" ? (then as ThenFunction) : undefined;
}

function settleTransitionContextIfReady(context: TransitionContext): void {
  if (context.settled || !context.scopeClosed || context.pendingTasks > 0) {
    return;
  }

  context.settled = true;
  for (const { runtime, instance } of context.optimisticTargets.values()) {
    if (instance.disposed === true) {
      continue;
    }
    instance.dirty = true;
    instance.nonStateDirty = true;
    queueTransitionRerender(runtime, context);
  }
  context.optimisticTargets.clear();

  const listeners = [...context.settlementListeners];
  context.settlementListeners.clear();
  let rejectionHandled = false;
  for (const listener of listeners) {
    rejectionHandled = listener() || rejectionHandled;
  }
  if (Object.hasOwn(context, "rejection") && !rejectionHandled) {
    reportGlobalTransitionError(context.rejection);
  }
}

function reportGlobalTransitionError(error: unknown): void {
  const reportError = (globalThis as { reportError?: (reason: unknown) => void }).reportError;
  if (typeof reportError === "function") {
    reportError(error);
    return;
  }
  queueMicrotask(() => {
    throw error;
  });
}

function queueTransitionRerender(runtime: RootRuntime, context: TransitionContext): void {
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

function flushQueuedForcedSyncRerenders(): void {
  if (queuedForcedSyncRerenders.size === 0) {
    return;
  }

  const rerenders = [...queuedForcedSyncRerenders];
  queuedForcedSyncRerenders.clear();
  for (const [runtime, context] of rerenders) {
    const previousContext = currentCommitTransitionContext;
    currentCommitTransitionContext = context;
    try {
      scheduleRuntimeRerender(runtime, { forceSync: true });
    } finally {
      currentCommitTransitionContext = previousContext;
    }
  }
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
    flushQueuedEventRerenders(priority === "continuous" ? "continuous" : "sync");
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

  for (const [runtime] of entries) {
    runtime.rerender("transition");
  }
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
    queue.push({ slot, instancePath: instance.path, order: queue.length });
  }
}

function recordExternalStoreCheck<T>(getSnapshot: () => T, value: T): void {
  hookRenderState.currentRuntime?.externalStoreChecks.push({ getSnapshot, value });
}

function flushPendingEffects(
  queue: PendingEffect[],
  reportEffectError: (error: unknown) => void,
): PendingEffect[] {
  const pending = queue.splice(0).sort(comparePendingEffectTreeOrder);
  const strictReplay: PendingEffect[] = [];
  const runnable: Array<PendingEffect & { shouldReplay: boolean }> = [];

  for (const effect of pending) {
    const { slot } = effect;
    if (slot.disposed === true) {
      continue;
    }

    const shouldReplay = slot.strictReplay === true && slot.cleanup === undefined;
    const cleanup = slot.cleanup;
    delete slot.cleanup;
    slot.mounted = false;
    cleanup?.();
    runnable.push({ ...effect, shouldReplay });
  }

  for (const effect of runnable) {
    const { slot, shouldReplay } = effect;
    if (slot.disposed === true) {
      continue;
    }

    try {
      const cleanup = slot.callback();

      if (typeof cleanup === "function") {
        slot.cleanup = cleanup;
      } else {
        delete slot.cleanup;
      }
      slot.mounted = true;

      if (shouldReplay) {
        strictReplay.push(effect);
      }
    } catch (error) {
      reportEffectError(error);
    }
  }

  return strictReplay;
}

function replayStrictEffects(
  effects: PendingEffect[],
  reportEffectError: (error: unknown) => void,
): void {
  for (const { slot } of effects) {
    if (slot.disposed === true) {
      continue;
    }

    try {
      const cleanup = slot.callback();

      if (typeof cleanup === "function") {
        slot.cleanup = cleanup;
      } else {
        delete slot.cleanup;
      }
      slot.mounted = true;
    } catch (error) {
      slot.mounted = false;
      reportEffectError(error);
    }
  }
}

function comparePendingEffectTreeOrder(left: PendingEffect, right: PendingEffect): number {
  if (isStrictAncestorPath(left.instancePath, right.instancePath)) {
    return 1;
  }
  if (isStrictAncestorPath(right.instancePath, left.instancePath)) {
    return -1;
  }
  return left.order - right.order;
}

function isStrictAncestorPath(ancestor: string, descendant: string): boolean {
  if (ancestor === descendant) {
    return false;
  }
  return ancestor === "" || descendant.startsWith(`${ancestor}.`);
}

function flushProfilerCommits(runtime: RootRuntime, commits: PendingProfilerCommit[]): void {
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

function enqueueActionStateDispatch(
  slot: Extract<HookSlot, { kind: "action-state" }>,
  runtime: RootRuntime,
  instance: ComponentInstance,
  payload: unknown,
): void {
  if (instance.disposed === true || "error" in slot) {
    return;
  }
  const context = currentTransitionContext ?? currentCommitTransitionContext;
  const dispatch: ActionStateDispatch = {
    payload,
    action: slot.action,
    ...(context === undefined ? {} : { context }),
    completed: false,
  };
  if (context !== undefined) {
    context.pendingTasks += 1;
  }
  slot.queue.push(dispatch);
  runNextActionStateDispatch(slot, runtime, instance);
}

function runNextActionStateDispatch(
  slot: Extract<HookSlot, { kind: "action-state" }>,
  runtime: RootRuntime,
  instance: ComponentInstance,
): void {
  if (slot.running || instance.disposed === true) {
    return;
  }

  const dispatch = slot.queue[0];
  if (dispatch === undefined) {
    return;
  }

  slot.running = true;
  let result: unknown;
  let then: ThenFunction | undefined;

  try {
    result =
      dispatch.context === undefined
        ? dispatch.action(slot.state, dispatch.payload)
        : runTransitionScope(() => dispatch.action(slot.state, dispatch.payload), dispatch.context);
    then = getThenFunction(result);
    if (then === undefined) {
      if (dispatch.context !== undefined) {
        slot.pendingCount += 1;
        scheduleInstanceUpdate(runtime, instance, { forceSync: true });
        queueMicrotask(() => {
          settleActionStateDispatch(slot, runtime, instance, dispatch, true, () => {
            slot.state = result;
          });
        });
        return;
      }
      settleActionStateDispatch(slot, runtime, instance, dispatch, false, () => {
        slot.state = result;
      });
      return;
    }
  } catch (error) {
    settleActionStateDispatch(
      slot,
      runtime,
      instance,
      dispatch,
      false,
      () => {
        slot.error = error;
      },
      true,
    );
    return;
  }

  slot.pendingCount += 1;
  scheduleInstanceUpdate(runtime, instance, { forceSync: true });
  try {
    then.call(
      result,
      (nextState) => {
        settleActionStateDispatch(slot, runtime, instance, dispatch, true, () => {
          slot.state = nextState;
        });
      },
      (error) => {
        settleActionStateDispatch(
          slot,
          runtime,
          instance,
          dispatch,
          true,
          () => {
            slot.error = error;
          },
          true,
        );
      },
    );
  } catch (error) {
    settleActionStateDispatch(
      slot,
      runtime,
      instance,
      dispatch,
      true,
      () => {
        slot.error = error;
      },
      true,
    );
  }
}

function settleActionStateDispatch(
  slot: Extract<HookSlot, { kind: "action-state" }>,
  runtime: RootRuntime,
  instance: ComponentInstance,
  dispatch: ActionStateDispatch,
  wasPending: boolean,
  apply: () => void,
  failed = false,
): void {
  if (dispatch.completed) {
    return;
  }

  dispatch.completed = true;
  const applyResult = (): void => {
    apply();
    if (wasPending) {
      slot.pendingCount = Math.max(0, slot.pendingCount - 1);
    }
    scheduleInstanceUpdate(runtime, instance);
  };
  let didApplyThrow = false;
  let applyError: unknown;
  try {
    if (dispatch.context === undefined) {
      applyResult();
    } else {
      runTransitionScope(applyResult, dispatch.context);
    }
  } catch (error) {
    didApplyThrow = true;
    applyError = error;
  }

  completeActionStateContextTask(dispatch);
  if (slot.queue[0] === dispatch) {
    slot.queue.shift();
  } else {
    const index = slot.queue.indexOf(dispatch);
    if (index >= 0) {
      slot.queue.splice(index, 1);
    }
  }
  slot.running = false;

  if (failed || didApplyThrow || instance.disposed === true) {
    for (const queuedDispatch of slot.queue) {
      completeActionStateContextTask(queuedDispatch);
    }
    slot.queue = [];
  } else {
    runNextActionStateDispatch(slot, runtime, instance);
  }

  if (didApplyThrow) {
    throw applyError;
  }
}

function completeActionStateContextTask(dispatch: ActionStateDispatch): void {
  const context = dispatch.context;
  dispatch.completed = true;
  if (context === undefined) {
    return;
  }
  delete dispatch.context;
  context.pendingTasks = Math.max(0, context.pendingTasks - 1);
  settleTransitionContextIfReady(context);
}

export function scheduleRuntimeRerender(
  runtime: RootRuntime,
  options: { deferSync?: boolean; forceSync?: boolean } = {},
): void {
  if (options.forceSync === true && transitionDepth > 0) {
    queuedForcedSyncRerenders.set(runtime, currentTransitionContext);
    return;
  }
  if (transitionDepth === 0 || options.forceSync === true) {
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
  options: { deferSync?: boolean; forceSync?: boolean; stateUpdate?: boolean } = {},
): void {
  if (instance.disposed === true) {
    return;
  }

  instance.dirty = true;
  if (options.stateUpdate !== true) {
    instance.nonStateDirty = true;
  }
  if (
    hookRenderState.hostCommitDepth === 0 &&
    hookRenderState.currentRuntime === runtime &&
    hookRenderState.currentInstance === instance
  ) {
    runtime.renderPhaseUpdate = true;
    return;
  }

  scheduleRuntimeRerender(runtime, options);
}

function flushHostCommitRerenders(): boolean {
  if (
    hostCommitRerenderDepth > 0 ||
    hookRenderState.hostCommitDepth > 0 ||
    hookRenderState.queuedHostCommitRerenders.size === 0
  ) {
    return false;
  }

  let didRerender = false;
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
          didRerender = true;
          runtime.rerender("sync");
        }
      }
    }
    hookRenderState.queuedHostCommitRerenders.clear();
  } finally {
    hostCommitRerenderDepth -= 1;
  }
  return didRerender;
}

function dedupePendingEffects(queue: PendingEffect[]): void {
  if (queue.length < 2) {
    return;
  }

  const latestBySlot = new Map<Extract<HookSlot, { kind: "effect" }>, PendingEffect>();
  for (const effect of queue) {
    latestBySlot.set(effect.slot, effect);
  }
  queue.length = 0;
  queue.push(...latestBySlot.values());
}

function flushEffectFlushRerenders(): void {
  if (effectFlushRerenderDepth > 0 || hookRenderState.queuedEffectFlushRerenders.size === 0) {
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

function updateHostCommitDirtyState(instance: ComponentInstance): void {
  instance.dirty =
    instance.nonStateDirty ||
    instance.hooks.some(
      (slot) =>
        (slot.kind === "state" && (slot.updates?.length ?? 0) > 0) ||
        (slot.kind === "optimistic" &&
          slot.updates.some((update) => update.context?.settled === true)) ||
        ((slot.kind === "state" || slot.kind === "store") &&
          Object.hasOwn(slot, "hostCommitValue") &&
          !Object.is(slot.hostCommitValue, slot.value)),
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
  return (
    cacheScopeStorage?.getStore() ?? hookRenderState.currentCacheScope ?? getGlobalCacheScope()
  );
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

interface AsyncLocalStorageLike<T> {
  getStore(): T | undefined;
  run<TResult>(store: T, callback: () => TResult): TResult;
}

type AsyncLocalStorageConstructor = new <T>() => AsyncLocalStorageLike<T>;

function createCacheScopeStorage(): AsyncLocalStorageLike<CacheScope> | undefined {
  const globalConstructor = (
    globalThis as {
      AsyncLocalStorage?: AsyncLocalStorageConstructor | undefined;
    }
  ).AsyncLocalStorage;
  if (typeof globalConstructor === "function") {
    return new globalConstructor<CacheScope>();
  }

  const builtinConstructor = (
    globalThis as {
      process?: {
        getBuiltinModule?: (name: string) => { AsyncLocalStorage?: AsyncLocalStorageConstructor };
      };
    }
  ).process?.getBuiltinModule?.("node:async_hooks")?.AsyncLocalStorage;
  return typeof builtinConstructor === "function"
    ? new builtinConstructor<CacheScope>()
    : undefined;
}

export function __setCacheScopeStorageForTesting(
  storage: AsyncLocalStorageLike<CacheScope> | undefined,
): void {
  cacheScopeStorage = storage;
  fallbackAsyncCacheScopeActive = false;
}

function cleanupStrictEffects(
  effects: PendingEffect[],
  reportEffectError: (error: unknown) => void,
): void {
  for (const { slot } of effects) {
    if (slot.disposed !== true) {
      const cleanup = slot.cleanup;
      delete slot.cleanup;
      slot.mounted = false;
      try {
        cleanup?.();
      } catch (error) {
        reportEffectError(error);
      }
    }
  }
}

function collectInactiveInstances(runtime: RootRuntime): Array<[string, ComponentInstance]> {
  const activeInstanceKeys = runtime.activeInstanceKeys;

  if (activeInstanceKeys === undefined) {
    return [];
  }

  if (activeInstanceKeys.size === runtime.instances.size) {
    return [];
  }

  const inactiveInstances: Array<[string, ComponentInstance]> = [];
  for (const [key, instance] of runtime.instances) {
    if (!activeInstanceKeys.has(key)) {
      inactiveInstances.push([key, instance]);
    }
  }

  return inactiveInstances;
}

function restorePreparedMutationEffectStates(
  states: readonly PreparedMutationEffectState[] | undefined,
  errors: unknown[],
  errorStart: number | undefined,
): void {
  if (states !== undefined) {
    for (const { instance, slots } of states) {
      instance.disposed = false;
      for (const { slot, mounted, cleanupRan } of slots) {
        slot.disposed = false;
        if (cleanupRan) {
          slot.mounted = false;
        } else if (mounted === undefined) {
          delete slot.mounted;
        } else {
          slot.mounted = mounted;
        }
      }
    }
  }

  if (errorStart !== undefined) {
    errors.length = errorStart;
  }
}

function cleanupInactiveInstances(
  runtime: RootRuntime,
  preparedInstances?: ReadonlyArray<readonly [string, ComponentInstance]>,
): void {
  const inactiveInstances = preparedInstances ?? collectInactiveInstances(runtime);

  for (const [key, instance] of inactiveInstances) {
    cleanupInstance(instance);
    if (runtime.instances.get(key) === instance) {
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

function forEachInstanceKeyPrefix(key: string, callback: (prefix: string) => void): void {
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
  if (instance.transitionListeners !== undefined) {
    for (const [context, listener] of instance.transitionListeners) {
      context.settlementListeners.delete(listener);
    }
    instance.transitionListeners.clear();
    delete instance.transitionListeners;
  }
  disposeRootCleanups(instance.committedReactiveCleanups);
  delete instance.committedReactiveCleanups;
  disposeRootCleanups(instance.pendingReactiveCleanups);
  delete instance.pendingReactiveCleanups;
  for (const slot of instance.hooks) {
    if (slot?.kind === "effect") {
      slot.disposed = true;
      slot.mounted = false;
      slot.cleanup?.();
      delete slot.cleanup;
    } else if (slot?.kind === "state" && slot.textBinding !== undefined) {
      clearReactiveTextBindingSubscribers(slot.textBinding);
    } else if (slot?.kind === "action-state") {
      for (const dispatch of slot.queue) {
        completeActionStateContextTask(dispatch);
      }
      slot.queue = [];
      slot.running = false;
      slot.pendingCount = 0;
    } else if (slot?.kind === "optimistic") {
      for (const update of slot.updates) {
        update.context?.optimisticTargets.delete(slot);
      }
      slot.updates = [];
    }
  }
}

function commitReactiveCleanups(runtime: RootRuntime): void {
  for (const instance of runtime.instances.values()) {
    const pending = instance.pendingReactiveCleanups;
    if (pending === undefined) continue;
    disposeRootCleanups(instance.committedReactiveCleanups);
    instance.committedReactiveCleanups = pending;
    delete instance.pendingReactiveCleanups;
  }
}

function discardPendingReactiveCleanups(runtime: RootRuntime): void {
  for (const instance of runtime.instances.values()) {
    disposeRootCleanups(instance.pendingReactiveCleanups);
    delete instance.pendingReactiveCleanups;
  }
}

function requireRuntime(): RootRuntime {
  if (hookRenderState.currentRuntime === undefined) {
    throw new Error("Hooks can only be called while rendering.");
  }

  return hookRenderState.currentRuntime;
}

function requireInstance(): ComponentInstance {
  return hookRenderState.currentInstance ?? materializeInstance();
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
