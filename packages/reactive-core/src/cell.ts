import type { Cell } from "./types.js";
import type { Source } from "./state.js";
import { notifySubscribers, trackSource } from "./tracking.js";

export function cell<T>(initial: T): Cell<T> {
  let current = initial;
  const source: Source = {
    subscribers: new Set(),
  };

  return {
    get(): T {
      trackSource(source);
      return current;
    },
    set(next: T | ((prev: T) => T)): void {
      const resolved =
        typeof next === "function" ? (next as (prev: T) => T)(current) : next;

      if (Object.is(current, resolved)) {
        return;
      }

      current = resolved;
      notifySubscribers(source);
    },
  };
}
