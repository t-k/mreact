import { describe, expect, it } from "vitest";
import { cell } from "@reckona/mreact-reactive-core";
import { flushEffects } from "@reckona/mreact-reactive-core/testing";
import { effect } from "@reckona/mreact-reactive-core";
import { createVirtualGrid, createVirtualList } from "../src/index.js";

interface Row {
  id: string;
}

describe("reactive item sources", () => {
  it("recomputes entries when a cell-backed items source changes without refresh()", () => {
    const items = cell<readonly Row[]>([]);
    const virtual = createVirtualList({
      estimateItemSize: () => 20,
      getKey: (item) => item.id,
      items: () => items.get(),
      overscan: 0,
      scrollOffset: () => 0,
      viewportSize: () => 40,
    });

    expect(virtual.entries.get()).toEqual([]);

    items.set([{ id: "a" }, { id: "b" }]);

    expect(virtual.entries.get().map((entry) => entry.key)).toEqual(["a", "b"]);
    expect(virtual.totalSizePx.get()).toBe(40);
  });

  it("notifies entry subscribers when a cell-backed items source gains items", async () => {
    const items = cell<readonly Row[]>([]);
    const virtual = createVirtualList({
      estimateItemSize: () => 20,
      getKey: (item) => item.id,
      items: () => items.get(),
      overscan: 0,
      scrollOffset: () => 0,
      viewportSize: () => 40,
    });

    const seen: string[][] = [];
    const dispose = effect(() => {
      seen.push(virtual.entries.get().map((entry) => entry.key));
    });

    try {
      expect(seen).toEqual([[]]);

      items.set([{ id: "a" }, { id: "b" }]);
      await flushEffects();

      expect(seen.at(-1)).toEqual(["a", "b"]);
    } finally {
      dispose();
    }
  });

  it("recomputes the visible range when a cell-backed scroll offset changes", () => {
    const scrollTop = cell(0);
    const items = Array.from({ length: 100 }, (_unused, index) => ({ id: `item-${index}` }));
    const virtual = createVirtualList({
      estimateItemSize: () => 40,
      getKey: (item) => item.id,
      items: () => items,
      overscan: 0,
      scrollOffset: () => scrollTop.get(),
      viewportSize: () => 80,
    });

    expect(virtual.visibleRange.get()).toMatchObject({ startIndex: 0, endIndex: 2 });

    scrollTop.set(400);

    expect(virtual.visibleRange.get()).toMatchObject({ startIndex: 10, endIndex: 12 });
    expect(virtual.topSpacerPx.get()).toBe(400);
  });

  it("recomputes grid entries when a cell-backed column count changes", () => {
    const columns = cell(2);
    const items = Array.from({ length: 8 }, (_unused, index) => ({ id: `item-${index}` }));
    const virtual = createVirtualGrid({
      estimateItemSize: () => 50,
      getColumnCount: () => columns.get(),
      getKey: (item) => item.id,
      items: () => items,
      overscan: 0,
      scrollOffset: () => 0,
      viewportSize: () => 50,
    });

    expect(virtual.range.get().columnCount).toBe(2);
    expect(virtual.entries.get()).toHaveLength(2);

    columns.set(4);

    expect(virtual.range.get().columnCount).toBe(4);
    expect(virtual.entries.get()).toHaveLength(4);
  });

  it("does not notify entry subscribers when a scroll change keeps the window identical", async () => {
    const scrollTop = cell(5);
    const items = Array.from({ length: 100 }, (_unused, index) => ({ id: `item-${index}` }));
    const virtual = createVirtualList({
      estimateItemSize: () => 40,
      getKey: (item) => item.id,
      items: () => items,
      overscan: 0,
      scrollOffset: () => scrollTop.get(),
      viewportSize: () => 80,
    });

    let notifications = 0;
    const dispose = effect(() => {
      virtual.entries.get();
      notifications += 1;
    });

    try {
      expect(notifications).toBe(1);
      expect(virtual.visibleRange.get()).toMatchObject({ startIndex: 0, endIndex: 3 });

      // Move within the same 40px row so the rendered window does not change.
      scrollTop.set(15);
      await flushEffects();

      expect(virtual.visibleRange.get()).toMatchObject({ startIndex: 0, endIndex: 3 });
      expect(notifications).toBe(1);
    } finally {
      dispose();
    }
  });

  it("reuses measured row layout when only scroll offset changes", () => {
    const scrollTop = cell(0);
    const items = Array.from({ length: 100 }, (_unused, index) => ({ id: `item-${index}` }));
    let estimateCalls = 0;
    const virtual = createVirtualGrid({
      estimateItemSize: () => {
        estimateCalls += 1;
        return 40;
      },
      getColumnCount: () => 2,
      getKey: (item) => item.id,
      items: () => items,
      overscan: 0,
      scrollOffset: () => scrollTop.get(),
      viewportSize: () => 80,
    });

    virtual.measureItem("item-0", 60);
    virtual.entries.get();
    const callsAfterMeasure = estimateCalls;

    scrollTop.set(160);
    virtual.entries.get();

    expect(estimateCalls).toBe(callsAfterMeasure);
  });
});
