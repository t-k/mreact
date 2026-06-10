import type { Cell } from "./types.js";
import type { Source } from "./state.js";
import { notifySubscribers, trackSource } from "./tracking.js";

declare const __MREACT_CLIENT_DEVTOOLS__: boolean | undefined;

const clientDevtoolsDisabled =
  typeof __MREACT_CLIENT_DEVTOOLS__ !== "undefined" &&
  __MREACT_CLIENT_DEVTOOLS__ === false;

interface DevtoolsHook {
  emit?: ((event: Record<string, unknown>) => void) | undefined;
}

type GlobalWithDevtools = typeof globalThis & {
  __mreactDevtools?: DevtoolsHook | undefined;
};

// Write-path devtools cache: `undefined` = not sampled yet, `null` = sampled
// and absent, object = sampled and attached. The no-devtools write fast path
// is a single module-local null comparison instead of a globalThis property
// walk per write. A late attach is observed at the next batch or flush
// boundary (see invalidateDevtoolsWriteCache callers); a detach or hook swap
// is observed on the next write because the emit path revalidates identity.
let cachedDevtoolsHook: DevtoolsHook | null | undefined = clientDevtoolsDisabled
  ? null
  : undefined;

export function invalidateDevtoolsWriteCache(): void {
  if (!clientDevtoolsDisabled) {
    cachedDevtoolsHook = undefined;
  }
}

function resolveDevtoolsHook(): DevtoolsHook | null {
  const hook = (globalThis as GlobalWithDevtools).__mreactDevtools;
  const resolved = hook !== undefined && typeof hook.emit === "function" ? hook : null;
  cachedDevtoolsHook = resolved;
  return resolved;
}

function emitCellSetEvent<T>(source: Source, previous: T, value: T): void {
  // Cold path: only reached while a devtools hook is (or was) attached, or on
  // the first write after a cache invalidation. Revalidate against the live
  // global so a disposed or swapped hook never receives stale events.
  const live = (globalThis as GlobalWithDevtools).__mreactDevtools;
  const hook =
    cachedDevtoolsHook !== undefined && cachedDevtoolsHook === live
      ? cachedDevtoolsHook
      : resolveDevtoolsHook();

  if (hook === null) {
    return;
  }

  const emit = hook.emit;

  if (typeof emit !== "function") {
    return;
  }

  emit.call(hook, {
    package: "@reckona/mreact-reactive-core",
    previous,
    subscribers: source.subscribers.size,
    timestamp: Date.now(),
    type: "reactive:cell:set",
    value,
  });
}

interface CellState<T> {
  value: T;
  readonly source: Source;
}

// One shared write function keeps the hot store/notify sequence in a single
// optimizable function instead of a fresh fat closure per cell.
function writeCellValue<T>(state: CellState<T>, next: T | ((prev: T) => T)): void {
  const previous = state.value;
  const resolved =
    typeof next === "function" ? (next as (prev: T) => T)(previous) : next;

  if (Object.is(previous, resolved)) {
    return;
  }

  state.value = resolved;

  // clientDevtoolsDisabled folds to true under the client build define, which
  // makes this branch statically dead so bundlers drop the emit path (and its
  // globalThis.__mreactDevtools references) from production client bundles.
  if (!clientDevtoolsDisabled && cachedDevtoolsHook !== null) {
    emitCellSetEvent(state.source, previous, resolved);
  }

  if (state.source.hasSubscribers === true) {
    notifySubscribers(state.source);
  }
}

export function cell<T>(initial: T): Cell<T> {
  const state: CellState<T> = {
    source: {
      // Declared at creation so later flag writes reuse the same object shape.
      hasSubscribers: false,
      subscribers: new Set(),
    },
    value: initial,
  };

  return {
    get(): T {
      trackSource(state.source);
      return state.value;
    },
    set(next: T | ((prev: T) => T)): void {
      writeCellValue(state, next);
    },
  };
}
