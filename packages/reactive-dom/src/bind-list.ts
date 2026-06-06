import { cell, effect, untrack, type Cell } from "@reckona/mreact-reactive-core";
import {
  isDynamicHydrationEnabled,
  markDynamicNode,
  markDynamicNodes,
} from "./dynamic-node.js";
import { createScopedRenderNodes } from "./render-scope.js";
import { registerDispose } from "./scope.js";
import type { Dispose, RenderValue } from "./types.js";

export interface BindListOptions<T> {
  key?: (item: T, index: number, items: readonly T[]) => unknown;
  nestedObjectFallback?: boolean;
}

type ListItemRenderer<T> = (item: T, index: number, items: readonly T[]) => RenderValue;
type ListParentNode = ParentNode & Node & { replaceChildren(...nodes: Node[]): void };

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
    const next = createScopedRenderNodes(() =>
      currentItems.map((item, index) => renderItem(item as T, index, currentItems)),
    );

    if (isSameNodeList(current, next.nodes)) {
      next.dispose();
      return;
    }

    clear();
    current = markRecordsForHydration ? markDynamicNodes(next.nodes) : next.nodes;
    disposeCurrentScope = next.dispose;

    const insertionParent = marker.parentNode as ListParentNode | null;

    if (insertionParent === null) {
      current = [];
      disposeCurrentScope?.();
      disposeCurrentScope = undefined;
      return;
    }

    for (const node of current) {
      insertionParent.insertBefore(node, marker);
    }
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
  update(item: unknown): void;
}

interface KeyedItem<T> {
  item: T;
  index: number;
  key: unknown;
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
        marker.nextSibling === null &&
        insertionParent.childNodes.length === recordNodeCount + 1
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

    const currentKeyedItems = uniqueKeyedItems(currentItems, key);

    if (records.size === currentKeyedItems.length && records.size > 0) {
      let sameKeyOrder = true;
      const previousKeys = records.keys();

      for (let index = 0; index < currentKeyedItems.length; index += 1) {
        const previousKey = previousKeys.next();
        const itemKey = currentKeyedItems[index]?.key;

        if (previousKey.done || !Object.is(previousKey.value, itemKey)) {
          sameKeyOrder = false;
          break;
        }
      }

      if (sameKeyOrder) {
        updateRecords(records, currentKeyedItems);
        return;
      }
    }

    const ownsCurrentParent =
      ownsParent &&
      marker.nextSibling === null &&
      insertionParent.childNodes.length === recordNodeCount + 1
        ? true
        : records.size > 0 && ownsWholeParent(insertionParent, marker, records);
    ownsParent = ownsCurrentParent;

    if (ownsCurrentParent) {
      if (currentKeyedItems.length === 0) {
        disposeRecords(records.values());
        insertionParent.replaceChildren(marker);
        records = new Map();
        ownsParent = true;
        recordNodeCount = 0;
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
    const orderedNodes: Node[] = [];
    let reusedAllRecords = true;
    let previousIndex = 0;

    for (const record of records.values()) {
      record.prevIndex = previousIndex;
      previousIndex += 1;
    }

    for (const keyedItem of currentKeyedItems) {
      const itemKey = keyedItem.key;
      const existingRecord = records.get(itemKey);

      if (existingRecord === undefined) {
        reusedAllRecords = false;
      }

      const record =
        existingRecord ??
        createKeyedRecord(
          keyedItem.item,
          keyedItem.index,
          currentItems,
          renderItem,
          options,
          markRecordsForHydration,
        );

      record.update(keyedItem.item);

      nextRecords.set(itemKey, record);
      orderedRecords.push(record);

      for (const node of record.nodes) {
        orderedNodes.push(node);
      }
    }

    if (ownsCurrentParent) {
      disposeStaleRecords(records, nextRecords);
      insertionParent.replaceChildren(...orderedNodes, marker);
      ownsParent = true;
    } else {
      if (!reusedAllRecords || nextRecords.size !== records.size) {
        removeStaleRecords(records, nextRecords);
      }

      reconcileKeyedRecordOrder(insertionParent, marker, orderedRecords);
      ownsParent =
        marker.nextSibling === null &&
        insertionParent.childNodes.length === orderedNodes.length + 1;
    }
    recordNodeCount = orderedNodes.length;

    records = nextRecords;
  });

  return registerDispose(() => {
    dispose();

    removeRecordNodes(records.values());

    records = new Map();
  });
}

function uniqueKeyedItems<T>(
  items: readonly T[],
  key: (item: T, index: number, items: readonly T[]) => unknown,
): KeyedItem<T>[] {
  const seenKeys = new Set<unknown>();
  const keyedItems: KeyedItem<T>[] = [];

  items.forEach((item, index) => {
    const itemKey = key(item, index, items);

    if (seenKeys.has(itemKey)) {
      return;
    }

    seenKeys.add(itemKey);
    keyedItems.push({ item, index, key: itemKey });
  });

  return keyedItems;
}

function tryAppendKeyedRecords<T>(
  parent: ParentNode,
  marker: ChildNode,
  records: Map<unknown, KeyedRecord>,
  currentKeyedItems: readonly KeyedItem<T>[],
  currentItems: readonly T[],
  renderItem: ListItemRenderer<T>,
  options: BindListOptions<T>,
  markRecordsForHydration: boolean,
): { appendedNodeCount: number; records: Map<unknown, KeyedRecord> } | undefined {
  if (currentKeyedItems.length <= records.size) {
    return undefined;
  }

  const previousKeys = records.keys();

  for (let index = 0; index < records.size; index += 1) {
    const previousKey = previousKeys.next();
    const itemKey = currentKeyedItems[index]?.key;

    if (previousKey.done || !Object.is(previousKey.value, itemKey)) {
      return undefined;
    }
  }

  for (let index = records.size; index < currentKeyedItems.length; index += 1) {
    const itemKey = currentKeyedItems[index]?.key;

    if (records.has(itemKey)) {
      return undefined;
    }
  }

  let appendedNodeCount = 0;
  for (let index = records.size; index < currentKeyedItems.length; index += 1) {
    const keyedItem = currentKeyedItems[index] as KeyedItem<T>;
    const itemKey = keyedItem.key;
    const record = createKeyedRecord(
      keyedItem.item,
      keyedItem.index,
      currentItems,
      renderItem,
      options,
      markRecordsForHydration,
    );

    records.set(itemKey, record);
    appendedNodeCount += record.nodes.length;

    for (const node of record.nodes) {
      parent.insertBefore(node, marker);
    }

  }

  return { appendedNodeCount, records };
}

function reconcileKeyedRecordOrder(
  parent: ParentNode,
  marker: ChildNode,
  orderedRecords: readonly KeyedRecord[],
): void {
  const previousOrder: number[] = [];
  for (let index = 0; index < orderedRecords.length; index += 1) {
    previousOrder.push(orderedRecords[index]?.prevIndex ?? -1);
  }
  const stableIndexes = new Set(longestIncreasingSubsequenceIndexes(previousOrder));
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
  currentKeyedItems: readonly KeyedItem<T>[],
): void {
  for (const keyedItem of currentKeyedItems) {
    records.get(keyedItem.key)?.update(keyedItem.item);
  }
}

function createKeyedRecord<T>(
  item: T,
  index: number,
  items: readonly T[],
  renderItem: ListItemRenderer<T>,
  options: BindListOptions<T>,
  markRecordsForHydration: boolean,
): KeyedRecord {
  const itemRef = createReactiveItemRef(item, options);
  const scoped = untrack(() =>
    createScopedRenderNodes(() => renderItem(itemRef.value, index, items)),
  );
  const nodes = markRecordsForHydration ? markDynamicNodes(scoped.nodes) : scoped.nodes;

  return {
    nodes,
    dispose: scoped.dispose,
    update: itemRef.update,
  };
}

function createReactiveItemRef<T>(
  item: T,
  options: BindListOptions<T>,
): { value: T; update(item: T): void } {
  if (!isObjectLike(item)) {
    return {
      value: item,
      update() {
        // Primitive item values are passed by value and cannot be proxied.
      },
    };
  }

  const current = cell<unknown>(item);

  return {
    value: options.nestedObjectFallback === true
      ? createNestedFallbackItemProxy(current) as T
      : createItemProxy(current) as T,
    update(next) {
      current.set(next);
    },
  };
}

function createItemProxy<T extends object>(current: Cell<unknown>): T {
  return new Proxy({} as T, {
    get(_target, property) {
      const value = current.get();
      return isObjectLike(value) ? Reflect.get(value, property, value) : undefined;
    },
    getOwnPropertyDescriptor(_target, property) {
      const value = current.get();
      return isObjectLike(value) ? Reflect.getOwnPropertyDescriptor(value, property) : undefined;
    },
    has(_target, property) {
      const value = current.get();
      return isObjectLike(value) && Reflect.has(value, property);
    },
    ownKeys() {
      const value = current.get();
      return isObjectLike(value) ? Reflect.ownKeys(value) : [];
    },
    set(_target, property, nextValue) {
      const value = current.get();
      if (!isObjectLike(value)) {
        return false;
      }
      return Reflect.set(value, property, nextValue, value);
    },
  });
}

function createNestedFallbackItemProxy<T extends object>(current: Cell<unknown>): T {
  let childProxies: Map<PropertyKey, object> | undefined;
  let rawObjectProperties: Set<PropertyKey> | undefined;

  return new Proxy({} as T, {
    get(_target, property) {
      const value = current.get();
      if (!isObjectLike(value)) {
        return undefined;
      }

      const next = Reflect.get(value, property, value);

      if (next === null || typeof next !== "object") {
        const existingChildProxy =
          next == null && childProxies !== undefined
            ? childProxies.get(property)
            : undefined;

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
      const value = current.get();
      return isObjectLike(value) ? Reflect.getOwnPropertyDescriptor(value, property) : undefined;
    },
    has(_target, property) {
      const value = current.get();
      return isObjectLike(value) && Reflect.has(value, property);
    },
    ownKeys() {
      const value = current.get();
      return isObjectLike(value) ? Reflect.ownKeys(value) : [];
    },
    set(_target, property, nextValue) {
      const value = current.get();
      if (!isObjectLike(value)) {
        return false;
      }
      return Reflect.set(value, property, nextValue, value);
    },
  });
}

function createNestedItemProxy(current: Cell<unknown>, path: readonly PropertyKey[]): object {
  let childProxies: Map<PropertyKey, object> | undefined;
  let rawObjectProperties: Set<PropertyKey> | undefined;

  return new Proxy({} as object, {
    get(_target, property) {
      const value = valueAtPath(current.get(), path);

      if (!isObjectLike(value)) {
        return undefined;
      }

      const next = Reflect.get(value, property, value);

      if (next === null || typeof next !== "object") {
        const existingChildProxy =
          next == null && childProxies !== undefined
            ? childProxies.get(property)
            : undefined;

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
      const value = valueAtPath(current.get(), path);
      return isObjectLike(value) ? Reflect.getOwnPropertyDescriptor(value, property) : undefined;
    },
    has(_target, property) {
      const value = valueAtPath(current.get(), path);
      return isObjectLike(value) && Reflect.has(value, property);
    },
    ownKeys() {
      const value = valueAtPath(current.get(), path);
      return isObjectLike(value) ? Reflect.ownKeys(value) : [];
    },
    set(_target, property, nextValue) {
      const value = valueAtPath(current.get(), path);
      if (!isObjectLike(value)) {
        return false;
      }
      return Reflect.set(value, property, nextValue, value);
    },
  });
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

function tryRemoveKeyedRecords<T>(
  records: Map<unknown, KeyedRecord>,
  currentKeyedItems: readonly KeyedItem<T>[],
): { nextRecords: Map<unknown, KeyedRecord>; staleRecords: KeyedRecord[] } | undefined {
  if (currentKeyedItems.length >= records.size || currentKeyedItems.length === 0) {
    return undefined;
  }

  const nextRecords = new Map<unknown, KeyedRecord>();
  const staleRecords: KeyedRecord[] = [];
  let previousIndex = 0;

  for (const [previousKey, record] of records) {
    if (previousIndex < currentKeyedItems.length) {
      const itemKey = currentKeyedItems[previousIndex]?.key;

      if (Object.is(previousKey, itemKey)) {
        if (nextRecords.has(previousKey)) {
          return undefined;
        }

        nextRecords.set(previousKey, record);
        previousIndex += 1;
        continue;
      }
    }

    staleRecords.push(record);
  }

  return previousIndex === currentKeyedItems.length
    ? { nextRecords, staleRecords }
    : undefined;
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
): void {
  for (const [itemKey, record] of records) {
    if (!nextRecords.has(itemKey)) {
      record.dispose();
    }
  }
}

function removeRecordNodes(records: Iterable<KeyedRecord>): void {
  for (const record of records) {
    record.dispose();

    for (const node of record.nodes) {
      node.parentNode?.removeChild(node);
    }
  }
}

function disposeRecords(records: Iterable<KeyedRecord>): void {
  for (const record of records) {
    record.dispose();
  }
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
  return (
    left.length === right.length &&
    left.every((node, index) => node === right[index])
  );
}
