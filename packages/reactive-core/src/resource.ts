import { cell } from "./cell.js";
import { registerCleanup } from "./cleanup-scope.js";
import type { Cell, ReadonlyCell } from "./types.js";

/** The latest value from a continuous external subscription, or its initial state. */
export type ResourceState<T> =
  | { readonly status: "pending" }
  | { readonly status: "ready"; readonly value: T };

/** A single observer of a keyed external subscription. */
export interface ResourceLease<TKey, TValue> {
  readonly state: ReadonlyCell<ResourceState<TValue>>;
  setKey(key: TKey): void;
  dispose(): void;
}

/** A factory that shares one external subscription for each active key. */
export interface Resource<TKey, TValue> {
  observe(key: TKey): ResourceLease<TKey, TValue>;
}

interface Entry<TValue> {
  active: boolean;
  dispose: (() => void) | undefined;
  leases: Set<Cell<ResourceState<TValue>>>;
  state: ResourceState<TValue>;
}

const pending = { status: "pending" } as const;

function sameKey<T>(left: T, right: T): boolean {
  return left === right || (left !== left && right !== right);
}

/** Creates an opt-in, latest-value resource. Keys use Map identity and equality. */
export function createResource<TKey, TValue>(
  subscribe: (key: TKey, emit: (value: TValue) => void) => () => void,
): Resource<TKey, TValue> {
  const entries = new Map<TKey, Entry<TValue>>();

  function attach(key: TKey, state: Cell<ResourceState<TValue>>): Entry<TValue> {
    let entry = entries.get(key);
    if (entry !== undefined) {
      entry.leases.add(state);
      state.setValue(entry.state);
      return entry;
    }

    entry = {
      active: true,
      dispose: undefined,
      leases: new Set([state]),
      state: pending,
    };
    entries.set(key, entry);
    const current = entry;
    try {
      current.dispose = subscribe(key, (value) => {
        if (!current.active) return;
        const next: ResourceState<TValue> = { status: "ready", value };
        current.state = next;
        for (const leaseState of current.leases) leaseState.setValue(next);
      });
    } catch (error) {
      current.active = false;
      entries.delete(key);
      current.leases.clear();
      state.setValue(pending);
      throw error;
    }
    return current;
  }

  function release(key: TKey, entry: Entry<TValue>, state: Cell<ResourceState<TValue>>): void {
    entry.leases.delete(state);
    if (entry.leases.size !== 0) return;
    entry.active = false;
    if (entries.get(key) === entry) entries.delete(key);
    entry.dispose?.();
  }

  return {
    observe(key) {
      const state = cell<ResourceState<TValue>>(pending);
      const readonlyState: ReadonlyCell<ResourceState<TValue>> = { get: () => state.get() };
      let currentKey = key;
      let currentEntry: Entry<TValue> | undefined = attach(key, state);
      let disposed = false;
      let unregister: (() => void) | undefined;

      const dispose = (): void => {
        if (disposed) return;
        disposed = true;
        const currentUnregister = unregister;
        unregister = undefined;
        currentUnregister?.();
        const previous = currentEntry;
        currentEntry = undefined;
        if (previous !== undefined) release(currentKey, previous, state);
      };

      const registration = registerCleanup(dispose);
      if (disposed) registration?.();
      else unregister = registration;

      return {
        state: readonlyState,
        setKey(nextKey) {
          if (disposed || (currentEntry?.active === true && sameKey(currentKey, nextKey))) return;
          const previous = currentEntry;
          currentEntry = undefined;
          state.setValue(pending);
          if (previous !== undefined) release(currentKey, previous, state);
          currentKey = nextKey;
          currentEntry = attach(nextKey, state);
        },
        dispose,
      };
    },
  };
}
