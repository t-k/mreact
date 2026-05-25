import { afterEach, describe, expect, test } from "vitest";
import { batch, cell, computed, effect, untrack } from "../src/index.js";
import { createReactiveTestRuntime, type ReactiveTestRuntime } from "../src/testing.js";

let runtime: ReactiveTestRuntime | undefined;

afterEach(() => {
  runtime?.dispose();
  runtime = undefined;
});

function useRuntime(): ReactiveTestRuntime {
  runtime = createReactiveTestRuntime();
  return runtime;
}

describe("reactive-core scheduler / tracking behavior", () => {
  test("deterministic test runtime defers effect reruns until an explicit flush", () => {
    const testRuntime = useRuntime();
    const count = cell(0);
    const observed: number[] = [];
    const dispose = effect(() => {
      observed.push(count.get());
    });

    count.set(1);

    expect(testRuntime.scheduledFlushCount()).toBe(1);
    expect(observed).toEqual([0]);

    expect(testRuntime.flushNext()).toBe(true);
    expect(observed).toEqual([0, 1]);
    expect(testRuntime.flushNext()).toBe(false);

    dispose();
  });

  test("disposed effects are not rescheduled by later writes", () => {
    const testRuntime = useRuntime();
    const count = cell(0);
    const observed: number[] = [];
    const dispose = effect(() => {
      observed.push(count.get());
    });

    dispose();
    count.set(1);
    testRuntime.flushAll();

    expect(observed).toEqual([0]);
    expect(testRuntime.scheduledFlushCount()).toBe(0);
  });

  test("multiple writes before a flush coalesce into one effect rerun with the latest value", () => {
    const testRuntime = useRuntime();
    const count = cell(0);
    const observed: number[] = [];
    const dispose = effect(() => {
      observed.push(count.get());
    });

    count.set(1);
    count.set(2);
    count.set(3);

    expect(testRuntime.scheduledFlushCount()).toBe(1);
    testRuntime.flushAll();

    expect(observed).toEqual([0, 3]);
    dispose();
  });

  test("batch waits for the outer batch before scheduling a flush", () => {
    const testRuntime = useRuntime();
    const count = cell(0);
    const observed: number[] = [];
    const dispose = effect(() => {
      observed.push(count.get());
    });

    batch(() => {
      batch(() => {
        count.set(1);
        count.set(2);
      });
      expect(testRuntime.scheduledFlushCount()).toBe(0);
      expect(observed).toEqual([0]);
    });

    expect(testRuntime.scheduledFlushCount()).toBe(1);
    testRuntime.flushAll();
    expect(observed).toEqual([0, 2]);
    dispose();
  });

  test("dynamic dependency cleanup stops reruns from sources that are no longer read", () => {
    const testRuntime = useRuntime();
    const enabled = cell(true);
    const first = cell(1);
    const second = cell(10);
    const observed: number[] = [];
    const dispose = effect(() => {
      observed.push(enabled.get() ? first.get() : second.get());
    });

    enabled.set(false);
    testRuntime.flushAll();
    first.set(2);
    testRuntime.flushAll();
    second.set(11);
    testRuntime.flushAll();

    expect(observed).toEqual([1, 10, 11]);
    dispose();
  });

  test("computed dependencies flush before downstream effects observe them", () => {
    const testRuntime = useRuntime();
    const source = cell(1);
    const left = computed(() => source.get() + 1);
    const right = computed(() => source.get() * 2);
    const total = computed(() => left.get() + right.get());
    const observed: number[] = [];
    const dispose = effect(() => {
      observed.push(total.get());
    });

    source.set(2);
    testRuntime.flushAll();

    expect(observed).toEqual([4, 7]);
    dispose();
  });

  test("untracked reads do not subscribe the active effect", () => {
    const testRuntime = useRuntime();
    const tracked = cell(1);
    const ignored = cell(10);
    const observed: number[] = [];
    const dispose = effect(() => {
      observed.push(tracked.get() + untrack(() => ignored.get()));
    });

    ignored.set(20);
    testRuntime.flushAll();
    tracked.set(2);
    testRuntime.flushAll();

    expect(observed).toEqual([11, 22]);
    dispose();
  });
});
