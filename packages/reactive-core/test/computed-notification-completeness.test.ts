import { describe, expect, test } from "vitest";
import { batch, cell, computed, effect, untrack } from "../src/index.js";
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

describe("early-read publish skips the reader", () => {
  test.each([
    ["outside a batch", false],
    ["inside a batch", true],
  ] as const)("does not recompute the sole reader again (%s)", async (_label, inBatch) => {
    const x = cell(1);
    const shared = computed(() => x.get());
    let readerRuns = 0;
    const reader = computed(() => {
      readerRuns += 1;
      return shared.get() * 10;
    });
    untrack(() => reader.get());
    x.setValue(2);

    const seen: number[] = [];
    let stop = () => {};
    const subscribe = () => {
      stop = effect(() => {
        seen.push(reader.get());
      });
    };
    if (inBatch) {
      batch(subscribe);
    } else {
      subscribe();
    }

    try {
      await flushEffects();
      // The stale dormant chain refreshed while the reader attached, and the
      // reader is the only subscriber of the shared computed: it already holds
      // the value, so nothing may schedule it again.
      expect(seen).toEqual([20]);
      expect(readerRuns).toBe(2);

      x.setValue(3);
      await flushEffects();
      expect(seen).toEqual([20, 30]);
      expect(readerRuns).toBe(3);
    } finally {
      stop();
    }
  });

  test("does not recompute the reader among several subscribers again", async () => {
    const x = cell(1);
    const shared = computed(() => x.get());
    const sibling = computed(() => shared.get() + 1);
    let readerRuns = 0;
    const reader = computed(() => {
      readerRuns += 1;
      return shared.get() * 10 + sibling.get();
    });
    untrack(() => reader.get());
    x.setValue(2);

    const seen: number[] = [];
    const stop = effect(() => {
      seen.push(reader.get());
    });

    try {
      await flushEffects();
      expect(seen).toEqual([23]);
      expect(readerRuns).toBe(2);

      x.setValue(3);
      await flushEffects();
      expect(seen).toEqual([23, 34]);
      expect(readerRuns).toBe(3);
    } finally {
      stop();
    }
  });
});

describe("computed notification baseline after subscriber turnover", () => {
  test("a new subscriber that read a value the old baseline never announced still hears the next change", async () => {
    const flag = cell(false);
    const amount = cell(3);
    const first = computed(() => (flag.get() ? amount.get() + 8 : 8));
    const second = computed(() => (first.get() % 2 === 0 ? first.get() + 8 : amount.get() + 8));
    const result = computed(() => (second.get() % 3 === 0 ? 8 : first.get()));
    const view = computed(() => result.get());
    const seen: number[] = [];

    const stopFirstObserver = effect(() => {
      second.get();
    });
    expect(result.get()).toBe(8);
    stopFirstObserver();

    flag.setValue(true);

    const stop = effect(() => {
      seen.push(view.get());
    });

    try {
      expect(seen).toEqual([11]);

      amount.setValue(2);
      await flushEffects();

      expect(result.get()).toBe(8);
      expect(view.get()).toBe(8);
      expect(seen).toEqual([11, 8]);
    } finally {
      stop();
    }
  });

  test("keeps the early-read baseline and the turnover baseline consistent when the value returns to its old published value", async () => {
    for (const primeBeforeSubscribe of [false, true]) {
      const x = cell(1);
      const a = computed(() => x.get());
      const b = computed(() => a.get() * 2);
      const seen: number[] = [];

      const stopA = effect(() => {
        a.get();
      });
      if (primeBeforeSubscribe) {
        expect(b.get()).toBe(2);
      }
      stopA();

      x.setValue(5);
      const stopB = effect(() => {
        seen.push(b.get());
      });

      try {
        expect(seen).toEqual([10]);

        x.setValue(1);
        await flushEffects();

        expect(b.get()).toBe(2);
        expect(seen).toEqual([10, 2]);
      } finally {
        stopB();
      }
    }
  });
});

describe("pulling a queued dependency inside a tracked recompute", () => {
  test("keeps the reader's earlier stamped dependencies when the pulled publish reads the same cell", async () => {
    const a = cell(1);
    const x = cell(10);
    const y = cell(0);
    let p: ReturnType<typeof computed<number>> | undefined;
    // m forward-references p, so m is created before the computed it depends on,
    // and it never changes, so o can only learn about a through its own edge.
    const m = computed(() => ((p as ReturnType<typeof computed<number>>).get(), 1));
    // o reads a first, then x on odd values, then m; the parity switch defeats the
    // ordered fast path so a is tracked through the per-source stamp instead.
    const o = computed(() => a.get() + (a.get() % 2 === 1 ? x.get() : 0) + m.get());
    // p reads a and y in a parity-dependent order, so its own ordered fast path is
    // gone by the third run and it stamps a while o is still mid-recompute.
    p = computed(() => (a.get() % 2 === 1 ? a.get() * 100 + y.get() : y.get() + a.get() * 100));
    const seen: number[] = [];
    const stop = effect(() => {
      seen.push(o.get());
    });

    try {
      expect(seen).toEqual([12]);

      a.setValue(2);
      await flushEffects();
      expect(o.get()).toBe(3);

      a.setValue(3);
      await flushEffects();
      expect(o.get()).toBe(14);

      a.setValue(4);
      await flushEffects();
      expect(o.get()).toBe(5);

      a.setValue(5);
      await flushEffects();
      expect(o.get()).toBe(16);
      expect(seen).toEqual([12, 3, 14, 5, 16]);
    } finally {
      stop();
    }
  });
});

describe("computed invalidated while its own recompute is on the stack", () => {
  test("keeps the invalidation when a nested read publishes a dependency it already read", async () => {
    const x = cell(1);
    const y = cell(1);
    // `a` is created before `late`, so the flush order by id runs `reader`
    // before `late` even though `reader` depends on it transitively.
    let late!: ReturnType<typeof computed<number>>;
    const a = computed(() => x.get() + late.get());
    const b = computed(() => a.get());
    const d = computed(() => b.get());
    const reader = computed(() => b.get() + a.get() + d.get() + y.get());
    late = computed(() => y.get() * 2);
    const seen: number[] = [];
    const stops = [a, b, d, late].map((node) =>
      effect(() => {
        node.get();
      }),
    );
    stops.push(
      effect(() => {
        seen.push(reader.get());
      }),
    );

    try {
      expect(seen).toEqual([10]);

      // `reader` reads the stale `b` first, then `a`, whose read pulls the
      // queued `late`, refreshes `a`, and queues `b`. Reading `d` then runs
      // that queued publish of `b`, which marks `reader` dirty while its own
      // recompute is still running. That invalidation must survive.
      y.setValue(2);
      await flushEffects();

      expect(reader.get()).toBe(17);
      expect(seen).toEqual([10, 17]);
    } finally {
      for (const stop of stops) stop();
    }
  });
});

describe("reading a clean intermediate whose dependency is queued during a flush", () => {
  test("a consumer created before that dependency recomputes once per update", async () => {
    const x = cell(1);
    let consumerRuns = 0;
    let intermediate: { get(): number } = { get: () => 0 };
    const consumer = computed(() => {
      consumerRuns += 1;
      return x.get() + intermediate.get();
    });
    let late: { get(): number } = { get: () => 0 };
    intermediate = computed(() => late.get());
    late = computed(() => x.get() * 2);
    const seen: number[] = [];
    const stop = effect(() => {
      seen.push(consumer.get());
    });

    try {
      expect(seen).toEqual([3]);
      consumerRuns = 0;

      x.setValue(2);
      await flushEffects();

      expect(seen).toEqual([3, 6]);
      // Without pulling the queued publish behind the clean intermediate, the
      // consumer would first read the stale intermediate and run a second time.
      expect(consumerRuns).toBe(1);
    } finally {
      stop();
    }
  });
});
