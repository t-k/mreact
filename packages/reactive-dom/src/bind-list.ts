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
      for (const [itemKey, record] of records) {
        if (nextRecords.has(itemKey)) {
          continue;
        }

        for (const node of record.nodes) {
          node.parentNode?.removeChild(node);
        }
      }
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
