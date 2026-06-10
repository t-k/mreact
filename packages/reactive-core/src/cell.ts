import type { Cell } from "./types.js";
import type { Source } from "./state.js";
import { notifySubscribers, trackSource } from "./tracking.js";

declare const __MREACT_CLIENT_DEVTOOLS__: boolean | undefined;

const clientDevtoolsDisabled =
  typeof __MREACT_CLIENT_DEVTOOLS__ !== "undefined" &&
  __MREACT_CLIENT_DEVTOOLS__ === false;

/** Creates a mutable reactive cell with an initial value. */
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

      if (clientDevtoolsDisabled) {
        current = resolved;
      } else {
        const devtools = (
          globalThis as typeof globalThis & {
            __mreactDevtools?:
              | { emit?: (event: Record<string, unknown>) => void }
              | undefined;
          }
        ).__mreactDevtools;
        const emit = devtools?.emit;

        if (typeof emit !== "function") {
          current = resolved;
        } else {
          const previous = current;
          current = resolved;
          emit.call(devtools, {
            package: "@reckona/mreact-reactive-core",
            previous,
            subscribers: source.subscribers.size,
            timestamp: Date.now(),
            type: "reactive:cell:set",
            value: resolved,
          });
        }
      }
      notifySubscribers(source);
    },
  };
}
