import { cell, effect, type Cell } from "@reckona/mreact-reactive-core";
import { normalizeRenderValue } from "./normalize.js";
import { registerDispose } from "./scope.js";
import type { Dispose, RenderValue } from "./types.js";

export interface BindListOptions<T> {
  key?: (item: T, index: number) => unknown;
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

  return bindKeyedList(parent, marker, items, renderItem, options.key);
}

function bindUnkeyedList<T>(
  parent: ParentNode,
  marker: ChildNode,
  items: () => readonly T[],
  renderItem: (item: T, index: number) => RenderValue,
): Dispose {
  let current: Node[] = [];

  const clear = () => {
    for (const node of current) {
      node.parentNode?.removeChild(node);
    }

    current = [];
  };

  const dispose = effect(() => {
    const currentItems = items();
    const next: Node[] = [];

    for (let index = 0; index < currentItems.length; index += 1) {
      const renderedNodes = normalizeRenderValue(
        renderItem(currentItems[index] as T, index),
      );

      for (const node of renderedNodes) {
        next.push(node);
      }
    }

    if (isSameNodeList(current, next)) {
      return;
    }

    clear();
    current = next;

    if (marker.parentNode !== parent) {
      current = [];
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
  update(item: unknown): void;
}

function bindKeyedList<T>(
  parent: ParentNode,
  marker: ChildNode,
  items: () => readonly T[],
  renderItem: (item: T, index: number) => RenderValue,
  key: (item: T, index: number) => unknown,
): Dispose {
  let records = new Map<unknown, KeyedRecord>();

  const dispose = effect(() => {
    const currentItems = items();

    if (marker.parentNode !== parent) {
      removeRecordNodes(Array.from(records.values()));
      records = new Map();
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

    const ownsParent =
      records.size > 0 && ownsWholeParent(parent, marker, records);

    if (ownsParent) {
      if (currentItems.length === 0) {
        parent.replaceChildren(marker);
        records = new Map();
        return;
      }

      const appendedRecords = tryAppendKeyedRecords(
        parent,
        marker,
        records,
        currentItems,
        renderItem,
        key,
      );

      if (appendedRecords !== undefined) {
        records = appendedRecords;
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
        return;
      }
    }

    const nextRecords = new Map<unknown, KeyedRecord>();
    const orderedNodes: Node[] = [];
    let reusedAllRecords = true;

    currentItems.forEach((item, index) => {
      const itemKey = key(item, index);
      const existingRecord = records.get(itemKey);

      if (existingRecord === undefined) {
        reusedAllRecords = false;
      }

      const record =
        existingRecord ??
        ({
          ...createKeyedRecord(item, index, renderItem),
        } satisfies KeyedRecord);

      record.update(item);

      nextRecords.set(itemKey, record);

      for (const node of record.nodes) {
        orderedNodes.push(node);
      }
    });

    if (ownsParent) {
      parent.replaceChildren(...orderedNodes, marker);
    } else {
      for (const node of orderedNodes) {
        parent.insertBefore(node, marker);
      }
    }

    if (!ownsParent && (!reusedAllRecords || nextRecords.size !== records.size)) {
      removeStaleRecords(records, nextRecords);
    }

    records = nextRecords;
  });

  return registerDispose(() => {
    dispose();

    for (const record of records.values()) {
      for (const node of record.nodes) {
        node.parentNode?.removeChild(node);
      }
    }

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
): Map<unknown, KeyedRecord> | undefined {
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

  const nextRecords = new Map(records);
  const appendedItems: Array<{ index: number; item: T; itemKey: unknown }> = [];

  for (let index = records.size; index < currentItems.length; index += 1) {
    const item = currentItems[index] as T;
    const itemKey = key(item, index);

    if (nextRecords.has(itemKey)) {
      return undefined;
    }

    appendedItems.push({ index, item, itemKey });
  }

  for (const appended of appendedItems) {
    const record = {
      ...createKeyedRecord(appended.item, appended.index, renderItem),
    } satisfies KeyedRecord;

    nextRecords.set(appended.itemKey, record);

    for (const node of record.nodes) {
      parent.insertBefore(node, marker);
    }
  }

  return nextRecords;
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
): KeyedRecord {
  const itemRef = createReactiveItemRef(item);

  return {
    nodes: normalizeRenderValue(renderItem(itemRef.value, index)),
    update: itemRef.update,
  };
}

function createReactiveItemRef<T>(item: T): { value: T; update(item: T): void } {
  if (!isObjectLike(item)) {
    return {
      value: item,
      update() {
        // Primitive item values are passed by value and cannot be proxied.
      },
    };
  }

  const current = cell<object>(item);

  return {
    value: createItemProxy(current) as T,
    update(next) {
      if (isObjectLike(next)) {
        current.set(next);
      }
    },
  };
}

function createItemProxy<T extends object>(current: Cell<T>): T {
  return new Proxy({} as T, {
    get(_target, property) {
      const value = current.get();
      return Reflect.get(value, property, value);
    },
    getOwnPropertyDescriptor(_target, property) {
      return Reflect.getOwnPropertyDescriptor(current.get(), property);
    },
    has(_target, property) {
      return Reflect.has(current.get(), property);
    },
    ownKeys() {
      return Reflect.ownKeys(current.get());
    },
    set(_target, property, nextValue) {
      const value = current.get();
      return Reflect.set(value, property, nextValue, value);
    },
  });
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
    for (const node of record.nodes) {
      node.parentNode?.removeChild(node);
    }
  }
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
