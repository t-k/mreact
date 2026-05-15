import type { Cell } from "./types.js";
import type { Source } from "./state.js";
import {
  emitReactiveDevtoolsEvent,
  hasReactiveDevtoolsEmitter,
} from "./devtools.js";
import { notifySubscribers, trackSource } from "./tracking.js";

declare const __MREACT_CLIENT_DEVTOOLS__: boolean | undefined;

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

      if (
        (typeof __MREACT_CLIENT_DEVTOOLS__ === "undefined" ||
          __MREACT_CLIENT_DEVTOOLS__ !== false) &&
        hasReactiveDevtoolsEmitter()
      ) {
        const previous = current;
        current = resolved;
        emitReactiveDevtoolsEvent({
          previous,
          subscribers: source.subscribers.size,
          type: "reactive:cell:set",
          value: resolved,
        });
      } else {
        current = resolved;
      }
      const singleSubscriber = source.singleSubscriber;
      if (
        singleSubscriber !== undefined &&
        (singleSubscriber.disposed || singleSubscriber.queued)
      ) {
        return;
      }
      notifySubscribers(source);
    },
  };
}
