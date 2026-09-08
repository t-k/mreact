import { describe, expect, test } from "vitest";
import { cell, computed, effect } from "../src/index.js";
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
