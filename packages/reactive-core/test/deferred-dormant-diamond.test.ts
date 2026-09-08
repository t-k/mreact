import { describe, expect, test } from "vitest";
import { batch, cell, computed, effect } from "../src/index.js";
import { deferredComputed, setScheduler } from "../src/internal.js";

describe.each(["microtask", "sync", "queued"] as const)(
  "shared dormant deferred (%s scheduler)",
  (scheduler) => {
    test.each(["middle-first", "leaf-first"] as const)(
      "refreshes both consumers in %s read order",
      async (order) => {
        const callbacks: Array<() => void> = [];
        const restore =
          scheduler === "microtask"
            ? () => {}
            : setScheduler({
                schedule: (callback) =>
                  scheduler === "sync" ? callback() : void callbacks.push(callback),
              });
        const source = cell(0);
        const first = computed(() => source.get());
        let middleRuns = 0;
        const middle = deferredComputed(() => {
          middleRuns++;
          return first.get();
        });
        const leaf = computed(() => middle.get());
        const total = computed(() =>
          order === "middle-first" ? middle.get() + leaf.get() : leaf.get() + middle.get(),
        );
        expect(total.get()).toBe(0);
        const seen: number[] = [];
        const stop = effect(() => {
          seen.push(leaf.get());
        });
        try {
          for (const value of [1, 2]) {
            batch(() => {
              source.setValue(value);
              expect.soft(total.get()).toBe(value * 2);
              expect(seen).toEqual(value === 1 ? [0] : [0, 1]);
            });
            while (callbacks.length) callbacks.shift()!();
            await new Promise<void>((resolve) => setTimeout(resolve, 0));
            // Check notification delivery before any read could repair the graph.
            expect.soft(seen).toEqual(value === 1 ? [0, 1] : [0, 1, 2]);
            expect.soft(total.get()).toBe(value * 2);
            expect.soft(leaf.get()).toBe(value);
            expect(middleRuns).toBe(value + 1);
          }
        } finally {
          stop();
          restore();
        }
      },
    );
    test("keeps a shared iterator branch lazy through nested batches", async () => {
      const callbacks: Array<() => void> = [];
      const restore =
        scheduler === "microtask"
          ? () => {}
          : setScheduler({
              schedule: (callback) =>
                scheduler === "sync" ? callback() : void callbacks.push(callback),
            });
      const source = cell(0);
      const first = computed(() => source.get());
      const middle = deferredComputed(() => first.get());
      const leaf = computed(() => middle.get());
      const total = computed(() => middle.get() + leaf.get());
      total.get();
      const consumed: number[] = [];
      function* values(value: number) {
        consumed.push(value);
        yield value;
      }
      const items = cell(values(0));
      const consumer = deferredComputed(() => {
        middle.get();
        return items.get().next().value;
      });
      const seen: number[] = [];
      const stopLeaf = effect(() => {
        seen.push(leaf.get());
      });
      const stopConsumer = effect(() => {
        consumer.get();
      });
      try {
        batch(() => {
          source.setValue(1);
          items.setValue(values(1));
          expect(total.get()).toBe(2);
          batch(() => {
            source.setValue(2);
            items.setValue(values(2));
            expect(total.get()).toBe(4);
          });
          source.setValue(3);
          items.setValue(values(3));
          expect(consumed).toEqual([0]);
          expect(seen).toEqual([0]);
        });
        while (callbacks.length) callbacks.shift()!();
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
        expect(seen).toEqual([0, 3]);
        expect(consumed).toEqual([0, 3]);
        expect(total.get()).toBe(6);
      } finally {
        stopConsumer();
        stopLeaf();
        restore();
      }
    });
  },
);
