import type { Cell } from "./types.js";
import type { Source } from "./state.js";
import {
  emitReactiveDevtoolsEvent,
  hasReactiveDevtoolsEmitter,
} from "./devtools.js";
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
      const resolved = typeof next === "function" ? (next as (prev: T) => T)(current) : next;

      if (Object.is(current, resolved)) {
        return;
      }

      const previous = current;
      current = resolved;
      if (hasReactiveDevtoolsEmitter()) {
        emitReactiveDevtoolsEvent({
          previous,
          subscribers: source.subscribers.size,
          type: "reactive:cell:set",
          value: resolved,
        });
      }
      notifySubscribers(source);
    },
  };
}
