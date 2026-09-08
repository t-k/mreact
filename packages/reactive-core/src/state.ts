import { warnOnDuplicateReactiveCoreCopy } from "./duplicate-guard.js";

// This module holds the per-copy reactive runtime identity, so a second
// evaluation in the same browser page is exactly the duplication that breaks
// cross-package cell tracking.
warnOnDuplicateReactiveCoreCopy(import.meta.url);

export interface Source {
  // null while nothing subscribes, the computation itself while exactly one
  // does, and a Set from the second subscriber on (kept as a Set until it
  // empties back to null). Most sources never allocate a Set at all, and hot
  // write sites can gate on a null check instead of a Set.size accessor.
  subscribers: ReactiveComputation | Set<ReactiveComputation> | null;
  // Snapshot counter owned by the reactive runtime and advanced through
  // bumpSourceVersion(). Sources created by other packages may omit it; they
  // are treated as version 0 until the runtime first advances them.
  version?: number | undefined;
  onFirstSubscriber?: (() => void) | undefined;
  onNoSubscribers?: (() => void) | undefined;
  /** Returns false when a dormant source has stale dormant dependencies. */
  isCurrent?: ((context?: CurrentCheckContext) => boolean) | undefined;
  trackedBy?: ReactiveComputation | undefined;
  trackedVersion?: number | undefined;
  debugWriters?: Map<number, string> | undefined;
  /** The computed that publishes this source, so readers can flush its queued publish first. */
  publisher?: ReactiveComputation | undefined;
}

export interface ReactiveComputation {
  readonly id: number;
  readonly debugLabel?: string | undefined;
  deps: Set<Source>;
  orderedDeps?: Source[] | undefined;
  trackingAddedDeps?: Source | Source[] | undefined;
  trackingCount?: number | undefined;
  trackingOrderedIndex?: number | undefined;
  trackingOrderedMismatch?: boolean | undefined;
  trackingTouchedDeps?: Source[] | undefined;
  trackingVersion?: number | undefined;
  disposed: boolean;
  queued: boolean;
  markDirty(): void;
  run(): void;
  dispose(): void;
}

interface UntrackedDependency {
  ref: WeakRef<Source>;
  requiresCurrentCheckContext: boolean;
  version: number;
}

export interface CurrentCheckContext {
  // Memoizes only the recursive validity of a shared source for one traversal.
  // Each edge still compares its own snapshot version before this is consulted,
  // so one entry per source is enough and no per-version map is allocated.
  results: WeakMap<Source, boolean>;
}

export type Tracker = ReactiveComputation | null;

/**
 * Registers a disposer with an owning scope. An owner may return an unregister
 * handle so a manually stopped resource can drop its registration; any other
 * return value, including void, keeps the historical fire-and-forget contract.
 */
export type CleanupOwner = (dispose: () => void) => unknown;

export const runtimeState: {
  attachmentCheckContext: CurrentCheckContext | undefined;
  activeTracker: Tracker;
  batchDepth: number;
  cleanupOwner: CleanupOwner | undefined;
  flushingComputed: boolean;
  nextComputationId: number;
  notificationDepth: number;
  pendingComputed: Set<ReactiveComputation>;
} = {
  attachmentCheckContext: undefined,
  activeTracker: null,
  batchDepth: 0,
  cleanupOwner: undefined,
  flushingComputed: false,
  nextComputationId: 0,
  notificationDepth: 0,
  pendingComputed: new Set(),
};

export function sourceVersion(source: Source): number {
  return source.version ?? 0;
}

export function bumpSourceVersion(source: Source): void {
  source.version = (source.version ?? 0) + 1;
  invalidateAttachmentCheckContext();
}

/** Discards proofs when reentrant work changes the graph during attachment. */
export function invalidateAttachmentCheckContext(): void {
  const context = runtimeState.attachmentCheckContext;
  if (context !== undefined) context.results = new WeakMap();
}

export function createUntrackedDependency(source: Source): UntrackedDependency | undefined {
  return typeof WeakRef === "function"
    ? {
        ref: new WeakRef(source),
        requiresCurrentCheckContext: source.isCurrent !== undefined,
        version: sourceVersion(source),
      }
    : undefined;
}

export function createCurrentCheckContext(): CurrentCheckContext {
  return { results: new WeakMap() };
}

export function untrackedDependencyIsCurrent(
  dependency: UntrackedDependency,
  context?: CurrentCheckContext,
): boolean {
  const source = dependency.ref.deref();
  if (source === undefined) {
    return false;
  }

  if (sourceVersion(source) !== dependency.version) {
    return false;
  }

  const isCurrent = source.isCurrent;
  if (isCurrent === undefined) {
    return true;
  }

  if (context === undefined) {
    return isCurrent.call(source) !== false;
  }

  const cachedResult = context.results.get(source);
  if (cachedResult !== undefined) {
    return cachedResult;
  }

  const results = context.results;
  const current = isCurrent.call(source, context) !== false;
  // Reentrant invalidation replaces the map; write only into the map this check started with.
  results.set(source, current);
  return current;
}
