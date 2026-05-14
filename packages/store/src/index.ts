import { cell, computed, untrack, type ReadonlyCell } from "@modular-react/reactive-core";

export type StoreListener<T extends object> = (state: T, previous: T) => void;
export type StorePatch<T extends object> = Partial<T>;
export type StoreSetter<T extends object> = StorePatch<T> | ((previous: T) => StorePatch<T> | T);
export type StoreReplacer<T extends object> = T | ((previous: T) => T);

export interface Store<T extends object> {
  readonly state: ReadonlyCell<T>;
  get(): T;
  set(next: StoreSetter<T>): void;
  replace(next: StoreReplacer<T>): void;
  update(updater: (previous: T) => StorePatch<T> | T): void;
  select<U>(selector: (state: T) => U): ReadonlyCell<U>;
  subscribe(listener: StoreListener<T>): () => void;
}

export function createStore<T extends object>(initial: T): Store<T> {
  const state = cell(initial);
  const listeners = new Set<StoreListener<T>>();

  function readUntracked(): T {
    return untrack(() => state.get());
  }

  function commit(next: T, previous: T): void {
    if (Object.is(next, previous)) {
      return;
    }

    state.set(next);

    for (const listener of Array.from(listeners)) {
      listener(next, previous);
    }
  }

  function set(next: StoreSetter<T>): void {
    const previous = readUntracked();
    const patch = typeof next === "function" ? next(previous) : next;
    commit(mergePatch(previous, patch), previous);
  }

  function replace(next: StoreReplacer<T>): void {
    const previous = readUntracked();
    const resolved = typeof next === "function" ? next(previous) : next;
    commit(resolved, previous);
  }

  return {
    state,
    get: () => state.get(),
    set,
    replace,
    update: set,
    select: (selector) => computed(() => selector(state.get())),
    subscribe: (listener) => {
      listeners.add(listener);

      return () => {
        listeners.delete(listener);
      };
    },
  };
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
