import { describe, expect, test } from "vitest";
import {
  batch,
  cell,
  createCleanupScope,
  effect,
  runWithCleanupScope,
  untrack,
} from "../src/index.js";
import { deferredComputed } from "../src/internal.js";
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
