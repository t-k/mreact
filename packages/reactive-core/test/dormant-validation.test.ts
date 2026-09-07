import { describe, expect, test } from "vitest";
import { cell, computed } from "../src/index.js";
import { createCurrentCheckContext, untrackedDependencyIsCurrent } from "../src/state.js";
import type { CurrentCheckContext, Source } from "../src/state.js";

type DependencyProbe = {
  ref: WeakRef<Source>;
  requiresCurrentCheckContext: boolean;
  version: number;
};

const checkDependency = untrackedDependencyIsCurrent as unknown as (
  dependency: DependencyProbe,
  context?: CurrentCheckContext,
) => boolean;

describe("dormant dependency validation", () => {
  test("does not reuse a current result for an edge with an older snapshot version", () => {
    let currentChecks = 0;
    const source: Source = {
      subscribers: null,
      isCurrent: () => {
        currentChecks += 1;
        return true;
      },
    };
    const context = createCurrentCheckContext();
    const ref = new WeakRef(source);

    expect(
      checkDependency({ ref, requiresCurrentCheckContext: true, version: 0 }, context),
    ).toBe(true);
    expect(
      checkDependency({ ref, requiresCurrentCheckContext: true, version: 1 }, context),
    ).toBe(false);
    expect(
      checkDependency({ ref, requiresCurrentCheckContext: true, version: 0 }, context),
    ).toBe(true);
    expect(currentChecks).toBe(1);
  });

  test("reports a stale edge as outdated even when the shared source is current", () => {
    let currentChecks = 0;
    const source: Source = {
      subscribers: null,
      isCurrent: () => {
        currentChecks += 1;
        return false;
      },
    };
    const context = createCurrentCheckContext();
    const ref = new WeakRef(source);

    expect(
      checkDependency({ ref, requiresCurrentCheckContext: true, version: 0 }, context),
    ).toBe(false);
    expect(
      checkDependency({ ref, requiresCurrentCheckContext: true, version: 0 }, context),
    ).toBe(false);
    expect(currentChecks).toBe(1);
  });

  test("treats a collected dormant dependency as outdated", () => {
    const context = createCurrentCheckContext();
    const collected = {
      deref: () => undefined,
    } as unknown as WeakRef<Source>;

    expect(
      checkDependency({ ref: collected, requiresCurrentCheckContext: true, version: 0 }, context),
    ).toBe(false);
    expect(
      checkDependency({ ref: collected, requiresCurrentCheckContext: true, version: 0 }),
    ).toBe(false);
  });

  test("invokes a source check with the source as its receiver", () => {
    const receivers: unknown[] = [];
    const source: Source = {
      subscribers: null,
      isCurrent(this: Source) {
        receivers.push(this);
        return true;
      },
    };
    const ref = new WeakRef(source);

    expect(checkDependency({ ref, requiresCurrentCheckContext: true, version: 0 })).toBe(true);
    expect(
      checkDependency(
        { ref, requiresCurrentCheckContext: true, version: 0 },
        createCurrentCheckContext(),
      ),
    ).toBe(true);
    expect(receivers).toEqual([source, source]);
  });

  test("revalidates a stale sibling edge to a shared dormant computed", () => {
    const base = cell(1);
    let sharedRuns = 0;
    let staleRuns = 0;
    const shared = computed(() => {
      sharedRuns += 1;
      return base.get() * 10;
    });
    const stale = computed(() => {
      staleRuns += 1;
      return shared.get() + 1;
    });

    expect(stale.get()).toBe(11);

    base.set(2);

    const fresh = computed(() => shared.get() + 2);
    expect(fresh.get()).toBe(22);

    const total = computed(() => stale.get() + fresh.get());

    expect(total.get()).toBe(43);
    expect(sharedRuns).toBe(2);
    expect(staleRuns).toBe(2);
  });

  test("validates a dormant diamond without recomputing unchanged levels", () => {
    const base = cell(1);
    let runs = 0;
    const left = computed(() => {
      runs += 1;
      return base.get() + 1;
    });
    const right = computed(() => {
      runs += 1;
      return base.get() + 2;
    });
    const top = computed(() => {
      runs += 1;
      return left.get() + right.get();
    });

    expect(top.get()).toBe(5);
    expect(runs).toBe(3);

    expect(top.get()).toBe(5);
    expect(runs).toBe(3);

    base.set(2);

    expect(top.get()).toBe(7);
    expect(runs).toBe(6);

    expect(top.get()).toBe(7);
    expect(runs).toBe(6);
  });

  test("revalidates a dormant diamond once when a shared source is rewritten to the same value", () => {
    const base = cell(1);
    let runs = 0;
    const left = computed(() => {
      runs += 1;
      return base.get() + 1;
    });
    const right = computed(() => {
      runs += 1;
      return base.get() + 2;
    });
    const top = computed(() => {
      runs += 1;
      return left.get() + right.get();
    });

    expect(top.get()).toBe(5);
    runs = 0;

    base.set(2);
    base.set(1);

    // Dormant validation compares snapshot versions rather than values, so the
    // restored graph recomputes once and then stays cached.
    expect(top.get()).toBe(5);
    expect(runs).toBe(3);
    expect(top.get()).toBe(5);
    expect(runs).toBe(3);
  });

  test("follows a dormant dependency switch to the newly read source", () => {
    const useFirst = cell(true);
    const first = cell("first");
    const second = cell("second");
    let runs = 0;
    const selected = computed(() => {
      runs += 1;
      return useFirst.get() ? first.get() : second.get();
    });
    const label = computed(() => `value:${selected.get()}`);

    expect(label.get()).toBe("value:first");
    expect(runs).toBe(1);

    second.set("changed");

    expect(label.get()).toBe("value:first");
    expect(runs).toBe(1);

    useFirst.set(false);

    expect(label.get()).toBe("value:changed");
    expect(runs).toBe(2);

    first.set("ignored");

    expect(label.get()).toBe("value:changed");
    expect(runs).toBe(2);

    second.set("final");

    expect(label.get()).toBe("value:final");
    expect(runs).toBe(3);
  });

  test("recovers a dormant computed after an upstream failure", () => {
    const shouldThrow = cell(true);
    const value = cell(1);
    const risky = computed(() => {
      if (shouldThrow.get()) {
        throw new Error("upstream failed");
      }
      return value.get();
    });
    const doubled = computed(() => risky.get() * 2);

    expect(() => doubled.get()).toThrow("upstream failed");

    shouldThrow.set(false);

    expect(doubled.get()).toBe(2);

    value.set(5);

    expect(doubled.get()).toBe(10);
  });

  test("re-subscribes a dormant diamond when a downstream effect observes it again", () => {
    const base = cell(1);
    const left = computed(() => base.get() + 1);
    const right = computed(() => base.get() + 2);
    const top = computed(() => left.get() + right.get());

    expect(top.get()).toBe(5);

    base.set(3);

    expect(top.get()).toBe(9);
    expect(top.get()).toBe(9);

    base.set(4);

    expect(top.get()).toBe(11);
  });
});
