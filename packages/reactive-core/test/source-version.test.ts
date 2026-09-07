import { describe, expect, test } from "vitest";
import { batch, cell, computed, effect } from "../src/index.js";
import { getCellSource } from "../src/cell.js";
import { deferredComputed } from "../src/internal.js";
import { sourceVersion, type Source } from "../src/state.js";
import { createReactiveTestRuntime, flushEffects } from "../src/testing.js";
import { notifySubscribers, trackSource } from "../src/tracking.js";

function cellSource(value: unknown): Source {
  const source = getCellSource(value);

  if (source === undefined) {
    throw new Error("expected a source-backed cell");
  }

  return source;
}

describe("source snapshot versions", () => {
  test("lets a dormant computed observe writes made with no subscribers", () => {
    const count = cell(1);
    let runs = 0;
    const doubled = computed(() => {
      runs += 1;
      return count.get() * 2;
    });

    expect(doubled.get()).toBe(2);
    expect(runs).toBe(1);

    count.set(2);

    expect(doubled.get()).toBe(4);
    expect(runs).toBe(2);

    expect(doubled.get()).toBe(4);
    expect(runs).toBe(2);
  });

  test("advances an unobserved cell snapshot once per changed write", () => {
    const count = cell(0);
    const source = cellSource(count);
    const initial = sourceVersion(source);

    count.set(1);

    expect(sourceVersion(source)).toBe(initial + 1);

    count.setValue(2);

    expect(sourceVersion(source)).toBe(initial + 2);

    count.update((previous) => previous + 1);

    expect(sourceVersion(source)).toBe(initial + 3);
  });

  test("advances a subscribed cell snapshot once per changed write", async () => {
    const count = cell(0);
    const source = cellSource(count);
    const seen: number[] = [];
    const stop = effect(() => {
      seen.push(count.get());
    });

    try {
      const initial = sourceVersion(source);

      count.set(1);
      await flushEffects();

      expect(sourceVersion(source)).toBe(initial + 1);

      count.set(2);
      await flushEffects();

      expect(sourceVersion(source)).toBe(initial + 2);
      expect(seen).toEqual([0, 1, 2]);
    } finally {
      stop();
    }
  });

  test("does not advance a snapshot for a write that resolves to the same value", () => {
    const count = cell(1);
    const source = cellSource(count);
    const initial = sourceVersion(source);

    count.set(1);
    count.setValue(1);
    count.update((previous) => previous);

    expect(sourceVersion(source)).toBe(initial);
  });

  test("advances a batched cell snapshot once per changed write", async () => {
    const first = cell(0);
    const second = cell(0);
    const firstSource = cellSource(first);
    const secondSource = cellSource(second);
    const seen: string[] = [];
    const stop = effect(() => {
      seen.push(`${first.get()}:${second.get()}`);
    });

    try {
      const initialFirst = sourceVersion(firstSource);
      const initialSecond = sourceVersion(secondSource);

      batch(() => {
        first.set(1);
        second.set(1);
        first.set(2);
      });
      await flushEffects();

      expect(sourceVersion(firstSource)).toBe(initialFirst + 2);
      expect(sourceVersion(secondSource)).toBe(initialSecond + 1);
      expect(seen).toEqual(["0:0", "2:1"]);
    } finally {
      stop();
    }
  });

  test("keeps notification counts for custom equality computed values", async () => {
    const runtime = createReactiveTestRuntime();

    try {
      const count = cell(0);
      const parity = computed(() => count.get() % 2, {
        equals: (previous, next) => previous === next,
      });
      const seen: number[] = [];
      const stop = effect(() => {
        seen.push(parity.get());
      });

      try {
        count.set(2);
        runtime.flushAll();

        expect(seen).toEqual([0]);

        count.set(3);
        runtime.flushAll();

        expect(seen).toEqual([0, 1]);
      } finally {
        stop();
      }
    } finally {
      runtime.dispose();
    }
  });

  test("keeps dormant snapshots for computed and deferred computed sources", () => {
    const base = cell(1);
    const derived = computed(() => base.get() + 1);
    const deferred = deferredComputed(() => derived.get() * 10);
    let runs = 0;
    const total = computed(() => {
      runs += 1;
      return deferred.get() + derived.get();
    });

    expect(total.get()).toBe(22);
    expect(runs).toBe(1);

    expect(total.get()).toBe(22);
    expect(runs).toBe(1);

    base.set(2);

    expect(total.get()).toBe(33);
    expect(runs).toBe(2);
  });

  test("tracks a source created outside reactive-core through dormant reads", () => {
    const external: Source = { subscribers: null };
    let externalValue = 1;
    let runs = 0;
    const derived = computed(() => {
      runs += 1;
      trackSource(external);
      return externalValue * 2;
    });

    expect(derived.get()).toBe(2);
    expect(runs).toBe(1);

    expect(derived.get()).toBe(2);
    expect(runs).toBe(1);

    externalValue = 5;
    notifySubscribers(external);

    expect(derived.get()).toBe(10);
    expect(runs).toBe(2);
  });

  test("notifies subscribers of a source created outside reactive-core", async () => {
    const external: Source = { subscribers: null };
    let externalValue = 0;
    const seen: number[] = [];
    const stop = effect(() => {
      trackSource(external);
      seen.push(externalValue);
    });

    try {
      externalValue = 1;
      notifySubscribers(external);
      await flushEffects();

      expect(seen).toEqual([0, 1]);
    } finally {
      stop();
    }
  });
});
