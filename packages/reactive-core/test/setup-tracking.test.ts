import { afterEach, expect, test } from "vitest";
import { cell, computed, effect, selector, type Selector, untrack } from "../src/index.js";
import { runWithSetupTracking } from "../src/internal.js";
import { runtimeState } from "../src/state.js";
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

test("returns a setup result when no reactive owner is active", () => {
  expect(
    runWithSetupTracking((value: number) => {
      expect(runtimeState.setupTrackingFrame).toBeUndefined();
      return value + 1;
    }, 1),
  ).toBe(2);
});

test("replays helper-hidden setup reads into the active computation", () => {
  const testRuntime = useRuntime();
  const source = cell("closed");
  const observed: string[] = [];
  const readSource = () => source.get();
  const dispose = effect(() => {
    observed.push(runWithSetupTracking(readSource, undefined));
  });

  source.set("open");
  testRuntime.flushAll();

  expect(observed).toEqual(["closed", "open"]);
  dispose();
});

test("does not replay a source changed by the same synchronous setup", () => {
  const testRuntime = useRuntime();
  const guard = cell(false);
  let runs = 0;
  const dispose = effect(() => {
    runs += 1;
    runWithSetupTracking(() => guard.set(!guard.get()), undefined);
  });

  testRuntime.flushAll();

  expect(runs).toBe(1);
  expect(guard.get()).toBe(true);
  dispose();
});

test("retains a setup dependency when its write is a no-op", () => {
  const testRuntime = useRuntime();
  const source = cell(0);
  const observed: number[] = [];
  const dispose = effect(() => {
    observed.push(
      runWithSetupTracking(() => {
        const value = source.get();
        source.set(value);
        return value;
      }, undefined),
    );
  });

  source.set(1);
  testRuntime.flushAll();

  expect(observed).toEqual([0, 1]);
  dispose();
});

test("drops a dependency from an earlier setup run and drains one queued rerun", () => {
  const testRuntime = useRuntime();
  const shouldWrite = cell(false);
  const source = cell(false);
  let runs = 0;
  const dispose = effect(() => {
    runs += 1;
    const write = shouldWrite.get();
    runWithSetupTracking(() => {
      const value = source.get();
      if (write) source.set(!value);
    }, undefined);
  });

  shouldWrite.set(true);
  testRuntime.flushAll();

  expect(runs).toBe(3);
  dispose();
});

test("does not replay a computed that depends on a source changed by setup", () => {
  const testRuntime = useRuntime();
  const source = cell(0);
  const doubled = computed(() => source.get() * 2);
  let runs = 0;
  const dispose = effect(() => {
    runs += 1;
    runWithSetupTracking(() => {
      doubled.get();
      source.set(source.get() + 1);
    }, undefined);
  });

  testRuntime.flushAll();

  expect(runs).toBe(1);
  source.set(10);
  testRuntime.flushAll();
  expect(runs).toBe(1);
  dispose();
});

test("keeps unaffected branches of a computed setup dependency reactive", () => {
  const testRuntime = useRuntime();
  const written = cell(0);
  const external = cell(10);
  const combined = computed(() => written.get() + external.get());
  const observed: number[] = [];
  const dispose = effect(() => {
    observed.push(
      runWithSetupTracking(() => {
        const value = combined.get();
        written.set(written.get() + 1);
        return value;
      }, undefined),
    );
  });

  external.set(20);
  testRuntime.flushAll();

  expect(observed).toEqual([10, 21]);
  written.set(100);
  testRuntime.flushAll();
  expect(observed).toEqual([10, 21]);
  dispose();
});

test("does not replay sibling derived reads that share a synchronously written source", () => {
  const testRuntime = useRuntime();
  const source = cell(0);
  const first = computed(() => source.get() + 1);
  const second = computed(() => source.get() + 2);
  let runs = 0;
  const dispose = effect(() => {
    runs += 1;
    runWithSetupTracking(() => {
      first.get();
      second.get();
      source.set(source.get() + 1);
    }, undefined);
  });

  testRuntime.flushAll();

  expect(runs).toBe(1);
  dispose();
});

test("does not replay a dormant computed whose source is changed by setup", () => {
  const testRuntime = useRuntime();
  const source = cell(0);
  const doubled = computed(() => source.get() * 2);
  untrack(() => doubled.get());
  let runs = 0;
  const dispose = effect(() => {
    runs += 1;
    runWithSetupTracking(() => {
      doubled.get();
      source.set(source.get() + 1);
    }, undefined);
  });

  source.set(10);
  testRuntime.flushAll();

  expect(runs).toBe(1);
  dispose();
});

test("does not loop when setup changes the source behind a selector read", () => {
  const testRuntime = useRuntime();
  const selectedValue = cell(false);
  const isSelected = selector(selectedValue);
  expect(isSelected(false)).toBe(true);
  expect(isSelected(true)).toBe(false);
  let runs = 0;
  const dispose = effect(() => {
    runs += 1;
    runWithSetupTracking(() => {
      isSelected(true);
      selectedValue.set(!selectedValue.get());
    }, undefined);
  });

  testRuntime.flushAll();

  expect(runs).toBe(1);
  dispose();
  isSelected.dispose();
});

test("keeps selector dependency metadata with custom equality", () => {
  const testRuntime = useRuntime();
  const selectedValue = cell({ id: 1 });
  const isSelected = selector(selectedValue, {
    equals: (value, key: number) => value.id === key,
  });
  const observed: boolean[] = [];
  const dispose = effect(() => {
    observed.push(runWithSetupTracking(() => isSelected(1), undefined));
  });

  selectedValue.set({ id: 2 });
  testRuntime.flushAll();

  expect(observed).toEqual([true, false]);
  dispose();
  isSelected.dispose();
});

test("filters a synchronous setup write through a cyclic selector graph", () => {
  const testRuntime = useRuntime();
  const written = cell(false);
  const trigger = cell(false);
  let selectedA!: Selector<boolean>;
  let cycle = false;
  const selectedB = selector({
    get() {
      if (cycle) return selectedA(true);
      trigger.get();
      return false;
    },
  });
  selectedA = selector({
    get() {
      selectedB(true);
      return written.get();
    },
  });

  cycle = true;
  trigger.set(true);
  testRuntime.flushAll();
  written.set(true);
  testRuntime.flushAll();

  let runs = 0;
  const dispose = effect(() => {
    runs += 1;
    runWithSetupTracking(() => {
      selectedA(true);
      written.set(false);
    }, undefined);
  });
  testRuntime.flushAll();

  expect(runs).toBe(1);
  dispose();
  selectedA.dispose();
  selectedB.dispose();
});

test("filters setup writes through a deep selector dependency chain without recursion", () => {
  useRuntime();
  const base = cell(false);
  let current = selector(base);
  const selectors = [current];
  for (let index = 0; index < 6_000; index += 1) {
    const previous = current;
    current = selector({ get: () => previous(true) });
    selectors.push(current);
  }

  let dispose: (() => void) | undefined;
  try {
    expect(() => {
      dispose = effect(() =>
        runWithSetupTracking(() => {
          current(true);
          base.set(true);
        }, undefined),
      );
    }).not.toThrow();
  } finally {
    dispose?.();
    for (let index = selectors.length - 1; index >= 0; index -= 1) {
      selectors[index]!.dispose();
    }
  }
});

test("tracks writes after setup and respects an explicitly untracked async guard", async () => {
  const testRuntime = useRuntime();
  const trackedSource = cell(0);
  const untrackedSource = cell(0);
  let trackedRuns = 0;
  let untrackedRuns = 0;
  const disposeTracked = effect(() => {
    trackedRuns += 1;
    runWithSetupTracking(() => {
      if (trackedSource.get() === 0) {
        queueMicrotask(() => trackedSource.set(1));
      }
    }, undefined);
  });
  const disposeUntracked = effect(() => {
    untrackedRuns += 1;
    runWithSetupTracking(() => {
      if (untrack(() => untrackedSource.get()) === 0) {
        queueMicrotask(() => untrackedSource.set(1));
      }
    }, undefined);
  });

  await Promise.resolve();
  testRuntime.flushAll();

  expect(trackedRuns).toBe(2);
  expect(untrackedRuns).toBe(1);
  disposeTracked();
  disposeUntracked();
});

test("keeps an outside read subscribed when setup also changes that source", () => {
  const testRuntime = useRuntime();
  const source = cell(0);
  const observed: number[] = [];
  const dispose = effect(() => {
    const value = source.get();
    runWithSetupTracking(() => source.set(1), undefined);
    observed.push(value);
  });

  testRuntime.flushAll();
  source.set(2);
  testRuntime.flushAll();

  expect(observed).toEqual([0, 1, 2, 1]);
  dispose();
});

test("preserves nested setup writes and explicit untracking", () => {
  const testRuntime = useRuntime();
  const tracked = cell(0);
  const written = cell(0);
  const ignored = cell(0);
  let runs = 0;
  const dispose = effect(() => {
    runs += 1;
    runWithSetupTracking(() => {
      tracked.get();
      untrack(() => ignored.get());
      runWithSetupTracking(() => written.set(written.get() + 1), undefined);
    }, undefined);
  });

  ignored.set(1);
  written.set(10);
  testRuntime.flushAll();
  expect(runs).toBe(1);

  tracked.set(1);
  testRuntime.flushAll();
  expect(runs).toBe(2);
  dispose();
});

test("leaves reads made by a nested effect owned by that effect", () => {
  const testRuntime = useRuntime();
  const parentSource = cell(0);
  const childSource = cell(0);
  let parentRuns = 0;
  let childRuns = 0;
  const childDisposers: Array<() => void> = [];
  const disposeParent = effect(() => {
    parentRuns += 1;
    runWithSetupTracking(() => {
      parentSource.get();
      childDisposers.push(
        effect(() => {
          childRuns += 1;
          childSource.get();
        }),
      );
    }, undefined);
  });

  childSource.set(1);
  testRuntime.flushAll();
  expect(parentRuns).toBe(1);
  expect(childRuns).toBe(2);

  parentSource.set(1);
  testRuntime.flushAll();
  expect(parentRuns).toBe(2);
  expect(childRuns).toBe(3);

  disposeParent();
  for (const dispose of childDisposers) dispose();
});

test("restores tracking state when setup throws", () => {
  const testRuntime = useRuntime();
  const failedSource = cell(0);
  const trackedSource = cell(0);
  let runs = 0;
  const dispose = effect(() => {
    runs += 1;
    try {
      runWithSetupTracking(() => {
        failedSource.get();
        throw new Error("setup failed");
      }, undefined);
    } catch (error) {
      expect(error).toEqual(new Error("setup failed"));
    }
    trackedSource.get();
  });

  failedSource.set(1);
  testRuntime.flushAll();
  expect(runs).toBe(1);

  trackedSource.set(1);
  testRuntime.flushAll();
  expect(runs).toBe(2);
  dispose();
});
