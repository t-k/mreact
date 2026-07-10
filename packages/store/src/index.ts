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

export interface StorePersistedState<T extends object> {
  readonly __mreactStorePersistedState: true;
  state: T;
  version: number;
}

export type StorePersistenceStatus = "hydrating" | "ready" | "error";

export interface StorePersistence<T extends object> {
  readonly error: ReadonlyCell<unknown | undefined>;
  readonly ready: Promise<void>;
  readonly status: ReadonlyCell<StorePersistenceStatus>;
}

/** Creates an unambiguous versioned persistence record for Store.load(). */
export function persistedStoreState<T extends object>(state: T, version: number): StorePersistedState<T> {
  return { __mreactStorePersistedState: true, state, version };
}

export interface StorePersistOptions<T extends object> {
  load?:
    | (() =>
        | StorePersistedState<T>
        | T
        | undefined
        | Promise<StorePersistedState<T> | T | undefined>)
    | undefined;
  migrate?: ((state: T, version: number | undefined) => T | Promise<T>) | undefined;
  save?: ((state: T) => void | Promise<void>) | undefined;
  version?: number | undefined;
}

export type StorePersist<T extends object> =
  | ((state: T) => void | Promise<void>)
  | StorePersistOptions<T>;

interface StoreListenerEntry<T extends object> {
  addedVersion: number;
  listener: StoreListener<T>;
  removedVersion?: number;
}

interface NormalizedPersistedState<T extends object> {
  state: T;
  version?: number | undefined;
}

/** Configures store instrumentation and persistence hooks. */
export interface StoreOptions<T extends object> {
  instrument?: ((event: StoreInstrumentationEvent<T>) => void) | undefined;
  persist?: StorePersist<T> | undefined;
}

/** Represents a selected reactive value that can be disposed manually. */
export interface SelectedCell<T> extends ReadonlyCell<T> {
  dispose(): void;
}

/** Provides reactive state access, updates, transactions, selectors, and subscriptions. */
export interface Store<T extends object> {
  readonly persistence: StorePersistence<T>;
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
  const persist = normalizePersistOptions(options.persist);
  const listeners = new Set<StoreListener<T>>();
  const listenerEntriesByListener = new Map<StoreListener<T>, StoreListenerEntry<T>>();
  let listenerEntries: Array<StoreListenerEntry<T>> = [];
  let listenerVersion = 0;
  let notificationDepth = 0;
  let removedListenerEntryCount = 0;
  let transactionDepth = 0;
  let stateRevision = 0;
  let transactionPrevious: T | undefined;
  let transactionChanged = false;
  let transactionType: StoreInstrumentationEvent<T>["type"] | undefined;
  let transactionMutationCount = 0;
  let persistSaveQueue: Promise<void> = Promise.resolve();
  let persistSaveQueued = false;
  let persistSavePendingState: T | undefined;
  const persistenceStatus = cell<StorePersistenceStatus>("hydrating");
  const persistenceError = cell<unknown | undefined>(undefined);

  const persistenceReady = hydratePersistedState();

  function readUntracked(): T {
    return untrack(() => state.get());
  }

  function commit(
    next: T,
    previous: T,
    type: StoreInstrumentationEvent<T>["type"],
    commitOptions: { persist?: boolean | undefined } = {},
  ): void {
    if (Object.is(next, previous)) {
      return;
    }

    if (transactionDepth > 0 && transactionPrevious === undefined) {
      transactionPrevious = previous;
    }

    state.set(next);
    stateRevision += 1;

    if (transactionDepth > 0) {
      transactionChanged = true;
      transactionMutationCount += 1;
      transactionType =
        transactionType === undefined || transactionType === type ? type : "transaction";
      return;
    }

    notify(next, previous, type, commitOptions);
  }

  function notify(
    next: T,
    previous: T,
    type: StoreInstrumentationEvent<T>["type"],
    notifyOptions: { persist?: boolean | undefined } = {},
  ): void {
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
    if (notifyOptions.persist !== false) {
      queuePersistSave(next);
    }
  }

  async function hydratePersistedState(): Promise<void> {
    try {
      const hydrationRevision = stateRevision;
      const loaded = await persist.load?.();
      if (loaded !== undefined) {
        const persisted = normalizePersistedState(loaded);
        const migrated =
          persist.migrate !== undefined &&
          persist.version !== undefined &&
          persisted.version !== persist.version
            ? await persist.migrate(persisted.state, persisted.version)
            : persisted.state;
        if (stateRevision === hydrationRevision) {
          commit(migrated, readUntracked(), "replace", { persist: false });
        }
      }
      persistenceStatus.set("ready");
    } catch (error) {
      persistenceError.set(error);
      persistenceStatus.set("error");
    }
  }

  function queuePersistSave(next: T): void {
    if (persist.save === undefined) {
      return;
    }

    if (persistSaveQueued) {
      persistSavePendingState = next;
      return;
    }
    persistSaveQueued = true;
    const first = next;
    persistSaveQueue = persistSaveQueue
      .catch(() => undefined)
      .then(async () => {
        await persist.save?.(first);
        await flushPersistSaveQueue();
      })
      .catch(async (error) => {
        persistenceError.set(error);
        persistenceStatus.set("error");
        await flushPersistSaveQueue();
      });
  }

  async function flushPersistSaveQueue(): Promise<void> {
    try {
      while (persistSavePendingState !== undefined) {
        const next = persistSavePendingState;
        persistSavePendingState = undefined;
        await persist.save?.(next);
      }
    } finally {
      persistSaveQueued = false;
      if (persistSavePendingState !== undefined) {
        queuePersistSave(persistSavePendingState);
      }
    }
  }

  function subscribeListener(listener: StoreListener<T>): () => void {
    let entry = listenerEntriesByListener.get(listener);
    if (!listeners.has(listener)) {
      listeners.add(listener);
      listenerVersion += 1;
      entry = { addedVersion: listenerVersion, listener };
      listenerEntriesByListener.set(listener, entry);
      listenerEntries.push(entry);
    }

    return () => {
      if (!listeners.delete(listener)) {
        return;
      }

      listenerVersion += 1;
      listenerEntriesByListener.delete(listener);
      if (entry !== undefined) {
        entry.removedVersion = listenerVersion;
        removedListenerEntryCount += 1;
      }
      compactListenerEntries();
    };
  }

  function compactListenerEntries(): void {
    if (
      notificationDepth > 0 ||
      removedListenerEntryCount === 0 ||
      removedListenerEntryCount < 128 ||
      removedListenerEntryCount * 2 <= listenerEntries.length
    ) {
      return;
    }

    listenerEntries = listenerEntries.filter((entry) => entry.removedVersion === undefined);
    removedListenerEntryCount = 0;
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
    persistence: { error: persistenceError, ready: persistenceReady, status: persistenceStatus },
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

function normalizePersistOptions<T extends object>(
  persist: StorePersist<T> | undefined,
): StorePersistOptions<T> {
  if (persist === undefined) {
    return {};
  }

  return typeof persist === "function" ? { save: persist } : persist;
}

function normalizePersistedState<T extends object>(
  value: StorePersistedState<T> | T,
): NormalizedPersistedState<T> {
  return isPersistedStateDescriptor(value) ? value : { state: value };
}

function isPersistedStateDescriptor<T extends object>(
  value: StorePersistedState<T> | T,
): value is StorePersistedState<T> {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { __mreactStorePersistedState?: unknown }).__mreactStorePersistedState === true &&
    "version" in value &&
    "state" in value &&
    isObject((value as { state: unknown }).state)
  );
}

function isDangerousObjectKey(key: PropertyKey): boolean {
  return key === "__proto__" || key === "constructor" || key === "prototype";
}

function isObject(value: unknown): value is object {
  return typeof value === "object" && value !== null;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);

  return prototype === Object.prototype || prototype === null;
}
