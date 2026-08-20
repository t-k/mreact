import { effect, untrack } from "@reckona/mreact-reactive-core";
import {
  notifySubscribers,
  runtimeState,
  trackSource,
  type Source,
} from "@reckona/mreact-reactive-core/internal";
import { isDynamicHydrationEnabled, markDynamicNode, markDynamicNodes } from "./dynamic-node.js";
import {
  withBatchedDelegatedRootReleases,
  withDeferredDelegatedEventPromotions,
} from "./bind-event.js";
import { createDuplicateKeyWarning } from "./duplicate-key-warning.js";
import { createScopedRenderNodes } from "./render-scope.js";
import { registerDispose } from "./scope.js";
import type { Dispose, RenderValue } from "./types.js";

export interface BindListOptions<T> {
  itemMode?: "reactive" | "static";
  /** Selects stable row identity. Later rows with a duplicate key are skipped and warn once in development. */
  key?: (item: T, index: number, items: readonly T[]) => unknown;
  nestedObjectFallback?: boolean;
}

type ListItemRenderer<T> = (item: T, index: number, items: readonly T[]) => RenderValue;
type ListParentNode = ParentNode & Node & { replaceChildren(...nodes: Node[]): void };
const MAX_TARGETED_OWNED_PARENT_MOVES = 32;

/** Binds a reactive list of items to DOM nodes before a marker node. */
export function bindList<T>(
  parent: ParentNode,
  marker: ChildNode,
  items: () => readonly T[],
  renderItem: (item: T, index: number, items: readonly T[]) => RenderValue,
  options: BindListOptions<T> = {},
): Dispose {
  const markRecordsForHydration = isDynamicHydrationEnabled();

  if (markRecordsForHydration) {
    markDynamicNode(marker);
  }

  if (options.key === undefined) {
    return bindUnkeyedList(parent, marker, items, renderItem, markRecordsForHydration);
  }

  return bindKeyedList(
    parent,
    marker,
    items,
    renderItem,
    options.key,
    options,
    markRecordsForHydration,
  );
}

function bindUnkeyedList<T>(
  _parent: ParentNode,
  marker: ChildNode,
  items: () => readonly T[],
  renderItem: ListItemRenderer<T>,
  markRecordsForHydration: boolean,
): Dispose {
  let current: Node[] = [];
  let disposeCurrentScope: Dispose | undefined;

  const clear = () => {
    disposeCurrentScope?.();
    disposeCurrentScope = undefined;

    for (const node of current) {
      node.parentNode?.removeChild(node);
    }

    current = [];
  };

  const dispose = effect(() => {
    const currentItems = items();
    const insertionParent = marker.parentNode as ListParentNode | null;
    const deferred =
      insertionParent?.isConnected === true
        ? withDeferredDelegatedEventPromotions(() =>
            createScopedRenderNodes(() =>
              currentItems.map((item, index) => renderItem(item as T, index, currentItems)),
            ),
          )
        : undefined;
    const next =
      deferred?.value ??
      createScopedRenderNodes(() =>
        currentItems.map((item, index) => renderItem(item as T, index, currentItems)),
      );

    if (isSameNodeList(current, next.nodes)) {
      next.dispose();
      return;
    }

    clear();
    current = markRecordsForHydration ? markDynamicNodes(next.nodes) : next.nodes;
    disposeCurrentScope = next.dispose;

    if (insertionParent === null) {
      current = [];
      disposeCurrentScope?.();
      disposeCurrentScope = undefined;
      return;
    }

    for (const node of current) {
      insertionParent.insertBefore(node, marker);
    }
    deferred?.promote?.();
  });

  return registerDispose(() => {
    dispose();
    clear();
  });
}

interface KeyedRecord {
  nodes: Node[];
  prevIndex?: number | undefined;
  dispose: Dispose;
  promoteEvents?: (() => void) | undefined;
  // Update state lives on the record so one shared update function replaces a
  // per-record closure; itemCell is null for primitive items.
  itemCell: KeyedItemCell | null;
  currentItem: unknown;
  currentIndex: number;
  currentItems: readonly unknown[];
}

interface KeyedItems<T> {
  keys: readonly unknown[];
  // Parallel to keys. With duplicate keys this is a filtered copy and indexes
  // holds the original positions; otherwise it is the source array itself and
  // indexes stays null (original position === slot position).
  items: readonly T[];
  indexes: readonly number[] | null;
}

function bindKeyedList<T>(
  _parent: ParentNode,
  marker: ChildNode,
  items: () => readonly T[],
  renderItem: ListItemRenderer<T>,
  key: (item: T, index: number, items: readonly T[]) => unknown,
  options: BindListOptions<T>,
  markRecordsForHydration: boolean,
): Dispose {
  let records = new Map<unknown, KeyedRecord>();
  let ownsParent = false;
  let recordNodeCount = 0;
  // Function.length is stable for the lifetime of the list; reading it per
  // row update is avoidable property-access overhead.
  const renderArity = renderItem.length;
  const warnDuplicateKey = import.meta.env?.DEV === false ? undefined : createDuplicateKeyWarning();

  const dispose = effect(() => {
    const currentItems = items();
    const insertionParent = marker.parentNode as ListParentNode | null;

    if (insertionParent === null) {
      removeRecordNodes(records.values());
      records = new Map();
      ownsParent = false;
      recordNodeCount = 0;
      return;
    }

    if (currentItems.length === 0) {
      const ownsCurrentParent =
        ownsParent &&
        insertionParent.childNodes.length === recordNodeCount + 1 &&
        marker.nextSibling === null
          ? true
          : records.size > 0 && ownsWholeParent(insertionParent, marker, records);

      if (ownsCurrentParent) {
        disposeRecords(records.values());
        insertionParent.replaceChildren(marker);
        ownsParent = true;
      } else {
        removeRecordNodes(records.values());
        ownsParent = marker.nextSibling === null && insertionParent.childNodes.length === 1;
      }

      records = new Map();
      recordNodeCount = 0;
      return;
    }

    const ownsCurrentParent =
      ownsParent &&
      insertionParent.childNodes.length === recordNodeCount + 1 &&
      marker.nextSibling === null
        ? true
        : records.size > 0 && ownsWholeParent(insertionParent, marker, records);
    ownsParent = ownsCurrentParent;

    if (ownsCurrentParent) {
      const swappedRecords = tryReorderSwappedKeyedRecordsFromItems(
        insertionParent,
        marker,
        records,
        currentItems,
        key,
        renderArity,
        MAX_TARGETED_OWNED_PARENT_MOVES,
      );

      if (swappedRecords !== undefined) {
        records = swappedRecords.records;
        recordNodeCount = swappedRecords.nodeCount;
        ownsParent = true;
        return;
      }
    }

    const currentKeyedItems = uniqueKeyedItems(currentItems, key, warnDuplicateKey);
    const currentKeys = currentKeyedItems.keys;

    if (records.size === currentKeys.length && records.size > 0) {
      let sameKeyOrder = true;
      const previousKeys = records.keys();

      for (let index = 0; index < currentKeys.length; index += 1) {
        const previousKey = previousKeys.next();

        if (previousKey.done || !Object.is(previousKey.value, currentKeys[index])) {
          sameKeyOrder = false;
          break;
        }
      }

      if (sameKeyOrder && updateRecords(records, currentKeyedItems, currentItems, renderArity)) {
        return;
      }
    }

    if (ownsCurrentParent) {
      if (currentKeys.length === 0) {
        disposeRecords(records.values());
        insertionParent.replaceChildren(marker);
        records = new Map();
        ownsParent = true;
        recordNodeCount = 0;
        return;
      }

      const replacedRecords = tryReplaceDisjointKeyedRecords(
        insertionParent,
        marker,
        records,
        currentKeyedItems,
        currentItems,
        renderItem,
        options,
        markRecordsForHydration,
      );

      if (replacedRecords !== undefined) {
        records = replacedRecords.records;
        recordNodeCount = replacedRecords.nodeCount;
        ownsParent = true;
        return;
      }

      const swappedRecords = tryReorderSwappedKeyedRecords(
        insertionParent,
        marker,
        records,
        currentKeyedItems,
        currentItems,
        renderArity,
        MAX_TARGETED_OWNED_PARENT_MOVES,
      );

      if (swappedRecords !== undefined) {
        records = swappedRecords.records;
        recordNodeCount = swappedRecords.nodeCount;
        ownsParent = true;
        return;
      }

      const appendedRecords = tryAppendKeyedRecords(
        insertionParent,
        marker,
        records,
        currentKeyedItems,
        currentItems,
        renderItem,
        options,
        markRecordsForHydration,
        renderArity,
      );

      if (appendedRecords !== undefined) {
        records = appendedRecords.records;
        recordNodeCount += appendedRecords.appendedNodeCount;
        ownsParent = true;
        return;
      }

      const removedRecords = tryRemoveKeyedRecords(
        records,
        currentKeyedItems,
        currentItems,
        renderArity,
      );

      if (removedRecords !== undefined) {
        removeRecordNodes(removedRecords.staleRecords);
        records = removedRecords.nextRecords;
        recordNodeCount -= countRecordNodes(removedRecords.staleRecords);
        ownsParent = true;
        return;
      }
    }

    const nextRecords = new Map<unknown, KeyedRecord>();
    const orderedRecords: KeyedRecord[] = [];
    let orderedNodeCount = 0;
    let reusedAllRecords = true;
    let previousIndex = 0;

    for (const record of records.values()) {
      record.prevIndex = previousIndex;
      previousIndex += 1;
    }

    const keyedIndexes = currentKeyedItems.indexes;
    const keyedItemValues = currentKeyedItems.items;

    for (let slot = 0; slot < currentKeys.length; slot += 1) {
      const itemKey = currentKeys[slot];
      const item = keyedItemValues[slot] as T;
      const sourceIndex = keyedIndexes === null ? slot : (keyedIndexes[slot] as number);
      const existingRecord = records.get(itemKey);
      let record: KeyedRecord;

      if (existingRecord === undefined) {
        reusedAllRecords = false;
        record = createKeyedRecord(
          item,
          sourceIndex,
          currentItems,
          renderItem,
          options,
          markRecordsForHydration,
          insertionParent.isConnected,
        );
      } else {
        record = existingRecord;
        if (!updateKeyedRecord(record, renderArity, item, sourceIndex, currentItems)) {
          reusedAllRecords = false;
          removeRecordNodes([existingRecord]);
          record = createKeyedRecord(
            item,
            sourceIndex,
            currentItems,
            renderItem,
            options,
            markRecordsForHydration,
            insertionParent.isConnected,
          );
        }
      }

      nextRecords.set(itemKey, record);
      orderedRecords.push(record);
      orderedNodeCount += record.nodes.length;
    }

    const canClaimEmptyParent =
      records.size === 0 && insertionParent.childNodes.length === 1 && marker.nextSibling === null;

    if (canClaimEmptyParent) {
      const disposeError = disposeStaleRecords(records, nextRecords);
      replaceWithOrderedRecords(insertionParent, marker, orderedRecords);
      promoteRecordEvents(nextRecords.values());
      if (disposeError !== undefined) {
        throw disposeError;
      }
      ownsParent = true;
    } else if (ownsCurrentParent) {
      if (reusedAllRecords && nextRecords.size === records.size) {
        reconcileKeyedRecordOrder(insertionParent, marker, orderedRecords);
        records = nextRecords;
        recordNodeCount = orderedNodeCount;
        ownsParent = true;
        return;
      }

      const disposeError = disposeStaleRecords(records, nextRecords);
      replaceWithOrderedRecords(insertionParent, marker, orderedRecords);
      promoteRecordEvents(nextRecords.values());
      if (disposeError !== undefined) {
        throw disposeError;
      }
      ownsParent = true;
    } else {
      if (!reusedAllRecords || nextRecords.size !== records.size) {
        removeStaleRecords(records, nextRecords);
      }

      reconcileKeyedRecordOrder(insertionParent, marker, orderedRecords);
      promoteRecordEvents(nextRecords.values());
      ownsParent =
        insertionParent.childNodes.length === orderedNodeCount + 1 && marker.nextSibling === null;
    }
    recordNodeCount = orderedNodeCount;

    records = nextRecords;
  });

  return registerDispose(() => {
    dispose();

    removeRecordNodes(records.values());

    records = new Map();
  });
}

function replaceWithOrderedRecords(
  parent: ListParentNode,
  marker: ChildNode,
  orderedRecords: readonly KeyedRecord[],
): void {
  const fragment = document.createDocumentFragment();

  for (const record of orderedRecords) {
    for (const node of record.nodes) {
      fragment.appendChild(node);
    }
  }

  parent.replaceChildren(fragment, marker);
}

function uniqueKeyedItems<T>(
  items: readonly T[],
  key: (item: T, index: number, items: readonly T[]) => unknown,
  warnDuplicateKey: ((key: unknown) => void) | undefined,
): KeyedItems<T> {
  const length = items.length;
  // oxlint-disable-next-line unicorn/no-new-array -- a sparse preallocated keys array avoids per-slot callbacks on the hot list path.
  const keys = new Array<unknown>(length);
  const seenKeys = new Set<unknown>();

  for (let index = 0; index < length; index += 1) {
    const itemKey = key(items[index] as T, index, items);

    if (seenKeys.has(itemKey)) {
      warnDuplicateKey?.(itemKey);
      return dedupedKeyedItems(items, key, keys, seenKeys, index, warnDuplicateKey);
    }

    seenKeys.add(itemKey);
    keys[index] = itemKey;
  }

  return { keys, items, indexes: null };
}

// Slow path taken only when a duplicate key appears at duplicateIndex; the
// optimistic pass above already filled keys[0..duplicateIndex).
function dedupedKeyedItems<T>(
  items: readonly T[],
  key: (item: T, index: number, items: readonly T[]) => unknown,
  prefixKeys: readonly unknown[],
  seenKeys: Set<unknown>,
  duplicateIndex: number,
  warnDuplicateKey: ((key: unknown) => void) | undefined,
): KeyedItems<T> {
  const keys: unknown[] = prefixKeys.slice(0, duplicateIndex);
  const dedupedItems: T[] = items.slice(0, duplicateIndex);
  const indexes: number[] = [];

  for (let index = 0; index < duplicateIndex; index += 1) {
    indexes.push(index);
  }

  for (let index = duplicateIndex + 1; index < items.length; index += 1) {
    const itemKey = key(items[index] as T, index, items);

    if (seenKeys.has(itemKey)) {
      warnDuplicateKey?.(itemKey);
      continue;
    }

    seenKeys.add(itemKey);
    keys.push(itemKey);
    dedupedItems.push(items[index] as T);
    indexes.push(index);
  }

  return { keys, items: dedupedItems, indexes };
}

function tryAppendKeyedRecords<T>(
  parent: ParentNode,
  marker: ChildNode,
  records: Map<unknown, KeyedRecord>,
  currentKeyedItems: KeyedItems<T>,
  currentItems: readonly T[],
  renderItem: ListItemRenderer<T>,
  options: BindListOptions<T>,
  markRecordsForHydration: boolean,
  renderArity: number,
): { appendedNodeCount: number; records: Map<unknown, KeyedRecord> } | undefined {
  const keys = currentKeyedItems.keys;
  const items = currentKeyedItems.items;
  const indexes = currentKeyedItems.indexes;

  if (keys.length <= records.size) {
    return undefined;
  }

  const previousRecords = records[Symbol.iterator]();

  for (let slot = 0; slot < records.size; slot += 1) {
    const previousRecord = previousRecords.next();
    const itemKey = keys[slot];

    if (previousRecord.done || !Object.is(previousRecord.value[0], itemKey)) {
      return undefined;
    }

    const record = previousRecord.value[1];
    const item = items[slot];
    const sourceIndex = indexes === null ? slot : (indexes[slot] as number);

    if (
      !canSkipKeyedRecordUpdate(record, renderArity, item, sourceIndex, currentItems) &&
      !updateKeyedRecord(record, renderArity, item, sourceIndex, currentItems)
    ) {
      return undefined;
    }
  }

  for (let slot = records.size; slot < keys.length; slot += 1) {
    if (records.has(keys[slot])) {
      return undefined;
    }
  }

  // When the marker is the parent's last child the new rows can use plain
  // appendChild with a fragment (then re-append the marker once) instead of
  // paying the insert-before-marker position lookup for every node.
  const appendToParentTail = marker.nextSibling === null;
  const appendFragment = appendToParentTail ? document.createDocumentFragment() : undefined;

  let appendedNodeCount = 0;
  for (let slot = records.size; slot < keys.length; slot += 1) {
    const record = createKeyedRecord(
      items[slot] as T,
      indexes === null ? slot : (indexes[slot] as number),
      currentItems,
      renderItem,
      options,
      markRecordsForHydration,
      parent.isConnected,
    );

    records.set(keys[slot], record);
    appendedNodeCount += record.nodes.length;

    for (const node of record.nodes) {
      if (appendFragment !== undefined) {
        appendFragment.appendChild(node);
      } else {
        parent.insertBefore(node, marker);
      }
    }
    promoteRecordEvents([record]);
  }

  if (appendToParentTail && appendedNodeCount > 0) {
    parent.appendChild(appendFragment as DocumentFragment);
    parent.appendChild(marker);
  }

  return { appendedNodeCount, records };
}

function tryReorderSwappedKeyedRecordsFromItems<T>(
  parent: ParentNode,
  marker: ChildNode,
  records: Map<unknown, KeyedRecord>,
  currentItems: readonly T[],
  key: (item: T, index: number, items: readonly T[]) => unknown,
  renderArity: number,
  maxMovedNodes: number,
): { records: Map<unknown, KeyedRecord>; nodeCount: number } | undefined {
  if (
    !Number.isFinite(maxMovedNodes) ||
    renderArity >= 2 ||
    currentItems.length !== records.size ||
    currentItems.length < 2
  ) {
    return undefined;
  }

  const previousKeys = records.keys();
  let firstIndex = -1;
  let secondIndex = -1;
  let firstPreviousKey: unknown;
  let secondPreviousKey: unknown;
  let firstNextKey: unknown;
  let secondNextKey: unknown;

  for (let slot = 0; slot < currentItems.length; slot += 1) {
    const previousKey = previousKeys.next();

    if (previousKey.done) {
      return undefined;
    }

    const nextKey = key(currentItems[slot] as T, slot, currentItems);

    if (sameValue(previousKey.value, nextKey)) {
      continue;
    }

    if (firstIndex === -1) {
      firstIndex = slot;
      firstPreviousKey = previousKey.value;
      firstNextKey = nextKey;
    } else if (secondIndex === -1) {
      secondIndex = slot;
      secondPreviousKey = previousKey.value;
      secondNextKey = nextKey;
    } else {
      return undefined;
    }
  }

  if (
    firstIndex === -1 ||
    secondIndex === -1 ||
    !sameValue(firstPreviousKey, secondNextKey) ||
    !sameValue(secondPreviousKey, firstNextKey)
  ) {
    return undefined;
  }

  const nextRecords = new Map<unknown, KeyedRecord>();
  let nodeCount = 0;

  for (let slot = 0; slot < currentItems.length; slot += 1) {
    const item = currentItems[slot] as T;
    const itemKey = key(item, slot, currentItems);
    const record = records.get(itemKey);

    if (record === undefined) {
      return undefined;
    }

    if (
      !canSkipKeyedRecordUpdate(record, renderArity, item, slot, currentItems) &&
      !updateKeyedRecord(record, renderArity, item, slot, currentItems)
    ) {
      return undefined;
    }

    nextRecords.set(itemKey, record);
    nodeCount += record.nodes.length;
  }

  const firstRecord = nextRecords.get(firstNextKey);
  const secondRecord = nextRecords.get(secondNextKey);

  if (firstRecord === undefined || secondRecord === undefined) {
    return undefined;
  }

  const movedNodes = firstRecord.nodes.length + secondRecord.nodes.length;

  if (movedNodes > maxMovedNodes) {
    return undefined;
  }

  const firstAnchor = secondRecord.nodes[0] as ChildNode | undefined;
  const secondAnchor =
    secondIndex + 1 < currentItems.length
      ? (nextRecords.get(key(currentItems[secondIndex + 1] as T, secondIndex + 1, currentItems))
          ?.nodes[0] as ChildNode | undefined)
      : marker;

  if (firstAnchor === undefined || secondAnchor === undefined) {
    return undefined;
  }

  for (const node of firstRecord.nodes) {
    parent.insertBefore(node, firstAnchor);
  }

  for (const node of secondRecord.nodes) {
    parent.insertBefore(node, secondAnchor);
  }

  return { records: nextRecords, nodeCount };
}

function tryReorderSwappedKeyedRecords<T>(
  parent: ParentNode,
  marker: ChildNode,
  records: Map<unknown, KeyedRecord>,
  currentKeyedItems: KeyedItems<T>,
  currentItems: readonly T[],
  renderArity: number,
  maxMovedNodes: number,
): { records: Map<unknown, KeyedRecord>; nodeCount: number } | undefined {
  const keys = currentKeyedItems.keys;

  if (
    !Number.isFinite(maxMovedNodes) ||
    renderArity >= 2 ||
    currentKeyedItems.indexes !== null ||
    keys.length !== records.size ||
    keys.length < 2
  ) {
    return undefined;
  }

  const previousKeys = records.keys();
  let firstIndex = -1;
  let secondIndex = -1;
  let firstPreviousKey: unknown;
  let secondPreviousKey: unknown;

  for (let slot = 0; slot < keys.length; slot += 1) {
    const previousKey = previousKeys.next();

    if (previousKey.done) {
      return undefined;
    }

    const nextKey = keys[slot];

    if (Object.is(previousKey.value, nextKey)) {
      continue;
    }

    if (firstIndex === -1) {
      firstIndex = slot;
      firstPreviousKey = previousKey.value;
    } else if (secondIndex === -1) {
      secondIndex = slot;
      secondPreviousKey = previousKey.value;
    } else {
      return undefined;
    }
  }

  if (
    firstIndex === -1 ||
    secondIndex === -1 ||
    !Object.is(firstPreviousKey, keys[secondIndex]) ||
    !Object.is(secondPreviousKey, keys[firstIndex])
  ) {
    return undefined;
  }

  const nextRecords = new Map<unknown, KeyedRecord>();
  const items = currentKeyedItems.items;
  let nodeCount = 0;

  for (let slot = 0; slot < keys.length; slot += 1) {
    const record = records.get(keys[slot]);

    if (record === undefined) {
      return undefined;
    }

    if (
      !canSkipKeyedRecordUpdate(record, renderArity, items[slot], slot, currentItems) &&
      !updateKeyedRecord(record, renderArity, items[slot], slot, currentItems)
    ) {
      return undefined;
    }

    nextRecords.set(keys[slot], record);
    nodeCount += record.nodes.length;
  }

  const firstRecord = nextRecords.get(keys[firstIndex]);
  const secondRecord = nextRecords.get(keys[secondIndex]);

  if (firstRecord === undefined || secondRecord === undefined) {
    return undefined;
  }

  const movedNodes = firstRecord.nodes.length + secondRecord.nodes.length;

  if (movedNodes > maxMovedNodes) {
    return undefined;
  }

  const firstAnchor = secondRecord.nodes[0] as ChildNode | undefined;
  const secondAnchor =
    (nextRecords.get(keys[secondIndex + 1])?.nodes[0] as ChildNode | undefined) ?? marker;

  if (firstAnchor === undefined) {
    return undefined;
  }

  for (const node of firstRecord.nodes) {
    parent.insertBefore(node, firstAnchor);
  }

  for (const node of secondRecord.nodes) {
    parent.insertBefore(node, secondAnchor);
  }

  return { records: nextRecords, nodeCount };
}

function canSkipKeyedRecordUpdate(
  record: KeyedRecord,
  renderArity: number,
  nextItem: unknown,
  nextIndex: number,
  nextItems: readonly unknown[],
): boolean {
  return (
    Object.is(record.currentItem, nextItem) &&
    (renderArity < 2 || record.currentIndex === nextIndex) &&
    (renderArity < 3 || record.currentItems === nextItems)
  );
}

function reconcileKeyedRecordOrder(
  parent: ParentNode,
  marker: ChildNode,
  orderedRecords: readonly KeyedRecord[],
): void {
  reconcileKeyedRecordOrderWithMoveLimit(parent, marker, orderedRecords, Number.POSITIVE_INFINITY);
}

function reconcileKeyedRecordOrderWithMoveLimit(
  parent: ParentNode,
  marker: ChildNode,
  orderedRecords: readonly KeyedRecord[],
  maxMovedNodes: number,
): boolean {
  const swappedPairResult = reconcileSwappedKeyedRecordPair(
    parent,
    marker,
    orderedRecords,
    maxMovedNodes,
  );

  if (swappedPairResult !== undefined) {
    return swappedPairResult;
  }

  const previousOrder: number[] = [];
  for (let index = 0; index < orderedRecords.length; index += 1) {
    previousOrder.push(orderedRecords[index]?.prevIndex ?? -1);
  }
  const stableIndexes = new Set(longestIncreasingSubsequenceIndexes(previousOrder));

  let movedNodes = 0;
  for (let index = 0; index < orderedRecords.length; index += 1) {
    const record = orderedRecords[index];

    if (record !== undefined && !stableIndexes.has(index)) {
      movedNodes += record.nodes.length;

      if (movedNodes > maxMovedNodes) {
        return false;
      }
    }
  }

  let anchor: ChildNode = marker;

  for (let index = orderedRecords.length - 1; index >= 0; index -= 1) {
    const record = orderedRecords[index];

    if (record === undefined || record.nodes.length === 0) {
      continue;
    }

    const firstNode = record.nodes[0] as ChildNode;

    if (stableIndexes.has(index)) {
      anchor = firstNode;
      continue;
    }

    for (const node of record.nodes) {
      parent.insertBefore(node, anchor);
    }

    anchor = firstNode;
  }

  return true;
}

function reconcileSwappedKeyedRecordPair(
  parent: ParentNode,
  marker: ChildNode,
  orderedRecords: readonly KeyedRecord[],
  maxMovedNodes: number,
): boolean | undefined {
  if (!Number.isFinite(maxMovedNodes)) {
    return undefined;
  }

  let firstMovedIndex = -1;
  let secondMovedIndex = -1;
  let movedNodes = 0;

  for (let index = 0; index < orderedRecords.length; index += 1) {
    const record = orderedRecords[index];
    const previousIndex = record?.prevIndex ?? -1;

    if (previousIndex === index) {
      continue;
    }

    if (previousIndex < 0 || record === undefined) {
      return undefined;
    }

    if (firstMovedIndex === -1) {
      firstMovedIndex = index;
    } else if (secondMovedIndex === -1) {
      secondMovedIndex = index;
    } else {
      return undefined;
    }

    movedNodes += record.nodes.length;
  }

  if (firstMovedIndex === -1 || secondMovedIndex === -1) {
    return undefined;
  }

  const firstRecord = orderedRecords[firstMovedIndex];
  const secondRecord = orderedRecords[secondMovedIndex];

  if (
    firstRecord === undefined ||
    secondRecord === undefined ||
    firstRecord.prevIndex !== secondMovedIndex ||
    secondRecord.prevIndex !== firstMovedIndex
  ) {
    return undefined;
  }

  if (movedNodes > maxMovedNodes) {
    return false;
  }

  const firstAnchor = secondRecord.nodes[0] as ChildNode | undefined;
  const secondAnchor =
    (orderedRecords[secondMovedIndex + 1]?.nodes[0] as ChildNode | undefined) ?? marker;

  if (firstAnchor === undefined) {
    return undefined;
  }

  for (const node of firstRecord.nodes) {
    parent.insertBefore(node, firstAnchor);
  }

  for (const node of secondRecord.nodes) {
    parent.insertBefore(node, secondAnchor);
  }

  return true;
}

function longestIncreasingSubsequenceIndexes(values: readonly number[]): number[] {
  const predecessors = Array.from({ length: values.length }, () => -1);
  const pileIndexes: number[] = [];

  for (let index = 0; index < values.length; index += 1) {
    const value = values[index] ?? -1;

    if (value < 0) {
      continue;
    }

    let low = 0;
    let high = pileIndexes.length;

    while (low < high) {
      const mid = (low + high) >> 1;
      const midValue = values[pileIndexes[mid] ?? 0] ?? -1;

      if (midValue < value) {
        low = mid + 1;
      } else {
        high = mid;
      }
    }

    if (low > 0) {
      predecessors[index] = pileIndexes[low - 1] ?? -1;
    }

    pileIndexes[low] = index;
  }

  const result: number[] = [];
  let index = pileIndexes[pileIndexes.length - 1] ?? -1;

  while (index !== -1) {
    result.push(index);
    index = predecessors[index] ?? -1;
  }

  result.reverse();
  return result;
}

function updateRecords<T>(
  records: Map<unknown, KeyedRecord>,
  currentKeyedItems: KeyedItems<T>,
  currentItems: readonly T[],
  renderArity: number,
): boolean {
  const keys = currentKeyedItems.keys;
  const items = currentKeyedItems.items;
  const indexes = currentKeyedItems.indexes;

  for (let slot = 0; slot < keys.length; slot += 1) {
    const record = records.get(keys[slot]);

    if (
      record === undefined ||
      !updateKeyedRecord(
        record,
        renderArity,
        items[slot],
        indexes === null ? slot : (indexes[slot] as number),
        currentItems,
      )
    ) {
      return false;
    }
  }

  return true;
}

// Shared across all records; per-record update state lives on the record
// object instead of a captured closure environment.
function updateKeyedRecord(
  record: KeyedRecord,
  renderArity: number,
  nextItem: unknown,
  nextIndex: number,
  nextItems: readonly unknown[],
): boolean {
  if (!isObjectLike(record.currentItem) && !Object.is(record.currentItem, nextItem)) {
    return false;
  }

  if (renderArity >= 2 && record.currentIndex !== nextIndex) {
    return false;
  }

  if (renderArity >= 3 && record.currentItems !== nextItems) {
    return false;
  }

  if (record.itemCell !== null) {
    setKeyedItemValue(record.itemCell, nextItem);
  }
  record.currentItem = nextItem;
  record.currentIndex = nextIndex;
  record.currentItems = nextItems;
  return true;
}

function createKeyedRecord<T>(
  item: T,
  index: number,
  items: readonly T[],
  renderItem: ListItemRenderer<T>,
  options: BindListOptions<T>,
  markRecordsForHydration: boolean,
  deferEventPromotion: boolean,
): KeyedRecord {
  let itemCell: KeyedItemCell | null = null;
  let renderedItem: T = item;

  if (options.itemMode !== "static" && isObjectLike(item)) {
    itemCell = createKeyedItemCell(item);
    renderedItem = (
      options.nestedObjectFallback === true
        ? createNestedFallbackItemProxy(itemCell)
        : createItemProxy(itemCell)
    ) as T;
  }

  const deferred = deferEventPromotion
    ? untrack(() =>
        withDeferredDelegatedEventPromotions(() =>
          createScopedRenderNodes(() => renderItem(renderedItem, index, items)),
        ),
      )
    : undefined;
  const scoped =
    deferred?.value ??
    untrack(() => createScopedRenderNodes(() => renderItem(renderedItem, index, items)));
  const nodes = markRecordsForHydration ? markDynamicNodes(scoped.nodes) : scoped.nodes;

  return {
    nodes,
    dispose: scoped.dispose,
    promoteEvents: deferred?.promote,
    itemCell,
    currentItem: item,
    currentIndex: index,
    currentItems: items,
  };
}

function promoteRecordEvents(records: Iterable<KeyedRecord>): void {
  for (const record of records) {
    record.promoteEvents?.();
    record.promoteEvents = undefined;
  }
}

interface KeyedItemCell {
  value: unknown;
  source?: Source | undefined;
}

// One shared handler for every keyed item proxy; the record's cell rides on
// the proxy target instead of five fresh trap closures per row. Every trap
// delegates to the cell value, so the target's own `cell` property is never
// observable through the proxy.
const ITEM_PROXY_HANDLER: ProxyHandler<KeyedItemCell> = {
  get(target, property) {
    const value = getKeyedItemValue(target);
    return isObjectLike(value) ? Reflect.get(value, property, value) : undefined;
  },
  getOwnPropertyDescriptor(target, property) {
    const value = getKeyedItemValue(target);
    return isObjectLike(value)
      ? configurableProxyDescriptor(Reflect.getOwnPropertyDescriptor(value, property))
      : undefined;
  },
  has(target, property) {
    const value = getKeyedItemValue(target);
    return isObjectLike(value) && Reflect.has(value, property);
  },
  ownKeys(target) {
    const value = getKeyedItemValue(target);
    return isObjectLike(value) ? Reflect.ownKeys(value) : [];
  },
  set(target, property, nextValue) {
    const value = getKeyedItemValue(target);
    if (!isObjectLike(value)) {
      return false;
    }
    return Reflect.set(value, property, nextValue, value);
  },
};

function createKeyedItemCell(value: unknown): KeyedItemCell {
  return { value };
}

function getKeyedItemValue(cell: KeyedItemCell): unknown {
  if (runtimeState.activeTracker !== null) {
    cell.source ??= { subscribers: null };
    trackSource(cell.source);
  }

  return cell.value;
}

function setKeyedItemValue(cell: KeyedItemCell, next: unknown): void {
  if (Object.is(cell.value, next)) {
    return;
  }

  cell.value = next;

  const source = cell.source;

  if (source !== undefined && source.subscribers !== null) {
    notifySubscribers(source);
  }
}

function createItemProxy<T extends object>(current: KeyedItemCell): T {
  return new Proxy(current, ITEM_PROXY_HANDLER) as unknown as T;
}

function createNestedFallbackItemProxy<T extends object>(current: KeyedItemCell): T {
  let childProxies: Map<PropertyKey, object> | undefined;
  let rawObjectProperties: Set<PropertyKey> | undefined;

  return new Proxy({} as T, {
    get(_target, property) {
      const value = getKeyedItemValue(current);
      if (!isObjectLike(value)) {
        return undefined;
      }

      const next = Reflect.get(value, property, value);

      if (next === null || typeof next !== "object") {
        const existingChildProxy =
          next == null && childProxies !== undefined ? childProxies.get(property) : undefined;

        if (existingChildProxy !== undefined) {
          return existingChildProxy;
        }

        return next;
      }

      if (rawObjectProperties?.has(property)) {
        return next;
      }

      if (!shouldProxyNestedValue(next)) {
        rawObjectProperties ??= new Set();
        rawObjectProperties.add(property);
        return next;
      }

      childProxies ??= new Map();
      let childProxy = childProxies.get(property);

      if (childProxy === undefined) {
        childProxy = createNestedItemProxy(current, [property]);
        childProxies.set(property, childProxy);
      }

      return childProxy;
    },
    getOwnPropertyDescriptor(_target, property) {
      const value = getKeyedItemValue(current);
      return isObjectLike(value)
        ? configurableProxyDescriptor(Reflect.getOwnPropertyDescriptor(value, property))
        : undefined;
    },
    has(_target, property) {
      const value = getKeyedItemValue(current);
      return isObjectLike(value) && Reflect.has(value, property);
    },
    ownKeys() {
      const value = getKeyedItemValue(current);
      return isObjectLike(value) ? Reflect.ownKeys(value) : [];
    },
    set(_target, property, nextValue) {
      const value = getKeyedItemValue(current);
      if (!isObjectLike(value)) {
        return false;
      }
      return Reflect.set(value, property, nextValue, value);
    },
  });
}

function createNestedItemProxy(current: KeyedItemCell, path: readonly PropertyKey[]): object {
  let childProxies: Map<PropertyKey, object> | undefined;
  let rawObjectProperties: Set<PropertyKey> | undefined;

  return new Proxy({} as object, {
    get(_target, property) {
      const value = valueAtPath(getKeyedItemValue(current), path);

      if (!isObjectLike(value)) {
        return undefined;
      }

      const next = Reflect.get(value, property, value);

      if (next === null || typeof next !== "object") {
        const existingChildProxy =
          next == null && childProxies !== undefined ? childProxies.get(property) : undefined;

        if (existingChildProxy !== undefined) {
          return existingChildProxy;
        }

        return next;
      }

      if (rawObjectProperties?.has(property)) {
        return next;
      }

      if (!shouldProxyNestedValue(next)) {
        rawObjectProperties ??= new Set();
        rawObjectProperties.add(property);
        return next;
      }

      childProxies ??= new Map();
      let childProxy = childProxies.get(property);

      if (childProxy === undefined) {
        childProxy = createNestedItemProxy(current, [...path, property]);
        childProxies.set(property, childProxy);
      }

      return childProxy;
    },
    getOwnPropertyDescriptor(_target, property) {
      const value = valueAtPath(getKeyedItemValue(current), path);
      return isObjectLike(value)
        ? configurableProxyDescriptor(Reflect.getOwnPropertyDescriptor(value, property))
        : undefined;
    },
    has(_target, property) {
      const value = valueAtPath(getKeyedItemValue(current), path);
      return isObjectLike(value) && Reflect.has(value, property);
    },
    ownKeys() {
      const value = valueAtPath(getKeyedItemValue(current), path);
      return isObjectLike(value) ? Reflect.ownKeys(value) : [];
    },
    set(_target, property, nextValue) {
      const value = valueAtPath(getKeyedItemValue(current), path);
      if (!isObjectLike(value)) {
        return false;
      }
      return Reflect.set(value, property, nextValue, value);
    },
  });
}

function configurableProxyDescriptor(
  descriptor: PropertyDescriptor | undefined,
): PropertyDescriptor | undefined {
  return descriptor === undefined ? undefined : { ...descriptor, configurable: true };
}

function valueAtPath(value: unknown, path: readonly PropertyKey[]): unknown {
  let current: unknown = value;

  for (const property of path) {
    if (!isObjectLike(current)) {
      return undefined;
    }

    current = Reflect.get(current, property, current);
  }

  return current;
}

function shouldProxyNestedValue(value: object): boolean {
  if (Array.isArray(value)) {
    return true;
  }

  const prototype = Object.getPrototypeOf(value);

  if (prototype !== Object.prototype && prototype !== null) {
    return false;
  }

  for (const property of Reflect.ownKeys(value)) {
    if (typeof Reflect.get(value, property, value) === "function") {
      return false;
    }
  }

  return true;
}

function isObjectLike(value: unknown): value is object {
  return typeof value === "object" && value !== null;
}

function sameValue(left: unknown, right: unknown): boolean {
  return left === right
    ? left !== 0 || 1 / (left as number) === 1 / (right as number)
    : left !== left && right !== right;
}

function tryReplaceDisjointKeyedRecords<T>(
  parent: ParentNode,
  marker: ChildNode,
  records: Map<unknown, KeyedRecord>,
  currentKeyedItems: KeyedItems<T>,
  currentItems: readonly T[],
  renderItem: ListItemRenderer<T>,
  options: BindListOptions<T>,
  markRecordsForHydration: boolean,
): { nodeCount: number; records: Map<unknown, KeyedRecord> } | undefined {
  const keys = currentKeyedItems.keys;

  if (keys.length !== records.size || keys.length === 0) {
    return undefined;
  }

  for (const itemKey of keys) {
    if (records.has(itemKey)) {
      return undefined;
    }
  }

  const items = currentKeyedItems.items;
  const indexes = currentKeyedItems.indexes;
  const nextRecords = new Map<unknown, KeyedRecord>();
  const fragment = document.createDocumentFragment();
  let nodeCount = 0;

  for (let slot = 0; slot < keys.length; slot += 1) {
    const record = createKeyedRecord(
      items[slot] as T,
      indexes === null ? slot : (indexes[slot] as number),
      currentItems,
      renderItem,
      options,
      markRecordsForHydration,
      parent.isConnected,
    );

    nextRecords.set(keys[slot], record);
    nodeCount += record.nodes.length;

    for (const node of record.nodes) {
      fragment.appendChild(node);
    }
  }

  const disposeError = disposeRecordValues(records.values());
  parent.replaceChildren(fragment, marker);
  promoteRecordEvents(nextRecords.values());

  if (disposeError !== undefined) {
    throw disposeError;
  }

  return { nodeCount, records: nextRecords };
}

function tryRemoveKeyedRecords<T>(
  records: Map<unknown, KeyedRecord>,
  currentKeyedItems: KeyedItems<T>,
  currentItems: readonly T[],
  renderArity: number,
): { nextRecords: Map<unknown, KeyedRecord>; staleRecords: KeyedRecord[] } | undefined {
  const keys = currentKeyedItems.keys;
  const items = currentKeyedItems.items;
  const indexes = currentKeyedItems.indexes;

  if (keys.length >= records.size || keys.length === 0) {
    return undefined;
  }

  const nextRecords = new Map<unknown, KeyedRecord>();
  const staleRecords: KeyedRecord[] = [];
  let previousIndex = 0;

  for (const [previousKey, record] of records) {
    if (previousIndex < keys.length) {
      const itemKey = keys[previousIndex];

      if (Object.is(previousKey, itemKey)) {
        if (nextRecords.has(previousKey)) {
          return undefined;
        }

        if (
          !updateKeyedRecord(
            record,
            renderArity,
            items[previousIndex],
            indexes === null ? previousIndex : (indexes[previousIndex] as number),
            currentItems,
          )
        ) {
          return undefined;
        }

        nextRecords.set(previousKey, record);
        previousIndex += 1;
        continue;
      }
    }

    staleRecords.push(record);
  }

  return previousIndex === keys.length ? { nextRecords, staleRecords } : undefined;
}

function removeStaleRecords(
  records: Map<unknown, KeyedRecord>,
  nextRecords: Map<unknown, KeyedRecord>,
): void {
  const staleRecords: KeyedRecord[] = [];

  for (const [itemKey, record] of records) {
    if (nextRecords.has(itemKey)) {
      continue;
    }

    staleRecords.push(record);
  }

  removeRecordNodes(staleRecords);
}

function disposeStaleRecords(
  records: Map<unknown, KeyedRecord>,
  nextRecords: Map<unknown, KeyedRecord>,
): unknown {
  let firstError: unknown;

  withBatchedDelegatedRootReleases(() => {
    for (const [itemKey, record] of records) {
      if (!nextRecords.has(itemKey)) {
        try {
          record.dispose();
        } catch (error) {
          firstError ??= error;
        }
      }
    }
  });

  return firstError;
}

function disposeRecordValues(records: Iterable<KeyedRecord>): unknown {
  let firstError: unknown;

  withBatchedDelegatedRootReleases(() => {
    for (const record of records) {
      try {
        record.dispose();
      } catch (error) {
        firstError ??= error;
      }
    }
  });

  return firstError;
}

function removeRecordNodes(records: Iterable<KeyedRecord>): void {
  let firstError: unknown;

  withBatchedDelegatedRootReleases(() => {
    for (const record of records) {
      try {
        record.dispose();
      } catch (error) {
        firstError ??= error;
      }

      for (const node of record.nodes) {
        node.parentNode?.removeChild(node);
      }
    }
  });

  if (firstError !== undefined) {
    throw firstError;
  }
}

function disposeRecords(records: Iterable<KeyedRecord>): void {
  withBatchedDelegatedRootReleases(() => {
    for (const record of records) {
      record.dispose();
    }
  });
}

function countRecordNodes(records: readonly KeyedRecord[]): number {
  let count = 0;

  for (const record of records) {
    count += record.nodes.length;
  }

  return count;
}

function ownsWholeParent(
  parent: ParentNode,
  marker: ChildNode,
  records: Map<unknown, KeyedRecord>,
): boolean {
  if (marker.parentNode !== parent || marker.nextSibling !== null) {
    return false;
  }

  let expectedNodes = 0;

  for (const record of records.values()) {
    expectedNodes += record.nodes.length;
  }

  if (parent.childNodes.length !== expectedNodes + 1) {
    return false;
  }

  let childIndex = 0;

  for (const record of records.values()) {
    for (const node of record.nodes) {
      if (parent.childNodes[childIndex] !== node) {
        return false;
      }

      childIndex += 1;
    }
  }

  return parent.childNodes[childIndex] === marker;
}

function isSameNodeList(left: readonly Node[], right: readonly Node[]): boolean {
  return left.length === right.length && left.every((node, index) => node === right[index]);
}
