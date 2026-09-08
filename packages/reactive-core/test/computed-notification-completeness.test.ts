import { describe, expect, test } from "vitest";
import { cell, computed, effect, untrack } from "../src/index.js";
import { flushEffects } from "../src/testing.js";

describe("computed notification completeness", () => {
  test("an early read through a longer path does not swallow the change for other consumers", async () => {
    const x = cell(1);
    const zero = cell(0);

    const a = computed(() => x.get());
    const b = computed(() => zero.get() + a.get());
    const c = computed(() => zero.get() + b.get());
    const d = computed(() => x.get());

    const left = computed(() => d.get() + c.get());
    const right = computed(() => c.get());

    const seen: number[] = [];
    const disposeLeft = effect(() => {
      left.get();
    });
    const disposeRight = effect(() => {
      seen.push(right.get());
    });

    try {
      x.setValue(8);
      await flushEffects();

      expect(left.get()).toBe(16);
      expect(right.get()).toBe(8);
      expect(seen).toEqual([1, 8]);

      x.setValue(3);
      await flushEffects();

      expect(right.get()).toBe(3);
      expect(seen).toEqual([1, 8, 3]);
    } finally {
      disposeLeft();
      disposeRight();
    }
  });

  test("matches a pure reference model across creation and subscription orders", async () => {
    const orders: Array<readonly ["left" | "right", "left" | "right"]> = [
      ["left", "right"],
      ["right", "left"],
    ];

    for (const order of orders) {
      const x = cell(1);
      const y = cell(10);
      const a = computed(() => x.get());
      const b = computed(() => a.get() + y.get());
      const c = computed(() => b.get() * 2);
      const d = computed(() => x.get() * 3);
      const nodes = {
        left: computed(() => d.get() + c.get()),
        right: computed(() => c.get() + a.get()),
      };
      const reference = (xv: number, yv: number) => ({
        left: xv * 3 + (xv + yv) * 2,
        right: (xv + yv) * 2 + xv,
      });
      const seen: Record<"left" | "right", number[]> = { left: [], right: [] };
      const disposers = order.map((name) =>
        effect(() => {
          seen[name].push(nodes[name].get());
        }),
      );

      try {
        const writes: Array<[number, number]> = [
          [8, 10],
          [8, 5],
          [2, 5],
          [2, 5],
          [9, 1],
        ];
        let expectedLeft = [reference(1, 10).left];
        let expectedRight = [reference(1, 10).right];

        for (const [xv, yv] of writes) {
          x.setValue(xv);
          y.setValue(yv);
          await flushEffects();
          const expected = reference(xv, yv);

          expect(nodes.left.get(), JSON.stringify(order)).toBe(expected.left);
          expect(nodes.right.get(), JSON.stringify(order)).toBe(expected.right);
          if (expectedLeft.at(-1) !== expected.left) {
            expectedLeft = [...expectedLeft, expected.left];
          }
          if (expectedRight.at(-1) !== expected.right) {
            expectedRight = [...expectedRight, expected.right];
          }
        }

        expect(seen.left, JSON.stringify(order)).toEqual(expectedLeft);
        expect(seen.right, JSON.stringify(order)).toEqual(expectedRight);
      } finally {
        for (const dispose of disposers) {
          dispose();
        }
      }
    }
  });
});

describe("computed publish baseline", () => {
  test("does not renotify consumers when a later publish yields an equal value", async () => {
    const x = cell(2);
    const magnitude = computed(() => Math.abs(x.get()));
    const seen: number[] = [];
    const dispose = effect(() => {
      seen.push(magnitude.get());
    });

    try {
      x.setValue(-2);
      await flushEffects();
      x.setValue(2);
      await flushEffects();
      x.setValue(3);
      await flushEffects();

      expect(seen).toEqual([2, 3]);
    } finally {
      dispose();
    }
  });

  test("renotifies consumers after a throwing recompute recovers to the previous value", async () => {
    const x = cell(5);
    const guarded = computed(() => {
      const current = x.get();
      if (current === 1) {
        throw new Error("boom");
      }
      return current;
    });
    const seen: Array<number | "error"> = [];
    const dispose = effect(() => {
      try {
        seen.push(guarded.get());
      } catch {
        seen.push("error");
      }
    });

    try {
      x.setValue(1);
      await flushEffects();
      x.setValue(5);
      await flushEffects();

      expect(seen).toEqual([5, "error", 5]);
    } finally {
      dispose();
    }
  });
});

describe("computed publish baseline before queueing", () => {
  test.each([
    ["value effect first", "value"],
    ["total effect first", "total"],
  ] as const)(
    "an early read of a shared computed that is not yet queued does not swallow the change (%s)",
    async (_label, first) => {
      const x = cell(0);

      const a = computed(() => x.get());
      const b = computed(() => a.get());
      const c = computed(() => b.get());
      const value = computed(() => c.get());
      const branch = computed(() => (x.get() > 0 ? c.get() : x.get()));
      const total = computed(() => value.get() + branch.get());

      // Build the cache while nothing subscribes.
      total.get();

      const seen: number[] = [];
      const totals: number[] = [];
      const subscribeValue = () =>
        effect(() => {
          seen.push(value.get());
        });
      const subscribeTotal = () =>
        effect(() => {
          totals.push(total.get());
        });
      const stopFirst = first === "value" ? subscribeValue() : subscribeTotal();
      const stopSecond = first === "value" ? subscribeTotal() : subscribeValue();

      try {
        x.setValue(3);
        await flushEffects();

        expect(value.get()).toBe(3);
        expect(total.get()).toBe(6);
        expect(seen).toEqual([0, 3]);
        expect(totals).toEqual([0, 6]);

        x.setValue(0);
        await flushEffects();

        expect(value.get()).toBe(0);
        expect(total.get()).toBe(0);
        expect(seen).toEqual([0, 3, 0]);
        expect(totals).toEqual([0, 6, 0]);
      } finally {
        stopFirst();
        stopSecond();
      }
    },
  );
});

describe("computed publish deferral during reads", () => {
  test("attaching a dormant graph with stale caches publishes once and keeps later updates", async () => {
    const x = cell(3);
    const n1 = computed(() => x.get());
    const n2 = computed(() => x.get());
    const n3 = computed(() => n1.get() + n2.get());
    const n4 = computed(() => n2.get() + n3.get() + n1.get());
    const n6 = computed(() => n4.get());
    untrack(() => [n1, n2, n3, n4, n6].map((node) => node.get()));

    const stopFirst = effect(() => {
      n1.get();
    });
    x.setValue(2);
    await flushEffects();

    const seen: number[] = [];
    const stopSecond = effect(() => {
      seen.push(n6.get());
    });

    try {
      // The stale dormant chain refreshed while the effect attached: nobody
      // else is owed that value, so the effect must not run again for it.
      await flushEffects();
      expect(seen).toEqual([8]);

      x.setValue(1);
      expect(untrack(() => n6.get())).toBe(4);
      await flushEffects();
      expect(seen).toEqual([8, 4]);

      x.setValue(3);
      expect(untrack(() => n6.get())).toBe(12);
      await flushEffects();
      expect(seen).toEqual([8, 4, 12]);
    } finally {
      stopFirst();
      stopSecond();
    }
  });

  test("a publish that queues an earlier computed runs it before later consumers in the same pass", async () => {
    const x = cell(2);
    const a = computed(() => x.get());
    const b = computed(() => a.get());
    // c subscribes to x directly and is created after b, so an x write queues
    // a and c while b only becomes pending once a publishes.
    const c = computed(() => x.get() + a.get() + b.get());
    const seen: number[] = [];
    const stop = effect(() => {
      seen.push(c.get());
    });

    try {
      x.setValue(1);
      expect(untrack(() => c.get())).toBe(3);
      await flushEffects();
      expect(seen).toEqual([6, 3]);

      x.setValue(4);
      await flushEffects();
      expect(seen).toEqual([6, 3, 12]);
    } finally {
      stop();
    }
  });
});
