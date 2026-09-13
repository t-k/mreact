import { runtimeState, type SetupTrackingFrame, type Source } from "./state.js";
import { trackSource } from "./tracking.js";

/**
 * Runs compiled component setup while deferring its dependencies to the active owner.
 * Sources changed by the same synchronous setup are excluded to prevent self-triggered loops.
 */
export function runWithSetupTracking<TArgument, TResult>(
  setup: (argument: TArgument) => TResult,
  argument: TArgument,
): TResult {
  const owner = runtimeState.activeTracker;

  if (owner === null || owner.disposed) {
    return setup(argument);
  }

  const parent = runtimeState.setupTrackingFrame;
  const frame: SetupTrackingFrame = {
    owner,
    parent,
    reads: undefined,
    writes: undefined,
  };
  runtimeState.setupTrackingFrame = frame;

  let completed = false;
  try {
    const result = setup(argument);
    completed = true;
    return result;
  } finally {
    runtimeState.setupTrackingFrame = parent;

    if (completed && frame.reads !== undefined) {
      if (frame.writes === undefined) {
        for (const source of frame.reads) trackSource(source);
      } else {
        replaySetupReads(frame.reads, frame.writes);
      }
    }
  }
}

function replaySetupReads(reads: Source[], writes: ReadonlySet<Source>): void {
  const dependenciesBySource = new Map<Source, Source[]>();
  const dependentsBySource = new Map<Source, Source[]>();
  const pending = [...reads];

  while (pending.length > 0) {
    const source = pending.pop()!;
    if (dependenciesBySource.has(source)) continue;

    const dependencies = setupDependenciesOf(source);
    dependenciesBySource.set(source, dependencies);
    for (const dependency of dependencies) {
      const dependents = dependentsBySource.get(dependency);
      if (dependents === undefined) {
        dependentsBySource.set(dependency, [source]);
      } else {
        dependents.push(source);
      }
      pending.push(dependency);
    }
  }

  const dependsOnWrite = new Set<Source>();
  pending.push(...writes);
  while (pending.length > 0) {
    const source = pending.pop()!;
    if (dependsOnWrite.has(source)) continue;
    dependsOnWrite.add(source);
    const dependents = dependentsBySource.get(source);
    if (dependents !== undefined) pending.push(...dependents);
  }

  const expanded = new Set<Source>();
  pending.push(...reads);
  while (pending.length > 0) {
    const source = pending.pop()!;
    if (expanded.has(source)) continue;
    expanded.add(source);
    if (!dependsOnWrite.has(source)) {
      trackSource(source);
      continue;
    }
    const dependencies = dependenciesBySource.get(source);
    pending.push(...dependencies!);
  }
}

function setupDependenciesOf(source: Source): Source[] {
  const setupDependencies = source.setupDependencies;
  if (setupDependencies !== undefined) {
    return [...setupDependencies.call(source)];
  }
  return [];
}

/** Records one changed source for every enclosing synchronous setup frame. */
export function recordSetupWrite(source: Source): void {
  let frame = runtimeState.setupTrackingFrame;

  while (frame !== undefined) {
    (frame.writes ??= new Set()).add(source);
    frame = frame.parent;
  }
}
