import { describe, expect, test } from "vitest";
import { cell, computed, effect } from "../src/index.js";
import { flushEffects } from "../src/testing.js";

describe("dormant computed dependency snapshots", () => {
  test("a computed dropped from a sibling branch keeps reporting fresh values", () => {
    const x = cell(0);
    const cached = computed(() => x.get());
    const branch = computed(() => (x.get() === 0 ? cached.get() : 0));

    expect(branch.get()).toBe(0);

    x.setValue(3);

    expect(branch.get()).toBe(0);
    expect(cached.get()).toBe(3);
  });

  test("reading the dropped computed before the branch also stays fresh", () => {
    const x = cell(0);
    const cached = computed(() => x.get());
    const branch = computed(() => (x.get() === 0 ? cached.get() : 0));

    expect(branch.get()).toBe(0);
    x.setValue(3);
    expect(cached.get()).toBe(3);
    expect(branch.get()).toBe(0);

    x.setValue(0);
    expect(branch.get()).toBe(0);
    x.setValue(5);
    expect(branch.get()).toBe(0);
    expect(cached.get()).toBe(5);
  });

  test("survives relay chains of one to four computeds", () => {
    for (let depth = 1; depth <= 4; depth += 1) {
      const x = cell(0);
      let relay = computed(() => x.get());
      const inner = relay;
      for (let index = 1; index < depth; index += 1) {
        const previous = relay;
        relay = computed(() => previous.get());
      }
      const outer = relay;
      const branch = computed(() => (x.get() === 0 ? outer.get() : -1));

      expect(branch.get()).toBe(0);
      x.setValue(3);
      expect(branch.get()).toBe(-1);
      expect(outer.get()).toBe(3);
      expect(inner.get()).toBe(3);
    }
  });

  test("a branch observed by an effect drops and refreshes the cached computed", async () => {
    const x = cell(0);
    const cached = computed(() => x.get());
    const branch = computed(() => (x.get() === 0 ? cached.get() : 0));
    const seen: number[] = [];

    const stop = effect(() => {
      seen.push(branch.get());
    });

    x.setValue(3);
    await flushEffects();
    expect(cached.get()).toBe(3);

    stop();
    x.setValue(4);
    expect(branch.get()).toBe(0);
    expect(cached.get()).toBe(4);
    expect(seen).toEqual([0]);
  });

  test("recomputes only the dropped computed when it is read again", () => {
    const x = cell(0);
    let cachedRuns = 0;
    const cached = computed(() => {
      cachedRuns += 1;
      return x.get();
    });
    const branch = computed(() => (x.get() === 0 ? cached.get() : 0));

    branch.get();
    x.setValue(3);
    branch.get();
    expect(cachedRuns).toBe(1);
    expect(cached.get()).toBe(3);
    expect(cachedRuns).toBe(2);
    expect(cached.get()).toBe(3);
    expect(cachedRuns).toBe(2);
  });
});
