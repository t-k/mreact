import { describe, expect, test } from "vitest";
import {
  batch,
  computed,
  cell,
  createCleanupScope,
  effect,
  runWithCleanupScope,
  untrack,
} from "../src/index.js";
import { deferredComputed, setScheduler } from "../src/internal.js";
import { flushEffects } from "../src/testing.js";

describe("compiler deferred computed", () => {
  test("defers chained iterator consumption and skips intermediate batched sources", async () => {
    const consumed: number[] = [];
    function* values(value: number) {
      consumed.push(value);
      yield value;
    }
    const source = cell(values(1));
    const first = deferredComputed(() => {
      const [value] = source.get();
      return value!;
    });
    const doubled = deferredComputed(() => first.get() * 2);
    const seen: number[] = [];
    const dispose = effect(() => {
      seen.push(doubled.get() + doubled.get());
    });
    expect(consumed).toEqual([1]);
    batch(() => {
      source.set(values(2));
      source.set(values(3));
    });
    expect(consumed).toEqual([1]);
    await flushEffects();
    expect(consumed).toEqual([1, 3]);
    expect(seen).toEqual([4, 12]);
    source.set(values(4));
    dispose();
    await flushEffects();
    expect(consumed).toEqual([1, 3]);
  });

  test("refreshes dormant chains once and reattaches subscriptions", async () => {
    const source = cell(1);
    let reads = 0;
    const inner = deferredComputed(() => {
      reads++;
      return source.get();
    });
    const left = deferredComputed(() => inner.get() + 1);
    const right = deferredComputed(() => inner.get() + 2);
    expect(untrack(() => [left.get(), right.get()])).toEqual([2, 3]);
    source.set(2);
    expect(untrack(() => [left.get(), right.get()])).toEqual([3, 4]);
    expect(reads).toBe(2);
    const seen: number[] = [];
    const dispose = effect(() => {
      seen.push(left.get() + right.get());
    });
    source.set(3);
    await flushEffects();
    expect(seen).toEqual([7, 9]);
    expect(reads).toBe(3);
    dispose();
  });

  test("retries after a caught evaluation failure on the next source update", async () => {
    const source = cell(1);
    const value = deferredComputed(() => {
      const next = source.get();
      if (next < 0) throw new Error("negative");
      return next;
    });
    const seen: (number | string)[] = [];
    const dispose = effect(() => {
      try {
        seen.push(value.get());
      } catch {
        seen.push("error");
      }
    });
    source.set(-1);
    await flushEffects();
    source.set(2);
    await flushEffects();
    expect(seen).toEqual([1, "error", 2]);
    dispose();
  });

  test("owner cleanup disposes a pending consuming computation before replacement", async () => {
    const consumed: number[] = [];
    function* values(value: number) {
      consumed.push(value);
      yield value;
    }
    const source = cell(values(1));
    const seen: number[] = [];
    const dispose = effect(() => {
      const scope = createCleanupScope();
      runWithCleanupScope(scope, () => {
        const value = deferredComputed(() => {
          const [first] = source.get();
          return first!;
        });
        seen.push(value.get());
        effect(() => {
          value.get();
        });
      });
      return () => scope.dispose();
    });
    source.set(values(2));
    expect(consumed).toEqual([1]);
    await flushEffects();
    expect(consumed).toEqual([1, 2]);
    expect(seen).toEqual([1, 2]);
    dispose();
  });
});

describe.each(["microtask", "sync", "queued"] as const)(
  "batched reads across deferred computeds (%s scheduler)",
  (scheduler) => {
    function withScheduler(run: (drain: () => void) => Promise<void>): Promise<void> {
      const callbacks: Array<() => void> = [];
      const restore =
        scheduler === "microtask"
          ? () => {}
          : setScheduler({
              schedule: (callback) =>
                scheduler === "sync" ? callback() : void callbacks.push(callback),
            });
      const drain = () => {
        while (callbacks.length > 0) callbacks.shift()!();
      };
      return run(drain).finally(restore);
    }

    test.each([
      ["computed -> deferred -> computed", false],
      ["computed -> deferred -> deferred", true],
    ])("reads the latest value through %s", (_, lastDeferred) =>
      withScheduler(async (drain) => {
        const source = cell(0);
        const first = computed(() => source.get() + 1);
        const middle = deferredComputed(() => first.get() + 1);
        const last = lastDeferred
          ? deferredComputed(() => middle.get() + 1)
          : computed(() => middle.get() + 1);
        const seen: number[] = [];
        const stop = effect(() => {
          seen.push(last.get());
        });
        try {
          batch(() => {
            source.setValue(1);
            expect(last.get()).toBe(4);
            expect(seen).toEqual([3]);
            source.setValue(2);
            expect(last.get()).toBe(5);
            expect(seen).toEqual([3]);
          });
          expect(last.get()).toBe(5);
          drain();
          await flushEffects();
          expect(seen).toEqual([3, 5]);
        } finally {
          stop();
        }
      }),
    );

    test("leaves unread consuming branches untouched while refreshing a read branch", () =>
      withScheduler(async (drain) => {
        const consumed: number[] = [];
        function* values(value: number) {
          consumed.push(value);
          yield value;
        }
        const count = cell(0);
        const items = cell(values(1));
        const first = computed(() => count.get() + 1);
        const middle = deferredComputed(() => first.get() + 1);
        const last = computed(() => middle.get() + 1);
        const consumer = deferredComputed(() => {
          const [value] = items.get();
          return value!;
        });
        const seen: number[] = [];
        const stop = effect(() => {
          seen.push(last.get() * 100 + consumer.get());
        });
        expect(consumed).toEqual([1]);
        try {
          batch(() => {
            count.setValue(1);
            items.set(values(2));
            expect(last.get()).toBe(4);
            expect(consumed).toEqual([1]);
            expect(seen).toEqual([301]);
          });
          drain();
          await flushEffects();
          expect(consumed).toEqual([1, 2]);
          expect(seen).toEqual([301, 402]);
        } finally {
          stop();
        }
      }));
  },
);
