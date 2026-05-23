import { cell, effect, untrack, type Cell } from "@reckona/mreact-reactive-core";
import { createScopedRenderNodes } from "./render-scope.js";
import { registerDispose } from "./scope.js";
import type { Dispose, RenderValue } from "./types.js";

export interface BindListOptions<T> {
  key?: (item: T, index: number) => unknown;
  nestedObjectFallback?: boolean;
}

export function bindList<T>(
  parent: ParentNode,
  marker: ChildNode,
  items: () => readonly T[],
  renderItem: (item: T, index: number) => RenderValue,
  options: BindListOptions<T> = {},
): Dispose {
  if (options.key === undefined) {
    return bindUnkeyedList(parent, marker, items, renderItem);
  }

  return bindKeyedList(parent, marker, items, renderItem, options.key, options);
}

function bindUnkeyedList<T>(
  parent: ParentNode,
  marker: ChildNode,
  items: () => readonly T[],
  renderItem: (item: T, index: number) => RenderValue,
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
      currentItems.map((item, index) => renderItem(item as T, index)),
    );

    if (isSameNodeList(current, next.nodes)) {
      next.dispose();
      return;
    }

    clear();
    current = next.nodes;
    disposeCurrentScope = next.dispose;

    if (marker.parentNode !== parent) {
      current = [];
      disposeCurrentScope?.();
      disposeCurrentScope = undefined;
      return;
    }

    for (const node of current) {
      parent.insertBefore(node, marker);
    }
  });

  return registerDispose(() => {
    dispose();
    clear();
  });
}

interface KeyedRecord {
  nodes: Node[];
  dispose: Dispose;
  update(item: unknown): void;
}

function bindKeyedList<T>(
  parent: ParentNode,
  marker: ChildNode,
  items: () => readonly T[],
  renderItem: (item: T, index: number) => RenderValue,
  key: (item: T, index: number) => unknown,
  options: BindListOptions<T>,
): Dispose {
  let records = new Map<unknown, KeyedRecord>();
  let ownsParent = false;
  let recordNodeCount = 0;

  const dispose = effect(() => {
    const currentItems = items();

    if (marker.parentNode !== parent) {
      removeRecordNodes(Array.from(records.values()));
      records = new Map();
      ownsParent = false;
      recordNodeCount = 0;
      return;
    }

    if (records.size === currentItems.length && records.size > 0) {
      let sameKeyOrder = true;
      const previousKeys = records.keys();

      for (let index = 0; index < currentItems.length; index += 1) {
        const previousKey = previousKeys.next();
        const itemKey = key(currentItems[index] as T, index);

        if (previousKey.done || !Object.is(previousKey.value, itemKey)) {
          sameKeyOrder = false;
          break;
        }
      }

      if (sameKeyOrder) {
        updateRecords(records, currentItems, key);
        return;
      }
    }

    const ownsCurrentParent =
      ownsParent &&
      marker.nextSibling === null &&
      parent.childNodes.length === recordNodeCount + 1
        ? true
        : records.size > 0 && ownsWholeParent(parent, marker, records);
    ownsParent = ownsCurrentParent;

    if (ownsCurrentParent) {
      if (currentItems.length === 0) {
        removeRecordNodes(Array.from(records.values()));
        parent.replaceChildren(marker);
        records = new Map();
        ownsParent = true;
        recordNodeCount = 0;
        return;
      }

      const appendedRecords = tryAppendKeyedRecords(
        parent,
        marker,
        records,
        currentItems,
        renderItem,
        key,
        options,
      );

      if (appendedRecords !== undefined) {
        records = appendedRecords.records;
        recordNodeCount += appendedRecords.appendedNodeCount;
        ownsParent = true;
        return;
      }

      const removedRecords = tryRemoveKeyedRecords(
        records,
        currentItems,
        key,
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
    const previousPositions = new Map<KeyedRecord, number>();
    let reusedAllRecords = true;
    let previousIndex = 0;

    for (const record of records.values()) {
      previousPositions.set(record, previousIndex);
      previousIndex += 1;
    }

    currentItems.forEach((item, index) => {
      const itemKey = key(item, index);
      const existingRecord = records.get(itemKey);

      if (existingRecord === undefined) {
        reusedAllRecords = false;
      }

      const record =
        existingRecord ??
        ({
          ...createKeyedRecord(item, index, renderItem, options),
        } satisfies KeyedRecord);

      record.update(item);

      nextRecords.set(itemKey, record);
      orderedRecords.push(record);

      for (const node of record.nodes) {
        orderedNodes.push(node);
      }
    });

    if (ownsCurrentParent) {
      removeStaleRecords(records, nextRecords);
      parent.replaceChildren(...orderedNodes, marker);
      ownsParent = true;
    } else {
      if (!reusedAllRecords || nextRecords.size !== records.size) {
        removeStaleRecords(records, nextRecords);
      }

      reconcileKeyedRecordOrder(parent, marker, orderedRecords, previousPositions);
      ownsParent =
        marker.nextSibling === null &&
        parent.childNodes.length === orderedNodes.length + 1;
    }
    recordNodeCount = orderedNodes.length;

    records = nextRecords;
  });

  return registerDispose(() => {
    dispose();

    removeRecordNodes(Array.from(records.values()));

    records = new Map();
  });
}

function tryAppendKeyedRecords<T>(
  parent: ParentNode,
  marker: ChildNode,
  records: Map<unknown, KeyedRecord>,
  currentItems: readonly T[],
  renderItem: (item: T, index: number) => RenderValue,
  key: (item: T, index: number) => unknown,
  options: BindListOptions<T>,
): { appendedNodeCount: number; records: Map<unknown, KeyedRecord> } | undefined {
  if (currentItems.length <= records.size) {
    return undefined;
  }

  const previousKeys = records.keys();

  for (let index = 0; index < records.size; index += 1) {
    const previousKey = previousKeys.next();
    const itemKey = key(currentItems[index] as T, index);

    if (previousKey.done || !Object.is(previousKey.value, itemKey)) {
      return undefined;
    }
  }

  const appendedKeys = new Set<unknown>();

  for (let index = records.size; index < currentItems.length; index += 1) {
    const itemKey = key(currentItems[index] as T, index);

    if (records.has(itemKey) || appendedKeys.has(itemKey)) {
      return undefined;
    }

    appendedKeys.add(itemKey);
  }

  let appendedNodeCount = 0;
  let index = records.size;

  for (const itemKey of appendedKeys) {
    const record = {
      ...createKeyedRecord(currentItems[index] as T, index, renderItem, options),
    } satisfies KeyedRecord;

    records.set(itemKey, record);
    appendedNodeCount += record.nodes.length;

    for (const node of record.nodes) {
      parent.insertBefore(node, marker);
    }

    index += 1;
  }

  return { appendedNodeCount, records };
}

function reconcileKeyedRecordOrder(
  parent: ParentNode,
  marker: ChildNode,
  orderedRecords: readonly KeyedRecord[],
  previousPositions: ReadonlyMap<KeyedRecord, number>,
): void {
  const previousOrder = orderedRecords.map((record) => previousPositions.get(record) ?? -1);
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
  currentItems: readonly T[],
  key: (item: T, index: number) => unknown,
): void {
  currentItems.forEach((item, index) => {
    records.get(key(item, index))?.update(item);
  });
}

function createKeyedRecord<T>(
  item: T,
  index: number,
  renderItem: (item: T, index: number) => RenderValue,
  options: BindListOptions<T>,
): KeyedRecord {
  const itemRef = createReactiveItemRef(item, options);
  const scoped = untrack(() =>
    createScopedRenderNodes(() => renderItem(itemRef.value, index)),
  );

  return {
    nodes: scoped.nodes,
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
  currentItems: readonly T[],
  key: (item: T, index: number) => unknown,
): { nextRecords: Map<unknown, KeyedRecord>; staleRecords: KeyedRecord[] } | undefined {
  if (currentItems.length >= records.size || currentItems.length === 0) {
    return undefined;
  }

  const nextRecords = new Map<unknown, KeyedRecord>();
  const staleRecords: KeyedRecord[] = [];
  let previousIndex = 0;

  for (const [previousKey, record] of records) {
    if (previousIndex < currentItems.length) {
      const itemKey = key(currentItems[previousIndex] as T, previousIndex);

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

  return previousIndex === currentItems.length
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

function removeRecordNodes(records: readonly KeyedRecord[]): void {
  for (const record of records) {
    record.dispose();

    for (const node of record.nodes) {
      node.parentNode?.removeChild(node);
    }
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
