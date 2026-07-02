import { cell, untrack, type ReadonlyCell } from "@reckona/mreact-reactive-core";
import { registerCleanup } from "@reckona/mreact-reactive-core/internal";
import { emitStoreDevtoolsEvent } from "./devtools.js";

/** Receives the next and previous store state after a committed change. */
export type StoreListener<T extends object> = (state: T, previous: T) => void;

/** Represents a partial object patch applied to store state. */
export type StorePatch<T extends object> = Partial<T>;

/** Provides either a patch object or a patch-producing updater callback. */
export type StoreSetter<T extends object> = StorePatch<T> | ((previous: T) => StorePatch<T> | T);

/** Provides either a replacement object or a replacement-producing updater callback. */
export type StoreReplacer<T extends object> = T | ((previous: T) => T);

/** Compares selected store values to decide whether subscribers should update. */
export type StoreEquality<T> = (left: T, right: T) => boolean;

/** Describes one store instrumentation event emitted after a state change. */
export interface StoreInstrumentationEvent<T extends object> {
  previous: T;
  state: T;
  type: "replace" | "set" | "transaction";
}

interface StoreListenerEntry<T extends object> {
  addedVersion: number;
  listener: StoreListener<T>;
  removedVersion?: number;
}

/** Configures store instrumentation and persistence hooks. */
export interface StoreOptions<T extends object> {
  instrument?: ((event: StoreInstrumentationEvent<T>) => void) | undefined;
  persist?: ((state: T) => void | Promise<void>) | undefined;
}

/** Represents a selected reactive value that can be disposed manually. */
export interface SelectedCell<T> extends ReadonlyCell<T> {
  dispose(): void;
}

/** Provides reactive state access, updates, transactions, selectors, and subscriptions. */
export interface Store<T extends object> {
  readonly state: ReadonlyCell<T>;
  get(): T;
  set(next: StoreSetter<T>): void;
  replace(next: StoreReplacer<T>): void;
  transaction(fn: () => void): void;
  update(updater: (previous: T) => StorePatch<T> | T): void;
  select<U>(selector: (state: T) => U, equality?: StoreEquality<U>): SelectedCell<U>;
  subscribe(listener: StoreListener<T>): () => void;
}

/**
 * Creates a reactive object store with patch updates, replacement, transactions, selectors, subscriptions, and optional instrumentation.
 *
 * The store keeps state in a `ReadonlyCell`; selectors should be disposed when their consumer scope ends.
 */
export function createStore<T extends object>(initial: T, options: StoreOptions<T> = {}): Store<T> {
  const state = cell(initial);
  const listeners = new Set<StoreListener<T>>();
  let listenerEntries: Array<StoreListenerEntry<T>> = [];
  let listenerVersion = 0;
  let notificationDepth = 0;
  let transactionDepth = 0;
  let transactionPrevious: T | undefined;
  let transactionChanged = false;
  let transactionType: StoreInstrumentationEvent<T>["type"] | undefined;
  let transactionMutationCount = 0;

  function readUntracked(): T {
    return untrack(() => state.get());
  }

  function commit(next: T, previous: T, type: StoreInstrumentationEvent<T>["type"]): void {
    if (Object.is(next, previous)) {
      return;
    }

    if (transactionDepth > 0 && transactionPrevious === undefined) {
      transactionPrevious = previous;
    }

    state.set(next);

    if (transactionDepth > 0) {
      transactionChanged = true;
      transactionMutationCount += 1;
      transactionType =
        transactionType === undefined || transactionType === type ? type : "transaction";
      return;
    }

    notify(next, previous, type);
  }

  function notify(next: T, previous: T, type: StoreInstrumentationEvent<T>["type"]): void {
    const notifyVersion = listenerVersion;
    const notifyLength = listenerEntries.length;
    notificationDepth += 1;

    try {
      for (let index = 0; index < notifyLength; index += 1) {
        const entry = listenerEntries[index];

        if (
          entry !== undefined &&
          entry.addedVersion <= notifyVersion &&
          (entry.removedVersion === undefined || entry.removedVersion > notifyVersion)
        ) {
          entry.listener(next, previous);
        }
      }
    } finally {
      notificationDepth -= 1;
      compactListenerEntries();
    }

    options.instrument?.({
      previous,
      state: next,
      type,
    });
    emitStoreDevtoolsEvent({
      previous,
      state: next,
      type: `store:${type}`,
    });
    void options.persist?.(next);
  }

  function subscribeListener(listener: StoreListener<T>): () => void {
    if (!listeners.has(listener)) {
      listeners.add(listener);
      listenerVersion += 1;
      listenerEntries.push({ addedVersion: listenerVersion, listener });
    }

    return () => {
      if (!listeners.delete(listener)) {
        return;
      }

      listenerVersion += 1;
      const entry = findActiveListenerEntry(listener);
      if (entry !== undefined) {
        entry.removedVersion = listenerVersion;
      }
      compactListenerEntries();
    };
  }

  function findActiveListenerEntry(listener: StoreListener<T>): StoreListenerEntry<T> | undefined {
    for (let index = listenerEntries.length - 1; index >= 0; index -= 1) {
      const entry = listenerEntries[index];
      if (entry?.listener === listener && entry.removedVersion === undefined) {
        return entry;
      }
    }
    return undefined;
  }

  function compactListenerEntries(): void {
    if (notificationDepth > 0 || listenerEntries.length === listeners.size) {
      return;
    }

    listenerEntries = listenerEntries.filter((entry) => entry.removedVersion === undefined);
  }

  function set(next: StoreSetter<T>): void {
    const previous = readUntracked();
    const patch = typeof next === "function" ? next(previous) : next;
    commit(mergePatch(previous, patch), previous, "set");
  }

  function replace(next: StoreReplacer<T>): void {
    const previous = readUntracked();
    const resolved = typeof next === "function" ? next(previous) : next;
    commit(resolved, previous, "replace");
  }

  function transaction(fn: () => void): void {
    const rootTransaction = transactionDepth === 0;
    let thrown: unknown;
    let didThrow = false;
    transactionDepth += 1;

    try {
      fn();
    } catch (error) {
      didThrow = true;
      thrown = error;
    } finally {
      transactionDepth -= 1;

      if (didThrow && rootTransaction && transactionPrevious !== undefined) {
        state.set(transactionPrevious);
      }

      if (transactionDepth === 0) {
        const previous = transactionPrevious;
        const type =
          transactionMutationCount === 1 ? (transactionType ?? "transaction") : "transaction";
        transactionPrevious = undefined;
        transactionType = undefined;
        transactionMutationCount = 0;

        if (transactionChanged && previous !== undefined && !didThrow) {
          notify(readUntracked(), previous, type);
        }
        transactionChanged = false;
      }
    }

    if (didThrow) {
      throw thrown;
    }
  }

  return {
    state,
    get: () => state.get(),
    set,
    replace,
    transaction,
    update: set,
    select: (selector, equality = Object.is) =>
      createSelectedCell(readUntracked(), subscribeListener, selector, equality),
    subscribe: subscribeListener,
  };
}

/**
 * Creates a factory for per-request stores from an initial-state callback.
 *
 * Use this when SSR or server actions need isolated store instances instead of sharing process-global state.
 */
export function createRequestStoreFactory<T extends object>(
  initial: () => T,
  options?: StoreOptions<T> | undefined,
): () => Store<T> {
  return () => createStore(initial(), options);
}

/**
 * Compares two plain objects by own enumerable keys with `Object.is` value equality.
 */
export function shallowEqual<T>(left: T, right: T): boolean {
  if (Object.is(left, right)) {
    return true;
  }

  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) && Array.isArray(right) && compareOwnEnumerableValues(left, right);
  }

  if (!isPlainObject(left) || !isPlainObject(right)) {
    return false;
  }

  if (Object.getPrototypeOf(left) !== Object.getPrototypeOf(right)) {
    return false;
  }

  return compareOwnEnumerableValues(left, right);
}

function compareOwnEnumerableValues(left: object, right: object): boolean {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);

  if (leftKeys.length !== rightKeys.length) {
    return false;
  }

  return leftKeys.every((key) =>
    Object.is((left as Record<string, unknown>)[key], (right as Record<string, unknown>)[key]),
  );
}

function createSelectedCell<T extends object, U>(
  initial: T,
  subscribe: (listener: StoreListener<T>) => () => void,
  selector: (state: T) => U,
  equality: StoreEquality<U>,
): SelectedCell<U> {
  let selected = selector(initial);
  const selectedCell = cell(selected);
  let disposed = false;

  const listener = (nextState: T) => {
    if (disposed) {
      return;
    }

    const nextSelected = selector(nextState);

    if (!equality(selected, nextSelected)) {
      selected = nextSelected;
      selectedCell.set(nextSelected);
    }
  };
  const dispose = () => {
    if (disposed) {
      return;
    }

    disposed = true;
    unsubscribe();
  };

  const unsubscribe = subscribe(listener);
  registerCleanup(dispose);

  return {
    dispose,
    get: () => selectedCell.get(),
  };
}

function mergePatch<T extends object>(previous: T, patch: StorePatch<T> | T): T {
  let changed = false;
  const next = { ...previous };

  for (const key of Object.keys(patch) as Array<keyof T>) {
    if (isDangerousObjectKey(key)) {
      continue;
    }

    const value = patch[key];

    if (!Object.is(next[key], value)) {
      next[key] = value as T[keyof T];
      changed = true;
    }
  }

  return changed ? (next as T) : previous;
}

function isDangerousObjectKey(key: PropertyKey): boolean {
  return key === "__proto__" || key === "constructor" || key === "prototype";
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);

  return prototype === Object.prototype || prototype === null;
}
