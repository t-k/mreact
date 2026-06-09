import { cell, computed, untrack, type ReadonlyCell } from "@reckona/mreact-reactive-core";

/** Identifies a virtualized item across measurements and scroll helpers. */
export type VirtualKey = string | number;

/** Configures fixed-size virtual range calculation for a list or grid. */
export interface VirtualRangeOptions {
  columnCount?: number;
  itemCount: number;
  itemSize: number;
  overscan?: number;
  scrollOffset: number;
  viewportSize: number;
}

/** Describes visible and overscanned item bounds plus spacer sizes for a virtual range. */
export interface VirtualRange {
  bottomSpacerPx: number;
  columnCount: number;
  endIndex: number;
  endRow: number;
  itemCount: number;
  rowCount: number;
  startIndex: number;
  startRow: number;
  topSpacerPx: number;
  totalSizePx: number;
  visibleEndIndex: number;
  visibleEndRow: number;
  visibleStartIndex: number;
  visibleStartRow: number;
}

/** Describes only the user-visible item and row bounds for a virtual range. */
export interface VisibleRange {
  endIndex: number;
  endRow: number;
  startIndex: number;
  startRow: number;
}

/** Describes an item span used by span-aware virtual grids. */
export interface VirtualItemSpan {
  colSpan?: number;
  rowSpan?: number;
}

/** Represents one rendered virtual item with its index, key, row, column, and span metadata. */
export interface VirtualEntry<TItem> {
  colSpan?: number;
  column?: number;
  index: number;
  item: TItem;
  key: VirtualKey;
  row: number;
  rowSpan?: number;
}

/** Configures a reactive one-column virtual list. */
export interface VirtualListOptions<TItem> {
  estimateItemSize: (index: number, item: TItem | undefined) => number;
  getKey: (item: TItem, index: number) => VirtualKey;
  items: () => readonly TItem[];
  overscan?: number;
  scrollOffset: () => number;
  viewportSize: () => number;
}

/** Configures a reactive virtual grid with optional row and column spans. */
export interface VirtualGridOptions<TItem> extends VirtualListOptions<TItem> {
  getColumnCount: () => number;
  getItemSpan?: (item: TItem, index: number) => VirtualItemSpan;
}

/** Exposes reactive virtualizer outputs, measurement updates, refresh, and scroll offset helpers. */
export interface Virtualizer<TItem> {
  readonly bottomSpacerPx: ReadonlyCell<number>;
  readonly entries: ReadonlyCell<readonly VirtualEntry<TItem>[]>;
  readonly range: ReadonlyCell<VirtualRange>;
  readonly topSpacerPx: ReadonlyCell<number>;
  readonly totalSizePx: ReadonlyCell<number>;
  readonly visibleRange: ReadonlyCell<VisibleRange>;
  measureItem(key: VirtualKey, sizePx: number): void;
  refresh(): void;
  scrollToIndex(index: number): number;
  scrollToKey(key: VirtualKey): number | undefined;
}

interface VirtualSnapshot<TItem> {
  entries: readonly VirtualEntry<TItem>[];
  offsetForIndex: (index: number) => number;
  offsetForRow: (row: number) => number;
  range: VirtualRange;
  rowOffsets: readonly number[];
  rowSizes: readonly number[];
  visibleRange: VisibleRange;
}

interface MeasuredRowLayout<TItem> {
  columnCount: number;
  items: readonly TItem[];
  measuredVersion: number;
  rowOffsets: readonly number[];
  rowSizes: readonly number[];
  totalSizePx: number;
}

/**
 * Calculates the visible and overscanned range for a fixed-size virtual list or grid.
 *
 * The result includes spacer sizes, visible row/index bounds, overscanned row/index bounds, and total scroll size.
 */
export function calculateVirtualRange(options: VirtualRangeOptions): VirtualRange {
  const itemCount = clampInteger(options.itemCount, 0);
  const columnCount = clampInteger(options.columnCount ?? 1, 1);
  const itemSize = clampPositiveSize(options.itemSize);
  const overscan = clampInteger(options.overscan ?? 0, 0);
  const scrollOffset = clampSize(options.scrollOffset);
  const viewportSize = clampSize(options.viewportSize);
  const rowCount = Math.ceil(itemCount / columnCount);
  const totalSizePx = rowCount * itemSize;

  if (itemCount === 0 || rowCount === 0) {
    return emptyRange(columnCount);
  }

  const visibleStartRow = Math.min(rowCount, Math.floor(scrollOffset / itemSize));
  const visibleEndRow = Math.min(rowCount, Math.ceil((scrollOffset + viewportSize) / itemSize));
  const startRow = Math.max(0, visibleStartRow - overscan);
  const endRow = Math.min(rowCount, visibleEndRow + overscan);
  const startIndex = Math.min(itemCount, startRow * columnCount);
  const endIndex = Math.min(itemCount, endRow * columnCount);
  const visibleStartIndex = Math.min(itemCount, visibleStartRow * columnCount);
  const visibleEndIndex = Math.min(itemCount, visibleEndRow * columnCount);

  return {
    bottomSpacerPx: Math.max(0, (rowCount - endRow) * itemSize),
    columnCount,
    endIndex,
    endRow,
    itemCount,
    rowCount,
    startIndex,
    startRow,
    topSpacerPx: startRow * itemSize,
    totalSizePx,
    visibleEndIndex,
    visibleEndRow,
    visibleStartIndex,
    visibleStartRow,
  };
}

/**
 * Creates a one-column reactive virtualizer for scrollable lists.
 *
 * Inputs are read through callbacks so cell-backed item, viewport, and scroll values update the computed range automatically.
 */
export function createVirtualList<TItem>(options: VirtualListOptions<TItem>): Virtualizer<TItem> {
  return createVirtualizer({
    ...options,
    getColumnCount: () => 1,
  });
}

/**
 * Creates a reactive virtualizer for grid layouts with optional item row and column spans.
 */
export function createVirtualGrid<TItem>(options: VirtualGridOptions<TItem>): Virtualizer<TItem> {
  return createVirtualizer(options);
}

function createVirtualizer<TItem>(options: VirtualGridOptions<TItem>): Virtualizer<TItem> {
  const measuredSizes = new Map<VirtualKey, number>();
  const refreshVersion = cell(0);
  let measuredVersion = 0;
  let measuredRowLayout: MeasuredRowLayout<TItem> | undefined;
  let lastItems: readonly TItem[] | undefined;
  let keyIndex: Map<VirtualKey, number> | undefined;
  let keyIndexItems: readonly TItem[] | undefined;
  let keyIndexLength = -1;

  // The snapshot recomputes when refresh()/measureItem() bump the version or
  // when any cell read inside the items/scrollOffset/viewportSize/
  // getColumnCount thunks (or the per-item callbacks) changes, so cell-backed
  // sources stay reactive without explicit refresh() calls.
  const snapshot = computed(() => {
    refreshVersion.get();
    const items = options.items();
    const next = createSnapshot(options, measuredSizes, {
      items,
      measuredRowLayout,
      measuredVersion,
      pruneStaleMeasuredSizes: items !== lastItems,
      updateMeasuredRowLayout(nextLayout) {
        measuredRowLayout = nextLayout;
      },
    });
    lastItems = items;
    return next;
  });
  const range = computed(() => snapshot.get().range, { equals: virtualRangeEquals });
  const visibleRange = computed(() => snapshot.get().visibleRange, {
    equals: visibleRangeEquals,
  });
  const entries = computed(() => snapshot.get().entries, { equals: virtualEntriesEqual });
  const topSpacerPx = computed(() => snapshot.get().range.topSpacerPx);
  const bottomSpacerPx = computed(() => snapshot.get().range.bottomSpacerPx);
  const totalSizePx = computed(() => snapshot.get().range.totalSizePx);

  const refresh = () => {
    keyIndex = undefined;
    keyIndexItems = undefined;
    keyIndexLength = -1;
    refreshVersion.set((version) => version + 1);
  };
  // Scroll helpers are imperative reads: they must observe the latest inputs
  // even for plain non-reactive thunks, but never subscribe their caller.
  const ensureSnapshotCurrentForScroll = (): VirtualSnapshot<TItem> =>
    untrack(() => {
      let current = snapshot.get();
      const items = options.items();
      const columnCount = clampInteger(options.getColumnCount(), 1);

      if (
        items !== lastItems ||
        items.length !== current.range.itemCount ||
        columnCount !== current.range.columnCount
      ) {
        refreshVersion.set((version) => version + 1);
        current = snapshot.get();
      }

      return current;
    });
  const scrollToIndex = (index: number) => {
    const current = ensureSnapshotCurrentForScroll();

    const itemCount = current.range.itemCount;
    if (itemCount === 0) {
      return 0;
    }
    return current.offsetForIndex(clampInteger(index, 0, itemCount - 1));
  };

  return {
    bottomSpacerPx,
    entries,
    range,
    topSpacerPx,
    totalSizePx,
    visibleRange,
    measureItem(key, sizePx) {
      const measuredSize = clampPositiveSize(sizePx);
      if (Object.is(measuredSizes.get(key), measuredSize)) {
        return;
      }

      measuredSizes.set(key, measuredSize);
      measuredVersion += 1;
      refreshVersion.set((version) => version + 1);
    },
    refresh,
    scrollToIndex,
    scrollToKey(key) {
      return untrack(() => {
        const index = resolveKeyIndex(key, options, {
          keyIndex,
          keyIndexItems,
          keyIndexLength,
          update(nextKeyIndex, nextKeyIndexItems) {
            keyIndex = nextKeyIndex;
            keyIndexItems = nextKeyIndexItems;
            keyIndexLength = nextKeyIndexItems.length;
          },
        });
        if (index === undefined) {
          return undefined;
        }
        return scrollToIndex(index);
      });
    },
  };
}

function virtualRangeEquals(previous: VirtualRange, next: VirtualRange): boolean {
  return (
    previous.bottomSpacerPx === next.bottomSpacerPx &&
    previous.columnCount === next.columnCount &&
    previous.endIndex === next.endIndex &&
    previous.endRow === next.endRow &&
    previous.itemCount === next.itemCount &&
    previous.rowCount === next.rowCount &&
    previous.startIndex === next.startIndex &&
    previous.startRow === next.startRow &&
    previous.topSpacerPx === next.topSpacerPx &&
    previous.totalSizePx === next.totalSizePx &&
    previous.visibleEndIndex === next.visibleEndIndex &&
    previous.visibleEndRow === next.visibleEndRow &&
    previous.visibleStartIndex === next.visibleStartIndex &&
    previous.visibleStartRow === next.visibleStartRow
  );
}

function visibleRangeEquals(previous: VisibleRange, next: VisibleRange): boolean {
  return (
    previous.endIndex === next.endIndex &&
    previous.endRow === next.endRow &&
    previous.startIndex === next.startIndex &&
    previous.startRow === next.startRow
  );
}

function virtualEntriesEqual<TItem>(
  previous: readonly VirtualEntry<TItem>[],
  next: readonly VirtualEntry<TItem>[],
): boolean {
  if (previous === next) {
    return true;
  }

  if (previous.length !== next.length) {
    return false;
  }

  for (let index = 0; index < previous.length; index += 1) {
    const previousEntry = previous[index] as VirtualEntry<TItem>;
    const nextEntry = next[index] as VirtualEntry<TItem>;

    if (
      previousEntry.index !== nextEntry.index ||
      previousEntry.key !== nextEntry.key ||
      !Object.is(previousEntry.item, nextEntry.item) ||
      previousEntry.row !== nextEntry.row ||
      previousEntry.column !== nextEntry.column ||
      previousEntry.colSpan !== nextEntry.colSpan ||
      previousEntry.rowSpan !== nextEntry.rowSpan
    ) {
      return false;
    }
  }

  return true;
}

function resolveKeyIndex<TItem>(
  key: VirtualKey,
  options: VirtualGridOptions<TItem>,
  cache: {
    keyIndex: Map<VirtualKey, number> | undefined;
    keyIndexItems: readonly TItem[] | undefined;
    keyIndexLength: number;
    update: (keyIndex: Map<VirtualKey, number>, items: readonly TItem[]) => void;
  },
): number | undefined {
  const items = options.items();
  let keyIndex = cache.keyIndex;

  if (
    keyIndex === undefined ||
    cache.keyIndexItems !== items ||
    cache.keyIndexLength !== items.length
  ) {
    keyIndex = createKeyIndex(items, options.getKey);
    cache.update(keyIndex, items);
  }

  const index = keyIndex.get(key);
  if (index === undefined) {
    return undefined;
  }

  const item = items[index];
  if (item !== undefined && options.getKey(item, index) === key) {
    return index;
  }

  keyIndex = createKeyIndex(items, options.getKey);
  cache.update(keyIndex, items);

  return keyIndex.get(key);
}

function createKeyIndex<TItem>(
  items: readonly TItem[],
  getKey: (item: TItem, index: number) => VirtualKey,
): Map<VirtualKey, number> {
  const keyIndex = new Map<VirtualKey, number>();

  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    if (item === undefined) {
      continue;
    }
    const key = getKey(item, index);
    if (!keyIndex.has(key)) {
      keyIndex.set(key, index);
    }
  }

  return keyIndex;
}

function createSnapshot<TItem>(
  options: VirtualGridOptions<TItem>,
  measuredSizes: Map<VirtualKey, number>,
  snapshotOptions?: {
    items?: readonly TItem[] | undefined;
    measuredRowLayout?: MeasuredRowLayout<TItem> | undefined;
    measuredVersion?: number | undefined;
    pruneStaleMeasuredSizes?: boolean | undefined;
    updateMeasuredRowLayout?: (layout: MeasuredRowLayout<TItem>) => void;
  },
): VirtualSnapshot<TItem> {
  const items = snapshotOptions?.items ?? options.items();
  const itemCount = items.length;
  const columnCount = clampInteger(options.getColumnCount(), 1);
  const overscan = clampInteger(options.overscan ?? 0, 0);
  const rowCount = Math.ceil(itemCount / columnCount);

  if (options.getItemSpan !== undefined) {
    if (snapshotOptions?.pruneStaleMeasuredSizes === true) {
      pruneMeasuredSizes(items, options.getKey, measuredSizes);
    }

    return createSpanAwareSnapshot(options, items, itemCount, columnCount, overscan, measuredSizes);
  }

  if (measuredSizes.size === 0) {
    return createFixedSnapshot(options, items, itemCount, columnCount, rowCount, overscan);
  }

  if (snapshotOptions?.pruneStaleMeasuredSizes === true) {
    pruneMeasuredSizes(items, options.getKey, measuredSizes);
  }

  if (measuredSizes.size === 0) {
    return createFixedSnapshot(options, items, itemCount, columnCount, rowCount, overscan);
  }

  const layout = getMeasuredRowLayout(
    items,
    columnCount,
    options,
    measuredSizes,
    snapshotOptions,
  );
  const rowSizes = layout.rowSizes;
  const rowOffsets = layout.rowOffsets;
  const totalSizePx = layout.totalSizePx;

  if (itemCount === 0 || rowCount === 0) {
    const range = emptyRange(columnCount);
    return {
      entries: [],
      offsetForIndex: () => 0,
      offsetForRow: () => 0,
      range,
      rowOffsets,
      rowSizes,
      visibleRange: rangeToVisibleRange(range),
    };
  }

  const scrollOffset = clampSize(options.scrollOffset());
  const viewportEnd = scrollOffset + clampSize(options.viewportSize());
  const visibleStartRow = findVisibleStartRow(rowOffsets, rowSizes, scrollOffset);
  const visibleEndRow = findVisibleEndRow(rowOffsets, rowSizes, viewportEnd);
  const startRow = Math.max(0, visibleStartRow - overscan);
  const endRow = Math.min(rowCount, visibleEndRow + overscan);
  const range = createRange({
    columnCount,
    endRow,
    itemCount,
    rowCount,
    rowOffsets,
    rowSizes,
    startRow,
    totalSizePx,
    visibleEndRow,
    visibleStartRow,
  });

  return {
    entries: createEntries(items, options.getKey, range.startIndex, range.endIndex, columnCount),
    offsetForIndex: (index) => rowOffsets[Math.floor(index / columnCount)] ?? totalSizePx,
    offsetForRow: (row) => rowOffsets[row] ?? totalSizePx,
    range,
    rowOffsets,
    rowSizes,
    visibleRange: rangeToVisibleRange(range),
  };
}

function getMeasuredRowLayout<TItem>(
  items: readonly TItem[],
  columnCount: number,
  options: VirtualGridOptions<TItem>,
  measuredSizes: ReadonlyMap<VirtualKey, number>,
  snapshotOptions: {
    measuredRowLayout?: MeasuredRowLayout<TItem> | undefined;
    measuredVersion?: number | undefined;
    updateMeasuredRowLayout?: (layout: MeasuredRowLayout<TItem>) => void;
  } | undefined,
): MeasuredRowLayout<TItem> {
  const measuredVersion = snapshotOptions?.measuredVersion ?? 0;
  const cached = snapshotOptions?.measuredRowLayout;

  if (
    cached !== undefined &&
    cached.items === items &&
    cached.columnCount === columnCount &&
    cached.measuredVersion === measuredVersion
  ) {
    return cached;
  }

  const rowSizes = computeRowSizes(items, columnCount, options, measuredSizes);
  const rowOffsets = computeRowOffsets(rowSizes);
  const layout = {
    columnCount,
    items,
    measuredVersion,
    rowOffsets,
    rowSizes,
    totalSizePx: rowSizes.reduce((total, size) => total + size, 0),
  };
  snapshotOptions?.updateMeasuredRowLayout?.(layout);

  return layout;
}

function createFixedSnapshot<TItem>(
  options: VirtualGridOptions<TItem>,
  items: readonly TItem[],
  itemCount: number,
  columnCount: number,
  rowCount: number,
  overscan: number,
): VirtualSnapshot<TItem> {
  const itemSize = clampPositiveSize(options.estimateItemSize(0, items[0]));
  const range = calculateVirtualRange({
    columnCount,
    itemCount,
    itemSize,
    overscan,
    scrollOffset: options.scrollOffset(),
    viewportSize: options.viewportSize(),
  });

  return {
    entries: createEntries(items, options.getKey, range.startIndex, range.endIndex, columnCount),
    offsetForIndex: (index) => Math.floor(index / columnCount) * itemSize,
    offsetForRow: (row) => row * itemSize,
    range,
    rowOffsets: [],
    rowSizes: [],
    visibleRange: rangeToVisibleRange(range),
  };
}

interface SpanPlacement {
  colSpan: number;
  column: number;
  index: number;
  row: number;
  rowSpan: number;
}

function createSpanAwareSnapshot<TItem>(
  options: VirtualGridOptions<TItem>,
  items: readonly TItem[],
  itemCount: number,
  columnCount: number,
  overscan: number,
  measuredSizes: ReadonlyMap<VirtualKey, number>,
): VirtualSnapshot<TItem> {
  const placements = computeSpanPlacements(items, columnCount, options.getItemSpan);
  const rowCount = placements.rowCount;

  if (itemCount === 0 || rowCount === 0) {
    const range = emptyRange(columnCount);
    return {
      entries: [],
      offsetForIndex: () => 0,
      offsetForRow: () => 0,
      range,
      rowOffsets: [],
      rowSizes: [],
      visibleRange: rangeToVisibleRange(range),
    };
  }

  const rowSizes = computeSpanRowSizes(items, placements.entries, options, measuredSizes, rowCount);
  const rowOffsets = computeRowOffsets(rowSizes);
  const totalSizePx = rowSizes.reduce((total, size) => total + size, 0);
  const scrollOffset = clampSize(options.scrollOffset());
  const viewportEnd = scrollOffset + clampSize(options.viewportSize());
  const visibleStartRow = findVisibleStartRow(rowOffsets, rowSizes, scrollOffset);
  const visibleEndRow = findVisibleEndRow(rowOffsets, rowSizes, viewportEnd);
  const startRow = Math.max(0, visibleStartRow - overscan);
  const endRow = Math.min(rowCount, visibleEndRow + overscan);
  const range = createSpanRange({
    columnCount,
    endRow,
    itemCount,
    placements: placements.entries,
    rowCount,
    rowOffsets,
    startRow,
    totalSizePx,
    visibleEndRow,
    visibleStartRow,
  });

  return {
    entries: createSpanEntries(items, options.getKey, placements.entries, startRow, endRow),
    offsetForIndex: (index) => {
      const placement = placements.entries[index];
      if (placement === undefined) {
        return totalSizePx;
      }
      return rowOffsets[placement.row] ?? totalSizePx;
    },
    offsetForRow: (row) => rowOffsets[row] ?? totalSizePx,
    range,
    rowOffsets,
    rowSizes,
    visibleRange: rangeToVisibleRange(range),
  };
}

function computeSpanPlacements<TItem>(
  items: readonly TItem[],
  columnCount: number,
  getItemSpan: VirtualGridOptions<TItem>["getItemSpan"],
): { entries: SpanPlacement[]; rowCount: number } {
  const occupied: boolean[][] = [];
  const entries: SpanPlacement[] = [];
  let cursorRow = 0;
  let cursorColumn = 0;
  let rowCount = 0;

  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    if (item === undefined) {
      continue;
    }

    const span = normalizeItemSpan(getItemSpan?.(item, index), columnCount);
    let row = cursorRow;
    let column = cursorColumn;

    while (!canPlaceSpan(occupied, row, column, span, columnCount)) {
      column += 1;
      if (column >= columnCount) {
        row += 1;
        column = 0;
      }
    }

    markSpanOccupied(occupied, row, column, span);
    entries[index] = {
      colSpan: span.colSpan,
      column,
      index,
      row,
      rowSpan: span.rowSpan,
    };
    rowCount = Math.max(rowCount, row + span.rowSpan);
    cursorRow = row;
    cursorColumn = column + span.colSpan;
    if (cursorColumn >= columnCount) {
      cursorRow += 1;
      cursorColumn = 0;
    }
  }

  return { entries, rowCount };
}

function normalizeItemSpan(
  span: VirtualItemSpan | undefined,
  columnCount: number,
): Required<VirtualItemSpan> {
  return {
    colSpan: clampInteger(span?.colSpan ?? 1, 1, columnCount),
    rowSpan: clampInteger(span?.rowSpan ?? 1, 1),
  };
}

function canPlaceSpan(
  occupied: readonly (readonly boolean[])[],
  row: number,
  column: number,
  span: Required<VirtualItemSpan>,
  columnCount: number,
): boolean {
  if (column + span.colSpan > columnCount) {
    return false;
  }

  for (let rowOffset = 0; rowOffset < span.rowSpan; rowOffset += 1) {
    const occupiedRow = occupied[row + rowOffset];
    for (let columnOffset = 0; columnOffset < span.colSpan; columnOffset += 1) {
      if (occupiedRow?.[column + columnOffset] === true) {
        return false;
      }
    }
  }

  return true;
}

function markSpanOccupied(
  occupied: boolean[][],
  row: number,
  column: number,
  span: Required<VirtualItemSpan>,
): void {
  for (let rowOffset = 0; rowOffset < span.rowSpan; rowOffset += 1) {
    const occupiedRow = occupied[row + rowOffset] ?? [];
    occupied[row + rowOffset] = occupiedRow;
    for (let columnOffset = 0; columnOffset < span.colSpan; columnOffset += 1) {
      occupiedRow[column + columnOffset] = true;
    }
  }
}

function computeSpanRowSizes<TItem>(
  items: readonly TItem[],
  placements: readonly (SpanPlacement | undefined)[],
  options: VirtualGridOptions<TItem>,
  measuredSizes: ReadonlyMap<VirtualKey, number>,
  rowCount: number,
): number[] {
  const baseItemSize = clampPositiveSize(options.estimateItemSize(0, items[0]));
  const rowSizes = Array.from({ length: rowCount }, () => baseItemSize);

  for (const placement of placements) {
    if (placement === undefined) {
      continue;
    }

    const item = items[placement.index];
    if (item === undefined) {
      continue;
    }

    const measuredSize = measuredSizes.get(options.getKey(item, placement.index));
    const itemSize =
      measuredSize ?? clampPositiveSize(options.estimateItemSize(placement.index, item));
    const trackSize = itemSize / placement.rowSpan;
    for (let rowOffset = 0; rowOffset < placement.rowSpan; rowOffset += 1) {
      const row = placement.row + rowOffset;
      rowSizes[row] = Math.max(rowSizes[row] ?? baseItemSize, trackSize);
    }
  }

  return rowSizes;
}

function computeRowSizes<TItem>(
  items: readonly TItem[],
  columnCount: number,
  options: VirtualGridOptions<TItem>,
  measuredSizes: ReadonlyMap<VirtualKey, number>,
): number[] {
  const rowCount = Math.ceil(items.length / columnCount);
  return Array.from({ length: rowCount }, (_unused, row) => {
    let measuredMax: number | undefined;
    const startIndex = row * columnCount;
    const endIndex = Math.min(items.length, startIndex + columnCount);

    for (let index = startIndex; index < endIndex; index += 1) {
      const item = items[index];
      if (item === undefined) {
        continue;
      }
      const measured = measuredSizes.get(options.getKey(item, index));
      if (measured !== undefined) {
        measuredMax = Math.max(measuredMax ?? 0, measured);
      }
    }

    if (measuredMax !== undefined) {
      return measuredMax;
    }

    return clampPositiveSize(options.estimateItemSize(startIndex, items[startIndex]));
  });
}

function computeRowOffsets(rowSizes: readonly number[]): number[] {
  const offsets: number[] = [];
  let current = 0;

  for (const size of rowSizes) {
    offsets.push(current);
    current += size;
  }

  return offsets;
}

function createEntries<TItem>(
  items: readonly TItem[],
  getKey: (item: TItem, index: number) => VirtualKey,
  startIndex: number,
  endIndex: number,
  columnCount: number,
): VirtualEntry<TItem>[] {
  const entries: VirtualEntry<TItem>[] = [];

  for (let index = startIndex; index < endIndex; index += 1) {
    const item = items[index];
    if (item === undefined) {
      continue;
    }
    entries.push({
      index,
      item,
      key: getKey(item, index),
      row: Math.floor(index / columnCount),
    });
  }

  return entries;
}

function createSpanEntries<TItem>(
  items: readonly TItem[],
  getKey: (item: TItem, index: number) => VirtualKey,
  placements: readonly (SpanPlacement | undefined)[],
  startRow: number,
  endRow: number,
): VirtualEntry<TItem>[] {
  const entries: VirtualEntry<TItem>[] = [];

  for (const placement of placements) {
    if (
      placement === undefined ||
      placement.row >= endRow ||
      placement.row + placement.rowSpan <= startRow
    ) {
      continue;
    }

    const item = items[placement.index];
    if (item === undefined) {
      continue;
    }

    entries.push({
      colSpan: placement.colSpan,
      column: placement.column,
      index: placement.index,
      item,
      key: getKey(item, placement.index),
      row: placement.row,
      rowSpan: placement.rowSpan,
    });
  }

  return entries;
}

function createSpanRange(options: {
  columnCount: number;
  endRow: number;
  itemCount: number;
  placements: readonly (SpanPlacement | undefined)[];
  rowCount: number;
  rowOffsets: readonly number[];
  startRow: number;
  totalSizePx: number;
  visibleEndRow: number;
  visibleStartRow: number;
}): VirtualRange {
  const renderedIndexes = findIntersectingPlacementIndexes(
    options.placements,
    options.startRow,
    options.endRow,
  );
  const visibleIndexes = findIntersectingPlacementIndexes(
    options.placements,
    options.visibleStartRow,
    options.visibleEndRow,
  );
  const endOffset =
    options.endRow >= options.rowCount
      ? options.totalSizePx
      : (options.rowOffsets[options.endRow] ?? options.totalSizePx);
  const startOffset =
    options.startRow >= options.rowCount
      ? options.totalSizePx
      : (options.rowOffsets[options.startRow] ?? 0);

  return {
    bottomSpacerPx: Math.max(0, options.totalSizePx - endOffset),
    columnCount: options.columnCount,
    endIndex: renderedIndexes.endIndex,
    endRow: options.endRow,
    itemCount: options.itemCount,
    rowCount: options.rowCount,
    startIndex: renderedIndexes.startIndex,
    startRow: options.startRow,
    topSpacerPx: startOffset,
    totalSizePx: options.totalSizePx,
    visibleEndIndex: visibleIndexes.endIndex,
    visibleEndRow: options.visibleEndRow,
    visibleStartIndex: visibleIndexes.startIndex,
    visibleStartRow: options.visibleStartRow,
  };
}

function findIntersectingPlacementIndexes(
  placements: readonly (SpanPlacement | undefined)[],
  startRow: number,
  endRow: number,
): { endIndex: number; startIndex: number } {
  let startIndex: number | undefined;
  let endIndex: number | undefined;

  for (const placement of placements) {
    if (
      placement === undefined ||
      placement.row >= endRow ||
      placement.row + placement.rowSpan <= startRow
    ) {
      continue;
    }

    startIndex = Math.min(startIndex ?? placement.index, placement.index);
    endIndex = Math.max(endIndex ?? placement.index + 1, placement.index + 1);
  }

  return {
    endIndex: endIndex ?? placements.length,
    startIndex: startIndex ?? placements.length,
  };
}

function createRange(options: {
  columnCount: number;
  endRow: number;
  itemCount: number;
  rowCount: number;
  rowOffsets: readonly number[];
  rowSizes: readonly number[];
  startRow: number;
  totalSizePx: number;
  visibleEndRow: number;
  visibleStartRow: number;
}): VirtualRange {
  const startIndex = Math.min(options.itemCount, options.startRow * options.columnCount);
  const endIndex = Math.min(options.itemCount, options.endRow * options.columnCount);
  const visibleStartIndex = Math.min(
    options.itemCount,
    options.visibleStartRow * options.columnCount,
  );
  const visibleEndIndex = Math.min(options.itemCount, options.visibleEndRow * options.columnCount);
  const endOffset =
    options.endRow >= options.rowCount
      ? options.totalSizePx
      : (options.rowOffsets[options.endRow] ?? options.totalSizePx);
  const startOffset =
    options.startRow >= options.rowCount
      ? options.totalSizePx
      : (options.rowOffsets[options.startRow] ?? 0);

  return {
    bottomSpacerPx: Math.max(0, options.totalSizePx - endOffset),
    columnCount: options.columnCount,
    endIndex,
    endRow: options.endRow,
    itemCount: options.itemCount,
    rowCount: options.rowCount,
    startIndex,
    startRow: options.startRow,
    topSpacerPx: startOffset,
    totalSizePx: options.totalSizePx,
    visibleEndIndex,
    visibleEndRow: options.visibleEndRow,
    visibleStartIndex,
    visibleStartRow: options.visibleStartRow,
  };
}

function emptyRange(columnCount: number): VirtualRange {
  return {
    bottomSpacerPx: 0,
    columnCount,
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
  };
}

function rangeToVisibleRange(range: VirtualRange): VisibleRange {
  return {
    endIndex: range.visibleEndIndex,
    endRow: range.visibleEndRow,
    startIndex: range.visibleStartIndex,
    startRow: range.visibleStartRow,
  };
}

function findVisibleStartRow(
  rowOffsets: readonly number[],
  rowSizes: readonly number[],
  scrollOffset: number,
): number {
  let low = 0;
  let high = rowSizes.length;

  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    const rowEnd = (rowOffsets[mid] ?? 0) + (rowSizes[mid] ?? 0);

    if (rowEnd > scrollOffset) {
      high = mid;
    } else {
      low = mid + 1;
    }
  }

  return low;
}

function findVisibleEndRow(
  rowOffsets: readonly number[],
  rowSizes: readonly number[],
  viewportEnd: number,
): number {
  let low = 0;
  let high = rowSizes.length;

  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    const rowOffset = rowOffsets[mid] ?? 0;

    if (rowOffset < viewportEnd) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }

  return low;
}

function pruneMeasuredSizes<TItem>(
  items: readonly TItem[],
  getKey: (item: TItem, index: number) => VirtualKey,
  measuredSizes: Map<VirtualKey, number>,
): void {
  const retainedKeys = new Set<VirtualKey>();

  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    if (item === undefined) {
      continue;
    }

    const key = getKey(item, index);
    if (measuredSizes.has(key)) {
      retainedKeys.add(key);
    }
  }

  if (retainedKeys.size === measuredSizes.size) {
    return;
  }

  for (const key of measuredSizes.keys()) {
    if (!retainedKeys.has(key)) {
      measuredSizes.delete(key);
    }
  }
}

function clampInteger(value: number, min: number, max = Number.MAX_SAFE_INTEGER): number {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.min(max, Math.max(min, Math.floor(value)));
}

function clampSize(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, value);
}

function clampPositiveSize(value: number): number {
  if (!Number.isFinite(value)) {
    return 1;
  }

  return Math.max(1, value);
}
