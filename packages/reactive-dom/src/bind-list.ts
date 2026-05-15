import { effect } from "@reckona/mreact-reactive-core";
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
        return;
      }
    }

    if (records.size > 0 && ownsWholeParent(parent, marker, records)) {
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
    const canReplaceWholeParent = ownsWholeParent(parent, marker, records);
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
          nodes: normalizeRenderValue(renderItem(item, index)),
        } satisfies KeyedRecord);

      nextRecords.set(itemKey, record);

      for (const node of record.nodes) {
        orderedNodes.push(node);
      }
    });

    if (canReplaceWholeParent) {
      parent.replaceChildren(...orderedNodes, marker);
    } else {
      for (const node of orderedNodes) {
        parent.insertBefore(node, marker);
      }
    }

    if (!canReplaceWholeParent || !reusedAllRecords || nextRecords.size !== records.size) {
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
      nodes: normalizeRenderValue(renderItem(appended.item, appended.index)),
    } satisfies KeyedRecord;

    nextRecords.set(appended.itemKey, record);

    for (const node of record.nodes) {
      parent.insertBefore(node, marker);
    }
  }

  return nextRecords;
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
