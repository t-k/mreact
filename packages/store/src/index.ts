import { cell, untrack, type ReadonlyCell } from "@modular-react/reactive-core";
import { emitStoreDevtoolsEvent } from "./devtools.js";

export type StoreListener<T extends object> = (state: T, previous: T) => void;
export type StorePatch<T extends object> = Partial<T>;
export type StoreSetter<T extends object> = StorePatch<T> | ((previous: T) => StorePatch<T> | T);
export type StoreReplacer<T extends object> = T | ((previous: T) => T);
export type StoreEquality<T> = (left: T, right: T) => boolean;

export interface StoreInstrumentationEvent<T extends object> {
  previous: T;
  state: T;
  type: "replace" | "set" | "transaction";
}

export interface StoreOptions<T extends object> {
  instrument?: ((event: StoreInstrumentationEvent<T>) => void) | undefined;
  persist?: ((state: T) => void | Promise<void>) | undefined;
}

export interface Store<T extends object> {
  readonly state: ReadonlyCell<T>;
  get(): T;
  set(next: StoreSetter<T>): void;
  replace(next: StoreReplacer<T>): void;
  transaction(fn: () => void): void;
  update(updater: (previous: T) => StorePatch<T> | T): void;
  select<U>(selector: (state: T) => U, equality?: StoreEquality<U>): ReadonlyCell<U>;
  subscribe(listener: StoreListener<T>): () => void;
}

export function createStore<T extends object>(initial: T, options: StoreOptions<T> = {}): Store<T> {
  const state = cell(initial);
  const listeners = new Set<StoreListener<T>>();
  let transactionDepth = 0;
  let transactionPrevious: T | undefined;
  let transactionChanged = false;

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
      return;
    }

    notify(next, previous, type);
  }

  function notify(next: T, previous: T, type: StoreInstrumentationEvent<T>["type"]): void {
    for (const listener of Array.from(listeners)) {
      listener(next, previous);
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
    transactionDepth += 1;

    try {
      fn();
    } finally {
      transactionDepth -= 1;

      if (transactionDepth === 0) {
        const previous = transactionPrevious;
        transactionPrevious = undefined;

        if (transactionChanged && previous !== undefined) {
          transactionChanged = false;
          notify(readUntracked(), previous, "transaction");
        }
      }
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
      createSelectedCell(readUntracked(), listeners, selector, equality),
    subscribe: (listener) => {
      listeners.add(listener);

      return () => {
        listeners.delete(listener);
      };
    },
  };
}

export function createRequestStoreFactory<T extends object>(
  initial: () => T,
  options?: StoreOptions<T> | undefined,
): () => Store<T> {
  return () => createStore(initial(), options);
}

export function shallowEqual<T>(left: T, right: T): boolean {
  if (Object.is(left, right)) {
    return true;
  }

  if (!isPlainObject(left) || !isPlainObject(right)) {
    return false;
  }

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
  listeners: Set<StoreListener<T>>,
  selector: (state: T) => U,
  equality: StoreEquality<U>,
): ReadonlyCell<U> {
  let selected = selector(initial);
  const selectedCell = cell(selected);

  listeners.add((nextState) => {
    const nextSelected = selector(nextState);

    if (!equality(selected, nextSelected)) {
      selected = nextSelected;
      selectedCell.set(nextSelected);
    }
  });

  return selectedCell;
}

function mergePatch<T extends object>(previous: T, patch: StorePatch<T> | T): T {
  let changed = false;
  const next = { ...previous };

  for (const key of Object.keys(patch) as Array<keyof T>) {
    const value = patch[key];

    if (!Object.is(next[key], value)) {
      next[key] = value as T[keyof T];
      changed = true;
    }
  }

  return changed ? (next as T) : previous;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
