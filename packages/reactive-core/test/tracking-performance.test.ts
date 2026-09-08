import { readFile } from "node:fs/promises";
import { describe, expect, test } from "vitest";
import { flushEffects } from "../src/testing.js";
import { getCellSource } from "../src/cell.js";
import { runtimeState } from "../src/state.js";
import { cell, computed, effect } from "../src/index.js";
import { createCurrentCheckContext, untrackedDependencyIsCurrent } from "../src/state.js";
import type { CurrentCheckContext, Source } from "../src/state.js";

describe("reactive-core tracking hot path", () => {
  test("checks the ordered dependency fast path before same-pass duplicate tracking", async () => {
    const source = await readFile(new URL("../src/tracking.ts", import.meta.url), "utf8");

    const orderedFastPath = source.indexOf("orderedDeps[orderedIndex] === source");
    const duplicateCheck = source.indexOf(
      "source.trackedBy === computation && source.trackedVersion === trackingVersion",
    );

    expect(orderedFastPath).toBeGreaterThanOrEqual(0);
    expect(duplicateCheck).toBeGreaterThanOrEqual(0);
    expect(orderedFastPath).toBeLessThan(duplicateCheck);
  });

  test("uses the module dispatcher instead of per-computation tracking forwarders", async () => {
    const [state, computed, effect, tracking] = await Promise.all([
      readFile(new URL("../src/state.ts", import.meta.url), "utf8"),
      readFile(new URL("../src/computed.ts", import.meta.url), "utf8"),
      readFile(new URL("../src/effect.ts", import.meta.url), "utf8"),
      readFile(new URL("../src/tracking.ts", import.meta.url), "utf8"),
    ]);

    expect(state).not.toContain("trackSource?(source: Source): void");
    expect(computed).not.toMatch(/\btrackSource\(source\)\s*\{/);
    expect(effect).not.toMatch(/\btrackSource\(source\)\s*\{/);
    expect(tracking).toContain("trackIncrementalSource(source, tracker)");
  });

  test("shares effect computation methods across instances", async () => {
    const source = await readFile(new URL("../src/effect.ts", import.meta.url), "utf8");

    expect(source).toContain("const EFFECT_COMPUTATION_METHODS");
    expect(source).not.toContain("markDirty() {");
    expect(source).not.toContain("run() {");
    expect(source).not.toContain("dispose() {");
  });

  test("uses a direct teardown path for one tracked dependency", async () => {
    const source = await readFile(new URL("../src/tracking.ts", import.meta.url), "utf8");

    const singletonBranch = source.indexOf("if (computation.deps.size === 1)");
    const genericLoop = source.indexOf("for (const dep of computation.deps)");

    expect(singletonBranch).toBeGreaterThanOrEqual(0);
    expect(genericLoop).toBeGreaterThan(singletonBranch);
  });

  test("does not reuse a shared dependency result across snapshot versions", () => {
    let currentChecks = 0;
    const source = {
      subscribers: null,
      isCurrent: () => {
        currentChecks += 1;
        return true;
      },
    };
    const context = createCurrentCheckContext();

    expect(
      untrackedDependencyIsCurrent(
        {
          ref: new WeakRef(source),
          requiresCurrentCheckContext: true,
          version: 1,
        },
        context,
      ),
    ).toBe(false);
    expect(
      untrackedDependencyIsCurrent(
        {
          ref: new WeakRef(source),
          requiresCurrentCheckContext: true,
          version: 0,
        },
        context,
      ),
    ).toBe(true);
    expect(currentChecks).toBe(1);
  });

  test("checks a linear dormant dependency without a shared context", () => {
    let receivedContext: CurrentCheckContext | undefined;
    const source: Source = {
      subscribers: null,
      isCurrent: (context) => {
        receivedContext = context;
        return true;
      },
    };
    const check = untrackedDependencyIsCurrent as unknown as (
      dependency: { ref: WeakRef<Source>; version: number },
      context?: CurrentCheckContext,
    ) => boolean;

    expect(check({ ref: new WeakRef(source), version: 0 })).toBe(true);
    expect(receivedContext).toBeUndefined();
  });

  test("does not allocate a shared context for independent dormant cell inputs", () => {
    const originalWeakMap = globalThis.WeakMap;
    let allocations = 0;

    class CountingWeakMap<K extends object, V> {
      readonly map: WeakMap<K, V>;

      constructor(entries?: readonly (readonly [K, V])[] | null) {
        allocations += 1;
        this.map = new originalWeakMap<K, V>(entries);
      }

      delete(key: K): boolean {
        return this.map.delete(key);
      }

      get(key: K): V | undefined {
        return this.map.get(key);
      }

      has(key: K): boolean {
        return this.map.has(key);
      }

      set(key: K, value: V): this {
        this.map.set(key, value);
        return this;
      }
    }

    const first = cell(1);
    const second = cell(2);
    const total = computed(() => first.get() + second.get());
    expect(total.get()).toBe(3);

    Object.defineProperty(globalThis, "WeakMap", {
      configurable: true,
      value: CountingWeakMap,
      writable: true,
    });

    try {
      expect(total.get()).toBe(3);
      expect(allocations).toBe(0);
    } finally {
      Object.defineProperty(globalThis, "WeakMap", {
        configurable: true,
        value: originalWeakMap,
        writable: true,
      });
    }
  });

  test("validates shared dormant diamonds within a linear traversal bound", () => {
    const originalWeakRef = globalThis.WeakRef;
    let derefCount = 0;

    class CountingWeakRef<T extends object> {
      readonly ref: WeakRef<T>;

      constructor(value: T) {
        this.ref = new originalWeakRef(value);
      }

      deref(): T | undefined {
        derefCount += 1;
        return this.ref.deref();
      }
    }

    Object.defineProperty(globalThis, "WeakRef", {
      configurable: true,
      value: CountingWeakRef,
      writable: true,
    });

    try {
      for (const depth of [8, 12, 16, 18]) {
        let recomputations = 0;
        const source = cell(1);
        let current = computed(() => {
          recomputations += 1;
          return source.get();
        });

        for (let level = 0; level < depth; level += 1) {
          const previous = current;
          const left = computed(() => {
            recomputations += 1;
            return previous.get() + 1;
          });
          const right = computed(() => {
            recomputations += 1;
            return previous.get() + 2;
          });
          current = computed(() => {
            recomputations += 1;
            return left.get() + right.get();
          });
        }

        current.get();
        recomputations = 0;
        derefCount = 0;
        current.get();

        expect(recomputations, `depth ${depth} recomputations`).toBe(0);
        expect(derefCount, `depth ${depth} WeakRef dereferences`).toBeLessThanOrEqual(
          (depth + 1) * 8,
        );
      }
    } finally {
      Object.defineProperty(globalThis, "WeakRef", {
        configurable: true,
        value: originalWeakRef,
        writable: true,
      });
    }
  });
  test.each(["chain", "diamond"])(
    "attaches dormant %s graphs within a linear traversal bound",
    async (shape) => {
      const originalDeref = WeakRef.prototype.deref;
      let dereferences = 0;
      WeakRef.prototype.deref = function () {
        dereferences += 1;
        return originalDeref.call(this);
      };
      try {
        for (const depth of [16, 64, 128, 256]) {
          let runs = 0;
          const base = cell(0);
          let current = base as import("../src/index.js").ReadonlyCell<number>;
          for (let level = 0; level < depth; level += 1) {
            const previous = current;
            if (shape === "diamond") {
              const left = computed(() => {
                runs += 1;
                return previous.get() + 1;
              });
              const right = computed(() => {
                runs += 1;
                return previous.get() + 2;
              });
              current = computed(() => {
                runs += 1;
                return (left.get() + right.get()) / 2;
              });
            } else {
              current = computed(() => {
                runs += 1;
                return previous.get() + 1;
              });
            }
          }
          const expected = current.get();
          for (let subscription = 0; subscription < 2; subscription += 1) {
            runs = 0;
            dereferences = 0;
            let observed: number | undefined;
            const stop = effect(() => {
              observed = current.get();
            });
            const count = dereferences;
            expect(runtimeState.attachmentCheckContext).toBeUndefined();
            expect(observed).toBe(expected + (depth === 16 ? subscription : 0));
            expect(runs).toBe(0);
            expect(
              count,
              `${shape} depth ${depth}, subscription ${subscription}`,
            ).toBeLessThanOrEqual(depth * 24);
            try {
              // Keep updates below the runtime's 100-round cycle guard; deeper
              // graphs above exercise attachment without triggering propagation.
              if (depth === 16) {
                base.set(subscription + 1);
                await flushEffects();
                expect(observed).toBe(expected + subscription + 1);
              }
            } finally {
              stop();
            }
            expect(getCellSource(base)?.subscribers).toBeNull();
          }
        }
      } finally {
        WeakRef.prototype.deref = originalDeref;
      }
    },
  );
});
