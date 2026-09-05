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

export type ThenableLike = { then: (...args: never[]) => unknown };
export type RejectThenable<T> = [T] extends [never]
  ? []
  : [Extract<T, ThenableLike>] extends [never]
    ? []
    : [error: never];

/** Compares selected store values to decide whether subscribers should update. */
export type StoreEquality<T> = (left: T, right: T) => boolean;

/** Recursively readonly view used by Store.view without cloning ordinary reads. */
export type ReadonlyStoreValue<T> = T extends (...args: never[]) => unknown
  ? T
  : T extends Date
    ? Readonly<T>
    : T extends RegExp
      ? Readonly<T>
      : T extends Map<infer TKey, infer TValue>
        ? ReadonlyMap<ReadonlyStoreValue<TKey>, ReadonlyStoreValue<TValue>>
        : T extends Set<infer TValue>
          ? ReadonlySet<ReadonlyStoreValue<TValue>>
          : T extends readonly unknown[]
            ? { readonly [TKey in keyof T]: ReadonlyStoreValue<T[TKey]> }
            : T extends object
              ? { readonly [TKey in keyof T]: ReadonlyStoreValue<T[TKey]> }
              : T;

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

/** Represents the deprecated untagged persistence envelope accepted only with explicit opt-in. */
export interface LegacyStorePersistedState<T extends object> {
  state: T;
  version: number;
}

export type StorePersistenceStatus = "hydrating" | "ready" | "error";

/** Identifies the persistence operation that failed. */
export type StorePersistenceFailurePhase = "load" | "migrate" | "save";

/** Describes an observable persistence failure. */
export interface StorePersistenceFailure {
  error: unknown;
  phase: StorePersistenceFailurePhase;
}

export interface StorePersistence<T extends object> {
  readonly error: ReadonlyCell<StorePersistenceFailure | undefined>;
  readonly ready: Promise<void>;
  readonly status: ReadonlyCell<StorePersistenceStatus>;
}

/** Creates an unambiguous versioned persistence record for Store.load(). */
export function persistedStoreState<T extends object>(state: T, version: number): StorePersistedState<T> {
  return { __mreactStorePersistedState: true, state, version };
}

/** Configures persistence behavior shared by current and legacy record contracts. */
export interface StorePersistBaseOptions<T extends object, TPersisted extends object = T> {
  /** Chooses how a loaded value interacts with local commits made during hydration. */
  hydrationConflict?: StoreHydrationConflict<T> | undefined;
  /** Validates the historical state before a migration receives it. */
  validate?: ((state: unknown, version: number | undefined) => boolean) | undefined;
  /** Validates the current state produced by a migration or current-version load. */
  validateCurrent?: ((state: unknown) => state is T) | undefined;
  /** Migrates a loaded historical state from its saved version to the configured version. */
  migrate?: ((state: TPersisted, version: number | undefined) => T | Promise<T>) | undefined;
  /** Persists committed state changes in queue order. */
  save?: ((state: T) => void | Promise<void>) | undefined;
  /** Declares the current persistence schema version. */
  version?: number | undefined;
}

/** Configures raw or tagged persistence records without legacy envelope inference. */
export interface StoreCurrentPersistOptions<T extends object, TPersisted extends object = T>
  extends StorePersistBaseOptions<T, TPersisted> {
  acceptLegacyPersistedState?: false | undefined;
  load?:
    | (() =>
        | StorePersistedState<TPersisted>
        | TPersisted
        | undefined
        | Promise<StorePersistedState<TPersisted> | TPersisted | undefined>)
    | undefined;
}

/** Configures persistence with explicit support for deprecated untagged envelopes. */
export interface StoreLegacyPersistOptions<T extends object, TPersisted extends object = T>
  extends StorePersistBaseOptions<T, TPersisted> {
  acceptLegacyPersistedState: true;
  load?:
    | (() =>
        | LegacyStorePersistedState<TPersisted>
        | StorePersistedState<TPersisted>
        | TPersisted
        | undefined
        | Promise<LegacyStorePersistedState<TPersisted> | StorePersistedState<TPersisted> | TPersisted | undefined>)
    | undefined;
}

/** Configures store persistence with an explicit current or legacy record contract. */
export type StorePersistOptions<T extends object, TPersisted extends object = T> =
  | StoreCurrentPersistOptions<T, TPersisted>
  | StoreLegacyPersistOptions<T, TPersisted>;

/** Controls how hydration resolves a loaded value after local state has changed. */
export type StoreHydrationConflict<T extends object> =
  | "merge"
  | "preserve-local"
  | "replace"
  | ((loaded: T, current: T) => T);

export type StorePersist<T extends object, TPersisted extends object = T> =
  | ((state: T) => void | Promise<void>)
  | StorePersistOptions<T, TPersisted>;

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
export interface StoreOptions<T extends object, TPersisted extends object = T> {
  instrument?: ((event: StoreInstrumentationEvent<T>) => void) | undefined;
  persist?: StorePersist<T, TPersisted> | undefined;
}

/** Represents a selected reactive value that can be disposed manually. */
export interface SelectedCell<T> extends ReadonlyCell<T> {
  dispose(): void;
}

/** Provides readonly, reference-stable reads and explicit snapshots for a Store. */
export interface ReadonlyStore<T extends object> {
  readonly state: ReadonlyCell<ReadonlyStoreValue<T>>;
  get(): ReadonlyStoreValue<T>;
  snapshot(): T;
  select<U>(
    selector: (state: ReadonlyStoreValue<T>) => U,
    equality?: StoreEquality<U>,
  ): SelectedCell<U>;
  subscribe(
    listener: (state: ReadonlyStoreValue<T>, previous: ReadonlyStoreValue<T>) => void,
  ): () => void;
}

/** Provides reactive state access, updates, transactions, selectors, and subscriptions. */
export interface Store<T extends object> {
  readonly persistence: StorePersistence<T>;
  readonly state: ReadonlyCell<T>;
  readonly view: ReadonlyStore<T>;
  get(): T;
  snapshot(): T;
  set(next: StoreSetter<T>): void;
  replace(next: StoreReplacer<T>): void;
  transaction<TResult>(fn: () => TResult, ...error: RejectThenable<TResult>): void;
  update(updater: (previous: T) => StorePatch<T> | T): void;
  select<U>(selector: (state: T) => U, equality?: StoreEquality<U>): SelectedCell<U>;
  subscribe(listener: StoreListener<T>): () => void;
}

/**
 * Creates a reactive object store with patch updates, replacement, transactions, selectors, subscriptions, and optional instrumentation.
 *
 * The store keeps state in a `ReadonlyCell`; selectors should be disposed when their consumer scope ends.
 */
export function createStore<T extends object, TPersisted extends object = T>(
  initial: T,
  options: StoreOptions<T, TPersisted> = {},
): Store<T> {
  const state = cell(initial);
  const persist = normalizePersistOptions<T, TPersisted>(options.persist);
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
  let transactionThenableError: TypeError | undefined;
  let persistSaveQueue: Promise<void> = Promise.resolve();
  let persistSaveQueued = false;
  let persistSavePendingState: T | undefined;
  const persistenceStatus = cell<StorePersistenceStatus>("hydrating");
  const persistenceError = cell<StorePersistenceFailure | undefined>(undefined);

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
        const persisted = normalizePersistedState<TPersisted>(
          loaded,
          persist.acceptLegacyPersistedState === true,
        );
        if (!isObject(persisted.state)) {
          throw new TypeError("Store persistence loaded state must be an object.");
        }
        if (persist.validate !== undefined && !persist.validate(persisted.state, persisted.version)) {
          throw new TypeError("Store persistence validation rejected the loaded state.");
        }

        let migrated = persisted.state as unknown as T;
        const versionMismatch =
          persist.version !== undefined && persisted.version !== persist.version;

        if (versionMismatch && persist.migrate === undefined) {
          throw new Error(
            `Store persistence version ${String(persisted.version)} requires a migration to version ${persist.version}.`,
          );
        }

        if (versionMismatch && persist.migrate !== undefined) {
          try {
            migrated = await persist.migrate(persisted.state, persisted.version);
          } catch (error) {
            recordPersistenceFailure("migrate", error);
            return;
          }
        }

        if (persist.validateCurrent !== undefined && !persist.validateCurrent(migrated)) {
          const error = new TypeError("Store persistence validation rejected the current state.");
          recordPersistenceFailure(versionMismatch ? "migrate" : "load", error);
          return;
        }

        const current = readUntracked();
        const hydrated = resolveHydrationConflict(
          persist.hydrationConflict,
          migrated,
          current,
          stateRevision === hydrationRevision,
        );
        if (!Object.is(hydrated, current)) {
          commit(hydrated, current, "replace", { persist: false });
        }
      }
      if (persistenceError.get() === undefined) {
        persistenceStatus.set("ready");
      }
    } catch (error) {
      recordPersistenceFailure("load", error);
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
    persistSaveQueue = persistSaveQueue
      .catch(() => undefined)
      .then(() => flushPersistSaveQueue(next));
  }

  function recordPersistenceFailure(phase: StorePersistenceFailurePhase, error: unknown): void {
    persistenceError.set({ error, phase });
    persistenceStatus.set("error");
  }

  async function flushPersistSaveQueue(first: T): Promise<void> {
    let next: T | undefined = first;

    while (next !== undefined) {
      try {
        await persist.save?.(next);
      } catch (error) {
        recordPersistenceFailure("save", error);
      }

      next = persistSavePendingState;
      persistSavePendingState = undefined;
    }

    persistSaveQueued = false;
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

  function transaction<TResult>(fn: () => TResult, ..._error: RejectThenable<TResult>): void {
    const rootTransaction = transactionDepth === 0;
    let thrown: unknown;
    let didThrow = false;
    transactionDepth += 1;

    try {
      const result = fn();
      if (isThenable(result)) {
        const error = new TypeError(
          "Store.transaction() callbacks must be synchronous; await outside the transaction.",
        );
        transactionThenableError ??= error;
        throw error;
      }
    } catch (error) {
      didThrow = true;
      thrown = error;
    } finally {
      transactionDepth -= 1;

      if (
        rootTransaction &&
        (didThrow || transactionThenableError !== undefined) &&
        transactionPrevious !== undefined
      ) {
        state.set(transactionPrevious);
      }

      if (transactionDepth === 0) {
        const previous = transactionPrevious;
        const type =
          transactionMutationCount === 1 ? (transactionType ?? "transaction") : "transaction";
        const thenableError = transactionThenableError;
        transactionPrevious = undefined;
        transactionType = undefined;
        transactionMutationCount = 0;
        transactionThenableError = undefined;

        if (
          transactionChanged &&
          previous !== undefined &&
          !didThrow &&
          thenableError === undefined
        ) {
          notify(readUntracked(), previous, type);
        }
        transactionChanged = false;

        if (thenableError !== undefined && !didThrow) {
          thrown = thenableError;
          didThrow = true;
        }
      }
    }

    if (didThrow) {
      throw thrown;
    }
  }

  const view: ReadonlyStore<T> = {
    state: state as unknown as ReadonlyCell<ReadonlyStoreValue<T>>,
    get: () => state.get() as ReadonlyStoreValue<T>,
    snapshot: () => snapshotStoreValue(readUntracked()),
    select<U>(selector: (value: ReadonlyStoreValue<T>) => U, equality = Object.is) {
      return createSelectedCell(
        readUntracked(),
        subscribeListener,
        selector as (value: T) => U,
        equality,
      );
    },
    subscribe(listener) {
      return subscribeListener((next, previous) => {
        listener(next as ReadonlyStoreValue<T>, previous as ReadonlyStoreValue<T>);
      });
    },
  };

  return {
    persistence: { error: persistenceError, ready: persistenceReady, status: persistenceStatus },
    state,
    view,
    get: () => state.get(),
    snapshot: () => snapshotStoreValue(readUntracked()),
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
export function createRequestStoreFactory<T extends object, TPersisted extends object = T>(
  initial: () => T,
  options?: StoreOptions<T, TPersisted> | undefined,
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

/** Creates an independent supported-value snapshot without cloning ordinary Store reads. */
export function snapshotStoreValue<T>(value: T): T {
  return cloneSnapshotValue(value, new WeakMap<object, unknown>()) as T;
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
      selectedCell.set(() => nextSelected);
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

function normalizePersistOptions<T extends object, TPersisted extends object = T>(
  persist: StorePersist<T, TPersisted> | undefined,
): StorePersistOptions<T, TPersisted> {
  if (persist === undefined) {
    return {};
  }

  return typeof persist === "function" ? { save: persist } : persist;
}

function normalizePersistedState<T extends object>(
  value: unknown,
  acceptLegacyPersistedState: boolean,
): NormalizedPersistedState<T> {
  if (
    isPersistedStateDescriptor(value) ||
    (acceptLegacyPersistedState && isLegacyPersistedStateDescriptor(value))
  ) {
    return value as NormalizedPersistedState<T>;
  }

  return { state: value as T };
}

function isPersistedStateDescriptor<T extends object>(
  value: unknown,
): value is StorePersistedState<T> {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { __mreactStorePersistedState?: unknown }).__mreactStorePersistedState === true &&
    typeof (value as { version?: unknown }).version === "number" &&
    isObject((value as { state: unknown }).state) &&
    Object.keys(value).every(
      (key) => key === "__mreactStorePersistedState" || key === "state" || key === "version",
    )
  );
}

function isLegacyPersistedStateDescriptor<T extends object>(
  value: unknown,
): boolean {
  if (
    typeof value !== "object" ||
    value === null ||
    !isObject((value as { state?: unknown }).state) ||
    typeof (value as { version?: unknown }).version !== "number"
  ) {
    return false;
  }

  return Object.keys(value).every((key) => key === "state" || key === "version");
}

function resolveHydrationConflict<T extends object>(
  conflict: StoreHydrationConflict<T> | undefined,
  loaded: T,
  current: T,
  hasNoLocalCommit: boolean,
): T {
  if (hasNoLocalCommit) {
    return loaded;
  }

  if (conflict === "replace") {
    return loaded;
  }

  if (conflict === "merge") {
    return { ...loaded, ...current };
  }

  return typeof conflict === "function" ? conflict(loaded, current) : current;
}

function isDangerousObjectKey(key: PropertyKey): boolean {
  return key === "__proto__" || key === "constructor" || key === "prototype";
}

function isObject(value: unknown): value is object {
  return typeof value === "object" && value !== null;
}

function isThenable(value: unknown): value is ThenableLike {
  if ((typeof value !== "object" || value === null) && typeof value !== "function") {
    return false;
  }

  return typeof (value as { then?: unknown }).then === "function";
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);

  return prototype === Object.prototype || prototype === null;
}

function cloneSnapshotValue(value: unknown, seen: WeakMap<object, unknown>): unknown {
  if (value === null || typeof value !== "object") {
    return value;
  }

  const existing = seen.get(value);
  if (existing !== undefined) {
    return existing;
  }

  if (value instanceof Date) {
    return new Date(value.getTime());
  }
  if (value instanceof RegExp) {
    return new RegExp(value.source, value.flags);
  }
  if (value instanceof WeakMap || value instanceof WeakSet || value instanceof Promise) {
    throw new TypeError("Store snapshots do not support weak collections or Promise values.");
  }
  if (value instanceof Map) {
    const copy = new Map<unknown, unknown>();
    seen.set(value, copy);
    for (const [key, entry] of value) {
      copy.set(cloneSnapshotValue(key, seen), cloneSnapshotValue(entry, seen));
    }
    return copy;
  }
  if (value instanceof Set) {
    const copy = new Set<unknown>();
    seen.set(value, copy);
    for (const entry of value) {
      copy.add(cloneSnapshotValue(entry, seen));
    }
    return copy;
  }
  if (Array.isArray(value)) {
    const copy: unknown[] = [];
    seen.set(value, copy);
    for (const entry of value) {
      copy.push(cloneSnapshotValue(entry, seen));
    }
    return copy;
  }

  if (value instanceof ArrayBuffer) {
    return value.slice(0);
  }

  if (ArrayBuffer.isView(value)) {
    if (value instanceof DataView) {
      const buffer = value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength);
      return new DataView(buffer);
    }

    const constructor = value.constructor as {
      from?: (source: ArrayLike<number>) => unknown;
    };
    if (typeof constructor.from !== "function") {
      throw new TypeError("Store snapshots do not support this typed array value.");
    }
    return constructor.from(value as unknown as ArrayLike<number>);
  }

  if (!isPlainObject(value)) {
    throw new TypeError("Store snapshots do not support arbitrary class instances.");
  }

  const copy = Object.create(Object.getPrototypeOf(value)) as Record<PropertyKey, unknown>;
  seen.set(value, copy);
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor?.enumerable !== true || !("value" in descriptor)) {
      continue;
    }
    Object.defineProperty(copy, key, {
      configurable: descriptor.configurable === true,
      enumerable: true,
      value: cloneSnapshotValue(descriptor.value, seen),
      writable: descriptor.writable === true,
    });
  }
  return copy;
}
