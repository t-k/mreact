import type { Cell } from "./types.js";

export function cell<T>(initial: T): Cell<T> {
  let current = initial;

  return {
    get(): T {
      return current;
    },
    set(next: T | ((prev: T) => T)): void {
      const resolved =
        typeof next === "function" ? (next as (prev: T) => T)(current) : next;

      if (Object.is(current, resolved)) {
        return;
      }

      current = resolved;
    },
  };
}
