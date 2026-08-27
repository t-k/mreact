import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { calculateVirtualRange, createVirtualGrid, createVirtualList } from "../src/index.js";

describe("calculateVirtualRange", () => {
  it("computes fixed-size list ranges at the start, middle, and end", () => {
    expect(
      calculateVirtualRange({
        itemCount: 100,
        itemSize: 50,
        overscan: 1,
        scrollOffset: 0,
        viewportSize: 100,
      }),
    ).toMatchObject({
      startIndex: 0,
      endIndex: 3,
      visibleStartIndex: 0,
      visibleEndIndex: 2,
      topSpacerPx: 0,
      bottomSpacerPx: 4_850,
      totalSizePx: 5_000,
    });

    expect(
      calculateVirtualRange({
        itemCount: 100,
        itemSize: 50,
        overscan: 1,
        scrollOffset: 225,
        viewportSize: 100,
      }),
    ).toMatchObject({
      startIndex: 3,
      endIndex: 8,
      visibleStartIndex: 4,
      visibleEndIndex: 7,
      topSpacerPx: 150,
      bottomSpacerPx: 4_600,
      totalSizePx: 5_000,
    });

    expect(
      calculateVirtualRange({
        itemCount: 100,
        itemSize: 50,
        overscan: 1,
        scrollOffset: 4_900,
        viewportSize: 100,
      }),
    ).toMatchObject({
      startIndex: 97,
      endIndex: 100,
      visibleStartIndex: 98,
      visibleEndIndex: 100,
      topSpacerPx: 4_850,
      bottomSpacerPx: 0,
      totalSizePx: 5_000,
    });
  });

  it("computes responsive grid ranges by row and keeps rendered items bounded", () => {
    const range = calculateVirtualRange({
      columnCount: 3,
      itemCount: 500,
      itemSize: 120,
      overscan: 2,
      scrollOffset: 1_200,
      viewportSize: 360,
    });

    expect(range).toMatchObject({
      startIndex: 24,
      endIndex: 45,
      visibleStartIndex: 30,
      visibleEndIndex: 39,
      topSpacerPx: 960,
      totalSizePx: 20_040,
    });
    expect(range.endIndex - range.startIndex).toBeLessThanOrEqual(21);
    expect(range.bottomSpacerPx).toBe(18_240);
  });

  it("keeps empty lists and invalid inputs safe", () => {
    expect(
      calculateVirtualRange({
        columnCount: 0,
        itemCount: 0,
        itemSize: Number.NaN,
        overscan: -1,
        scrollOffset: -100,
        viewportSize: -100,
      }),
    ).toEqual({
      bottomSpacerPx: 0,
      columnCount: 1,
      endIndex: 0,
      endRow: 0,
      itemCount: 0,
      rowCount: 0,
      startIndex: 0,
      startRow: 0,
      topSpacerPx: 0,
      totalSizePx: 0,
      visibleEndIndex: 0,
      visibleEndRow: 0,
      visibleStartIndex: 0,
      visibleStartRow: 0,
    });
  });

  it("preserves range ordering and spacer geometry for arbitrary valid inputs", () => {
    fc.assert(
      fc.property(
        fc.record({
          columnCount: fc.integer({ min: 1, max: 32 }),
          itemCount: fc.integer({ min: 1, max: 10_000 }),
          itemSize: fc.integer({ min: 1, max: 2_000 }),
          overscan: fc.integer({ min: 0, max: 100 }),
          scrollOffset: fc.integer({ min: 0, max: 20_000_000 }),
          viewportSize: fc.integer({ min: 0, max: 20_000 }),
        }),
        (options) => {
          const range = calculateVirtualRange(options);

          expect(range.startRow).toBeLessThanOrEqual(range.visibleStartRow);
          expect(range.visibleStartRow).toBeLessThanOrEqual(range.visibleEndRow);
          expect(range.visibleEndRow).toBeLessThanOrEqual(range.endRow);
          expect(range.endRow).toBeLessThanOrEqual(range.rowCount);
          expect(range.startIndex).toBeLessThanOrEqual(range.visibleStartIndex);
          expect(range.visibleStartIndex).toBeLessThanOrEqual(range.visibleEndIndex);
          expect(range.visibleEndIndex).toBeLessThanOrEqual(range.endIndex);
          expect(range.endIndex).toBeLessThanOrEqual(range.itemCount);

          expect(range.startIndex).toBe(
            Math.min(options.itemCount, range.startRow * options.columnCount),
          );
          expect(range.endIndex).toBe(
            Math.min(options.itemCount, range.endRow * options.columnCount),
          );
          expect(range.topSpacerPx).toBe(range.startRow * options.itemSize);
          expect(range.bottomSpacerPx).toBe((range.rowCount - range.endRow) * options.itemSize);
          expect(
            range.topSpacerPx +
              (range.endRow - range.startRow) * options.itemSize +
              range.bottomSpacerPx,
          ).toBe(range.totalSizePx);
        },
      ),
      { numRuns: 1_000, seed: 20_260_835 },
    );
  });
});

describe("createVirtualList", () => {
  it("exposes stable keyed entries, spacers, visible range, and scroll helpers", () => {
    const items = Array.from({ length: 100 }, (_unused, index) => ({ id: `item-${index}` }));
    const virtual = createVirtualList({
      estimateItemSize: () => 40,
      getKey: (item) => item.id,
      items: () => items,
      overscan: 1,
      scrollOffset: () => 120,
      viewportSize: () => 80,
    });

    expect(virtual.visibleRange.get()).toMatchObject({
      startIndex: 3,
      endIndex: 5,
    });
    expect(virtual.entries.get().map((entry) => entry.key)).toEqual([
      "item-2",
      "item-3",
      "item-4",
      "item-5",
    ]);
    expect(virtual.topSpacerPx.get()).toBe(80);
    expect(virtual.bottomSpacerPx.get()).toBe(3_760);
    expect(virtual.scrollToIndex(5)).toBe(200);
    expect(virtual.scrollToKey("item-5")).toBe(200);
  });

  it("preserves keyed identity across prepend and append changes", () => {
    let items = Array.from({ length: 6 }, (_unused, index) => ({ id: `item-${index}` }));
    const virtual = createVirtualList({
      estimateItemSize: () => 20,
      getKey: (item) => item.id,
      items: () => items,
      overscan: 0,
      scrollOffset: () => 40,
      viewportSize: () => 40,
    });

    expect(virtual.entries.get().map((entry) => [entry.index, entry.key])).toEqual([
      [2, "item-2"],
      [3, "item-3"],
    ]);

    items = [{ id: "prepended" }, ...items, { id: "appended" }];
    virtual.refresh();

    expect(virtual.entries.get().map((entry) => [entry.index, entry.key])).toEqual([
      [2, "item-1"],
      [3, "item-2"],
    ]);
    expect(virtual.scrollToKey("item-2")).toBe(60);
    expect(virtual.scrollToKey("appended")).toBe(140);
  });

  it("refreshes measured geometry after items mutate in place", () => {
    const items = Array.from({ length: 10 }, (_unused, index) => ({ id: `item-${index}` }));
    const virtual = createVirtualList({
      estimateItemSize: () => 100,
      getKey: (item) => item.id,
      items: () => items,
      overscan: 0,
      scrollOffset: () => 0,
      viewportSize: () => 300,
    });

    virtual.measureItem("item-0", 100);
    expect(virtual.totalSizePx.get()).toBe(1_000);

    items.push(...Array.from({ length: 10 }, (_unused, index) => ({ id: `added-${index}` })));
    virtual.refresh();

    expect(virtual.range.get().itemCount).toBe(20);
    expect(virtual.totalSizePx.get()).toBe(2_000);
    expect(virtual.bottomSpacerPx.get()).toBe(1_700);
    expect(virtual.scrollToIndex(19)).toBe(1_900);
  });

  it("rebuilds measured offsets after items reorder in place", () => {
    const items = [{ id: "measured" }, { id: "middle" }, { id: "tail" }];
    const virtual = createVirtualList({
      estimateItemSize: () => 100,
      getKey: (item) => item.id,
      items: () => items,
      overscan: 0,
      scrollOffset: () => 0,
      viewportSize: () => 100,
    });

    virtual.measureItem("measured", 200);
    expect(virtual.scrollToKey("measured")).toBe(0);

    items.push(items.shift() as { id: string });
    virtual.refresh();

    expect(virtual.scrollToKey("measured")).toBe(200);
    expect(virtual.totalSizePx.get()).toBe(400);
  });

  it("keeps fixed-size refresh cost independent of item count", () => {
    const items = Array.from({ length: 100_000 }, (_unused, index) => ({ id: `row-${index}` }));
    let estimateCalls = 0;
    const virtual = createVirtualList({
      estimateItemSize: () => {
        estimateCalls += 1;
        return 24;
      },
      getKey: (item) => item.id,
      items: () => items,
      overscan: 2,
      scrollOffset: () => 24_000,
      viewportSize: () => 240,
    });

    expect(virtual.entries.get()).toHaveLength(14);
    expect(estimateCalls).toBe(1);

    virtual.refresh();

    expect(virtual.entries.get()).toHaveLength(14);
    expect(estimateCalls).toBe(2);
  });

  it("reuses a key index for repeated scrollToKey lookups on large item sets", () => {
    const items = Array.from({ length: 100_000 }, (_unused, index) => ({ id: `row-${index}` }));
    let keyCalls = 0;
    const virtual = createVirtualList({
      estimateItemSize: () => 24,
      getKey: (item) => {
        keyCalls += 1;
        return item.id;
      },
      items: () => items,
      overscan: 0,
      scrollOffset: () => 0,
      viewportSize: () => 240,
    });
    virtual.entries.get();
    keyCalls = 0;

    expect(virtual.scrollToKey("row-50000")).toBe(1_200_000);
    expect(virtual.scrollToKey("row-50000")).toBe(1_200_000);
    expect(virtual.scrollToKey("row-50000")).toBe(1_200_000);

    expect(keyCalls).toBeLessThanOrEqual(100_003);
  });

  it("keeps the key index across measurement-only geometry updates", () => {
    const items = Array.from({ length: 100_000 }, (_unused, index) => ({ id: `row-${index}` }));
    let keyCalls = 0;
    const virtual = createVirtualList({
      estimateItemSize: () => 24,
      getKey: (item) => {
        keyCalls += 1;
        return item.id;
      },
      items: () => items,
      overscan: 0,
      scrollOffset: () => 0,
      viewportSize: () => 240,
    });

    expect(virtual.scrollToKey("row-50000")).toBe(1_200_000);
    virtual.measureItem("row-0", 32);
    virtual.entries.get();
    keyCalls = 0;

    expect(virtual.scrollToKey("row-50000")).toBe(1_200_008);
    expect(keyCalls).toBeLessThanOrEqual(1);
  });

  it("repairs a cached key index after an in-place reorder", () => {
    const items = [{ id: "a" }, { id: "b" }, { id: "c" }];
    const virtual = createVirtualList({
      estimateItemSize: () => 20,
      getKey: (item) => item.id,
      items: () => items,
      overscan: 0,
      scrollOffset: () => 0,
      viewportSize: () => 20,
    });

    expect(virtual.scrollToKey("a")).toBe(0);
    items.push(items.shift() as { id: string });

    expect(virtual.scrollToKey("a")).toBe(40);
  });

  it("refreshes the key index after replacement and filtering", () => {
    const firstItems = Array.from({ length: 5 }, (_unused, index) => ({ id: `old-${index}` }));
    const nextItems = [{ id: "new-0" }, { id: "old-3" }];
    let items = firstItems;
    const virtual = createVirtualList({
      estimateItemSize: () => 20,
      getKey: (item) => item.id,
      items: () => items,
      overscan: 0,
      scrollOffset: () => 0,
      viewportSize: () => 40,
    });

    expect(virtual.scrollToKey("old-3")).toBe(60);

    items = nextItems;
    virtual.refresh();

    expect(virtual.scrollToKey("old-0")).toBeUndefined();
    expect(virtual.scrollToKey("old-3")).toBe(20);
  });

  it("scroll helpers refresh stale snapshots before computing offsets", () => {
    let items = Array.from({ length: 3 }, (_unused, index) => ({ id: `old-${index}` }));
    const virtual = createVirtualList({
      estimateItemSize: () => 20,
      getKey: (item) => item.id,
      items: () => items,
      overscan: 0,
      scrollOffset: () => 0,
      viewportSize: () => 40,
    });

    virtual.measureItem("old-0", 100);
    expect(virtual.scrollToIndex(2)).toBe(120);

    items = Array.from({ length: 3 }, (_unused, index) => ({ id: `new-${index}` }));

    expect(virtual.scrollToIndex(2)).toBe(40);
    expect(virtual.scrollToKey("new-2")).toBe(40);
  });
});

describe("createVirtualGrid", () => {
  it("clamps unbounded row spans before probing grid placement", () => {
    const virtual = createVirtualGrid({
      estimateItemSize: () => 20,
      getColumnCount: () => 2,
      getItemSpan: () => ({ rowSpan: Number.MAX_SAFE_INTEGER }),
      getKey: (item: { id: string }) => item.id,
      items: () => [{ id: "a" }],
      overscan: 0,
      scrollOffset: () => 0,
      viewportSize: () => 20,
    });

    const entry = virtual.entries.get()[0];

    expect(entry?.rowSpan).toBeLessThanOrEqual(1_000);
    expect(virtual.range.get().rowCount).toBeLessThanOrEqual(1_000);
  });
});

describe("createVirtualGrid", () => {
  it("computes span-aware ranges for mixed one-by-one and two-by-two grid items", () => {
    const items = Array.from({ length: 12 }, (_unused, index) => ({ id: `item-${index}` }));
    const virtual = createVirtualGrid({
      estimateItemSize: () => 100,
      getColumnCount: () => 3,
      getItemSpan: (_item, index) =>
        index === 0 || index === 7 ? { colSpan: 2, rowSpan: 2 } : { colSpan: 1, rowSpan: 1 },
      getKey: (item) => item.id,
      items: () => items,
      overscan: 0,
      scrollOffset: () => 100,
      viewportSize: () => 200,
    });

    expect(virtual.range.get()).toMatchObject({
      startIndex: 0,
      endIndex: 6,
      visibleStartIndex: 0,
      visibleEndIndex: 6,
      startRow: 1,
      endRow: 3,
      rowCount: 6,
      topSpacerPx: 100,
      bottomSpacerPx: 300,
      totalSizePx: 600,
    });
    expect(
      virtual.entries.get().map((entry) => ({
        key: entry.key,
        row: entry.row,
        column: entry.column,
        colSpan: entry.colSpan,
        rowSpan: entry.rowSpan,
      })),
    ).toEqual([
      { key: "item-0", row: 0, column: 0, colSpan: 2, rowSpan: 2 },
      { key: "item-2", row: 1, column: 2, colSpan: 1, rowSpan: 1 },
      { key: "item-3", row: 2, column: 0, colSpan: 1, rowSpan: 1 },
      { key: "item-4", row: 2, column: 1, colSpan: 1, rowSpan: 1 },
      { key: "item-5", row: 2, column: 2, colSpan: 1, rowSpan: 1 },
    ]);
    expect(virtual.scrollToKey("item-7")).toBe(300);
  });

  it("recomputes span-aware placement when column count changes", () => {
    const items = Array.from({ length: 6 }, (_unused, index) => ({ id: `photo-${index}` }));
    let columnCount = 3;
    const virtual = createVirtualGrid({
      estimateItemSize: () => 100,
      getColumnCount: () => columnCount,
      getItemSpan: (_item, index) =>
        index === 0 ? { colSpan: 2, rowSpan: 2 } : { colSpan: 1, rowSpan: 1 },
      getKey: (item) => item.id,
      items: () => items,
      overscan: 0,
      scrollOffset: () => 0,
      viewportSize: () => 250,
    });

    expect(virtual.entries.get().map((entry) => [entry.key, entry.row, entry.column])).toEqual([
      ["photo-0", 0, 0],
      ["photo-1", 0, 2],
      ["photo-2", 1, 2],
      ["photo-3", 2, 0],
      ["photo-4", 2, 1],
      ["photo-5", 2, 2],
    ]);

    columnCount = 2;
    virtual.refresh();

    expect(virtual.entries.get().map((entry) => [entry.key, entry.row, entry.column])).toEqual([
      ["photo-0", 0, 0],
      ["photo-1", 2, 0],
      ["photo-2", 2, 1],
    ]);
    expect(virtual.scrollToKey("photo-3")).toBe(300);
    expect(virtual.totalSizePx.get()).toBe(500);
  });

  it("keeps quilt timeline first-page entries stable after scrolling away and back", () => {
    const items = [
      ...Array.from({ length: 6 }, (_unused, index) => ({
        day: "2026-06-03",
        id: `today-${index}`,
        positionInDay: index,
      })),
      ...Array.from({ length: 6 }, (_unused, index) => ({
        day: "2026-06-02",
        id: `yesterday-${index}`,
        positionInDay: index,
      })),
    ];
    let scrollOffset = 0;
    const virtual = createVirtualGrid({
      estimateItemSize: () => 120,
      getColumnCount: () => 3,
      getItemSpan: (item) =>
        item.positionInDay === 0 ? { colSpan: 2, rowSpan: 2 } : { colSpan: 1, rowSpan: 1 },
      getKey: (item) => item.id,
      items: () => items,
      overscan: 1,
      scrollOffset: () => scrollOffset,
      viewportSize: () => 240,
    });
    const firstPageKeys = virtual.entries.get().map((entry) => entry.key);

    scrollOffset = 600;
    virtual.refresh();
    expect(virtual.entries.get().map((entry) => entry.key)).not.toEqual(firstPageKeys);

    scrollOffset = 0;
    virtual.refresh();

    expect(virtual.entries.get().map((entry) => entry.key)).toEqual(firstPageKeys);
  });

  it("resets ranges when items and column count change", () => {
    const allItems = Array.from({ length: 60 }, (_unused, index) => ({ id: `a-${index}` }));
    const filteredItems = Array.from({ length: 6 }, (_unused, index) => ({ id: `b-${index}` }));
    let useFiltered = false;
    let columnCount = 4;
    const virtual = createVirtualGrid({
      estimateItemSize: () => 100,
      getColumnCount: () => columnCount,
      getKey: (item) => item.id,
      items: () => (useFiltered ? filteredItems : allItems),
      overscan: 1,
      scrollOffset: () => 200,
      viewportSize: () => 200,
    });

    expect(virtual.entries.get().map((entry) => entry.key)).toEqual([
      "a-4",
      "a-5",
      "a-6",
      "a-7",
      "a-8",
      "a-9",
      "a-10",
      "a-11",
      "a-12",
      "a-13",
      "a-14",
      "a-15",
      "a-16",
      "a-17",
      "a-18",
      "a-19",
    ]);

    useFiltered = true;
    columnCount = 2;
    virtual.refresh();

    expect(virtual.entries.get().map((entry) => entry.key)).toEqual(["b-2", "b-3", "b-4", "b-5"]);
    expect(virtual.visibleRange.get()).toMatchObject({
      startIndex: 4,
      endIndex: 6,
    });
    expect(virtual.bottomSpacerPx.get()).toBe(0);
  });

  it("uses measured row sizes for spacers and scroll helpers", () => {
    const items = Array.from({ length: 9 }, (_unused, index) => ({ id: `photo-${index}` }));
    const virtual = createVirtualGrid({
      estimateItemSize: () => 100,
      getColumnCount: () => 3,
      getKey: (item) => item.id,
      items: () => items,
      overscan: 0,
      scrollOffset: () => 170,
      viewportSize: () => 90,
    });

    expect(virtual.entries.get().map((entry) => entry.key)).toEqual([
      "photo-3",
      "photo-4",
      "photo-5",
      "photo-6",
      "photo-7",
      "photo-8",
    ]);

    virtual.measureItem("photo-0", 160);
    virtual.measureItem("photo-1", 120);
    virtual.measureItem("photo-2", 140);
    virtual.measureItem("photo-3", 80);
    virtual.refresh();

    expect(virtual.topSpacerPx.get()).toBe(160);
    expect(virtual.totalSizePx.get()).toBe(340);
    expect(virtual.scrollToKey("photo-6")).toBe(240);
  });

  it("lets measured span rows shrink below their estimate", () => {
    const items = Array.from({ length: 4 }, (_unused, index) => ({ id: `tile-${index}` }));
    const virtual = createVirtualGrid({
      estimateItemSize: () => 200,
      getColumnCount: () => 2,
      getItemSpan: () => ({ colSpan: 2 }),
      getKey: (item) => item.id,
      items: () => items,
      overscan: 0,
      scrollOffset: () => 40,
      viewportSize: () => 40,
    });

    for (const item of items) {
      virtual.measureItem(item.id, 40);
    }

    expect(virtual.totalSizePx.get()).toBe(160);
    expect(virtual.scrollToIndex(3)).toBe(120);
    expect(virtual.topSpacerPx.get()).toBe(40);
    expect(virtual.bottomSpacerPx.get()).toBe(80);
  });

  it("uses measured tracks for partially measured span rows", () => {
    const items = [{ id: "small" }, { id: "unmeasured" }, { id: "large" }];
    const createVirtual = (withSpans: boolean) =>
      createVirtualGrid({
        estimateItemSize: () => 100,
        getColumnCount: () => 2,
        ...(withSpans ? { getItemSpan: () => ({ colSpan: 1 }) } : {}),
        getKey: (item) => item.id,
        items: () => items,
        overscan: 0,
        scrollOffset: () => 0,
        viewportSize: () => 300,
      });
    const spanVirtual = createVirtual(true);
    const regularVirtual = createVirtual(false);

    for (const virtual of [spanVirtual, regularVirtual]) {
      virtual.measureItem("small", 40);
      expect(virtual.totalSizePx.get()).toBe(140);
      expect(virtual.scrollToIndex(2)).toBe(40);

      virtual.measureItem("unmeasured", 60);
      expect(virtual.totalSizePx.get()).toBe(160);

      virtual.measureItem("large", 140);
      expect(virtual.totalSizePx.get()).toBe(200);
    }
  });

  it("refreshes measured item geometry immediately", () => {
    const items = Array.from({ length: 6 }, (_unused, index) => ({ id: `measured-${index}` }));
    const virtual = createVirtualGrid({
      estimateItemSize: () => 100,
      getColumnCount: () => 2,
      getKey: (item) => item.id,
      items: () => items,
      overscan: 0,
      scrollOffset: () => 120,
      viewportSize: () => 100,
    });

    expect(virtual.topSpacerPx.get()).toBe(100);
    expect(virtual.totalSizePx.get()).toBe(300);

    virtual.measureItem("measured-0", 180);

    expect(virtual.topSpacerPx.get()).toBe(0);
    expect(virtual.totalSizePx.get()).toBe(380);
    expect(virtual.scrollToKey("measured-4")).toBe(280);
  });

  it("skips refresh work when a measured item keeps the same size", () => {
    const items = Array.from({ length: 20 }, (_unused, index) => ({ id: `same-${index}` }));
    let estimateCalls = 0;
    const virtual = createVirtualList({
      estimateItemSize: () => {
        estimateCalls += 1;
        return 24;
      },
      getKey: (item) => item.id,
      items: () => items,
      overscan: 1,
      scrollOffset: () => 48,
      viewportSize: () => 72,
    });

    virtual.measureItem("same-0", 32);
    const callsAfterFirstMeasure = estimateCalls;

    virtual.measureItem("same-0", 32);

    expect(estimateCalls).toBe(callsAfterFirstMeasure);
  });

  it("drops stale measured sizes when the item set changes", () => {
    const firstItems = Array.from({ length: 100 }, (_unused, index) => ({ id: `old-${index}` }));
    const nextItems = Array.from({ length: 100 }, (_unused, index) => ({ id: `new-${index}` }));
    let items = firstItems;
    let estimateCalls = 0;
    const virtual = createVirtualList({
      estimateItemSize: () => {
        estimateCalls += 1;
        return 24;
      },
      getKey: (item) => item.id,
      items: () => items,
      overscan: 1,
      scrollOffset: () => 48,
      viewportSize: () => 72,
    });

    virtual.measureItem("old-0", 32);
    items = nextItems;
    estimateCalls = 0;

    virtual.refresh();
    virtual.entries.get();

    expect(estimateCalls).toBe(1);
  });

  it("keeps measured spacer geometry valid when scrolled past the final row", () => {
    const items = Array.from({ length: 3 }, (_unused, index) => ({ id: `tail-${index}` }));
    const virtual = createVirtualGrid({
      estimateItemSize: () => 100,
      getColumnCount: () => 1,
      getKey: (item) => item.id,
      items: () => items,
      overscan: 0,
      scrollOffset: () => 1_000,
      viewportSize: () => 120,
    });

    virtual.measureItem("tail-0", 80);
    virtual.refresh();

    expect(virtual.topSpacerPx.get()).toBe(280);
    expect(virtual.bottomSpacerPx.get()).toBe(0);
    expect(virtual.entries.get()).toEqual([]);
  });
});
