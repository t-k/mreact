import { cell, type ReadonlyCell } from "@reckona/mreact-reactive-core";

export type VirtualKey = string | number;

export interface VirtualRangeOptions {
  columnCount?: number;
  itemCount: number;
  itemSize: number;
  overscan?: number;
  scrollOffset: number;
  viewportSize: number;
}

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

export interface VisibleRange {
  endIndex: number;
  endRow: number;
  startIndex: number;
  startRow: number;
}

export interface VirtualEntry<TItem> {
  index: number;
  item: TItem;
  key: VirtualKey;
  row: number;
}

export interface VirtualListOptions<TItem> {
  estimateItemSize: (index: number, item: TItem | undefined) => number;
  getKey: (item: TItem, index: number) => VirtualKey;
  items: () => readonly TItem[];
  overscan?: number;
  scrollOffset: () => number;
  viewportSize: () => number;
}

export interface VirtualGridOptions<TItem> extends VirtualListOptions<TItem> {
  getColumnCount: () => number;
}

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
  offsetForRow: (row: number) => number;
  range: VirtualRange;
  rowOffsets: readonly number[];
  rowSizes: readonly number[];
  visibleRange: VisibleRange;
}

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

export function createVirtualList<TItem>(options: VirtualListOptions<TItem>): Virtualizer<TItem> {
  return createVirtualizer({
    ...options,
    getColumnCount: () => 1,
  });
}

export function createVirtualGrid<TItem>(options: VirtualGridOptions<TItem>): Virtualizer<TItem> {
  return createVirtualizer(options);
}

function createVirtualizer<TItem>(options: VirtualGridOptions<TItem>): Virtualizer<TItem> {
  const measuredSizes = new Map<VirtualKey, number>();
  let snapshot = createSnapshot(options, measuredSizes);
  const range = cell(snapshot.range);
  const visibleRange = cell(snapshot.visibleRange);
  const entries = cell(snapshot.entries);
  const topSpacerPx = cell(snapshot.range.topSpacerPx);
  const bottomSpacerPx = cell(snapshot.range.bottomSpacerPx);
  const totalSizePx = cell(snapshot.range.totalSizePx);

  const refresh = () => {
    snapshot = createSnapshot(options, measuredSizes);
    range.set(snapshot.range);
    visibleRange.set(snapshot.visibleRange);
    entries.set(snapshot.entries);
    topSpacerPx.set(snapshot.range.topSpacerPx);
    bottomSpacerPx.set(snapshot.range.bottomSpacerPx);
    totalSizePx.set(snapshot.range.totalSizePx);
  };
  const scrollToIndex = (index: number) => {
    const itemCount = options.items().length;
    if (itemCount === 0) {
      return 0;
    }
    const columnCount = clampInteger(options.getColumnCount(), 1);
    const row = Math.floor(clampInteger(index, 0, itemCount - 1) / columnCount);
    return snapshot.offsetForRow(row);
  };

  return {
    bottomSpacerPx,
    entries,
    range,
    topSpacerPx,
    totalSizePx,
    visibleRange,
    measureItem(key, sizePx) {
      measuredSizes.set(key, clampPositiveSize(sizePx));
    },
    refresh,
    scrollToIndex,
    scrollToKey(key) {
      const index = options
        .items()
        .findIndex((item, itemIndex) => options.getKey(item, itemIndex) === key);
      if (index === -1) {
        return undefined;
      }
      return scrollToIndex(index);
    },
  };
}

function createSnapshot<TItem>(
  options: VirtualGridOptions<TItem>,
  measuredSizes: ReadonlyMap<VirtualKey, number>,
): VirtualSnapshot<TItem> {
  const items = options.items();
  const itemCount = items.length;
  const columnCount = clampInteger(options.getColumnCount(), 1);
  const overscan = clampInteger(options.overscan ?? 0, 0);
  const rowCount = Math.ceil(itemCount / columnCount);

  if (measuredSizes.size === 0) {
    return createFixedSnapshot(options, items, itemCount, columnCount, rowCount, overscan);
  }

  const rowSizes = computeRowSizes(items, columnCount, options, measuredSizes);
  const rowOffsets = computeRowOffsets(rowSizes);
  const totalSizePx = rowSizes.reduce((total, size) => total + size, 0);

  if (itemCount === 0 || rowCount === 0) {
    const range = emptyRange(columnCount);
    return {
      entries: [],
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
    offsetForRow: (row) => rowOffsets[row] ?? totalSizePx,
    range,
    rowOffsets,
    rowSizes,
    visibleRange: rangeToVisibleRange(range),
  };
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
    offsetForRow: (row) => row * itemSize,
    range,
    rowOffsets: [],
    rowSizes: [],
    visibleRange: rangeToVisibleRange(range),
  };
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
  const endOffset = options.endRow >= options.rowCount
    ? options.totalSizePx
    : (options.rowOffsets[options.endRow] ?? options.totalSizePx);
  const startOffset = options.startRow >= options.rowCount
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
  for (let row = 0; row < rowSizes.length; row += 1) {
    if ((rowOffsets[row] ?? 0) + (rowSizes[row] ?? 0) > scrollOffset) {
      return row;
    }
  }

  return rowSizes.length;
}

function findVisibleEndRow(
  rowOffsets: readonly number[],
  rowSizes: readonly number[],
  viewportEnd: number,
): number {
  let visibleEndRow = 0;

  for (let row = 0; row < rowSizes.length; row += 1) {
    if ((rowOffsets[row] ?? 0) < viewportEnd) {
      visibleEndRow = row + 1;
    }
  }

  return visibleEndRow;
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
