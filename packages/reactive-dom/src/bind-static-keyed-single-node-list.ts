import { effect, untrack, type ReadonlyCell } from "@reckona/mreact-reactive-core";
import { subscribeCell } from "@reckona/mreact-reactive-core/internal";
import {
  withBatchedDelegatedRootReleases,
  withDeferredDelegatedEventPromotions,
} from "./bind-event.js";
import { createScopedRenderNodeScope } from "./render-scope.js";
import { registerDispose } from "./scope.js";
import { disposeScope, type DomScope } from "./scope.js";
import type { Dispose } from "./types.js";

export interface BindStaticKeyedSingleNodeListOptions<T, TNode extends ChildNode = ChildNode> {
  key: (item: T, index: number, items: readonly T[]) => unknown;
  selectedClass?: BindStaticKeyedSingleNodeListSelectedClassOptions<T, TNode>;
}

export interface BindStaticKeyedSingleNodeListSelectedClassOptions<
  T,
  TNode extends ChildNode,
> {
  className: string;
  preserveInitial?: boolean;
  source: ReadonlyCell<unknown>;
  target?: (
    node: TNode,
    item: T,
    index: number,
    items: readonly T[],
  ) => Element | null;
}

type ListParentNode = ParentNode & Node & { replaceChildren(...nodes: Node[]): void };
type SingleNodeRenderer<T, TNode extends ChildNode> = (
  item: T,
  index: number,
  items: readonly T[],
) => TNode;

interface SingleNodeRecord {
  currentIndex: number;
  currentItem: unknown;
  currentItems: readonly unknown[];
  key: unknown;
  node: ChildNode;
  selectedClassElement?: Element | undefined;
  scope?: DomScope | undefined;
}

interface SingleNodeKeyedItems<T> {
  indexes: readonly number[] | null;
  items: readonly T[];
  keys: readonly unknown[];
}

/** Binds a static keyed list where each item renders exactly one DOM node. */
export function bindStaticKeyedSingleNodeList<T, TNode extends ChildNode>(
  parent: ParentNode,
  marker: ChildNode,
  items: () => readonly T[],
  renderItem: SingleNodeRenderer<T, TNode>,
  options: BindStaticKeyedSingleNodeListOptions<T, TNode>,
): Dispose {
  let records = new Map<unknown, SingleNodeRecord>();
  let ownsParent = false;
  const renderArity = renderItem.length;
  const selectedClass = options.selectedClass as
    | BindStaticKeyedSingleNodeListSelectedClassOptions<T, TNode>
    | undefined;
  const selectedClassState: SelectedClassState | undefined =
    selectedClass === undefined ? undefined : createSelectedClassState(selectedClass);

  const dispose = effect(() => {
    const currentItems = items();
    const insertionParent = marker.parentNode as ListParentNode | null;

    if (insertionParent === null) {
      unregisterSelectedClassRecords(selectedClassState, records.values());
      removeRecordNodes(records.values());
      records = new Map();
      ownsParent = false;
      return;
    }

    const keyedItems = uniqueSingleNodeKeyedItems(currentItems, options.key);
    const keys = keyedItems.keys;

    if (keys.length === 0) {
      unregisterSelectedClassRecords(selectedClassState, records.values());
      disposeRecords(records.values());
      insertionParent.replaceChildren(marker);
      records = new Map();
      ownsParent = true;
      return;
    }

    if (records.size === keys.length && records.size > 0) {
      const sameOrderRecords = updateSameOrderRecords(
        records,
        keyedItems,
        currentItems,
        renderArity,
        selectedClassState,
      );

      if (sameOrderRecords) {
        return;
      }
    }

    const ownsCurrentParent =
      ownsParent &&
      insertionParent.childNodes.length === records.size + 1 &&
      marker.nextSibling === null;

    const swappedRecords = ownsCurrentParent
      ? trySwapSingleNodeRecords(
          insertionParent,
          marker,
          records,
          keyedItems,
          currentItems,
          renderArity,
          selectedClassState,
        )
      : undefined;

    if (swappedRecords !== undefined) {
      records = swappedRecords;
      ownsParent = true;
      return;
    }

    const canBulkReplace =
      records.size === 0 ||
      (ownsCurrentParent && keys.length === records.size && areKeysDisjoint(records, keys));

    if (canBulkReplace) {
      const nextRecords = createSingleNodeRecords(
        insertionParent,
        keyedItems,
        currentItems,
        renderItem,
        selectedClassState,
      );
      const fragment = document.createDocumentFragment();

      for (const record of nextRecords.values()) {
        fragment.appendChild(record.node);
      }

      const disposeError = disposeRecordValues(records.values());
      insertionParent.replaceChildren(fragment, marker);
      promoteRecordEvents(nextRecords.values());
      records = nextRecords;
      ownsParent = true;

      if (disposeError !== undefined) {
        throw disposeError;
      }
      return;
    }

    const nextRecords = new Map<unknown, SingleNodeRecord>();
    const orderedRecords: SingleNodeRecord[] = [];
    const keyedItemValues = keyedItems.items;
    const keyedIndexes = keyedItems.indexes;

    for (let slot = 0; slot < keys.length; slot += 1) {
      const itemKey = keys[slot];
      const item = keyedItemValues[slot] as T;
      const sourceIndex = keyedIndexes === null ? slot : (keyedIndexes[slot] as number);
      let record = records.get(itemKey);

      if (
          record === undefined ||
          !updateSingleNodeRecord(record, renderArity, item, sourceIndex, currentItems)
      ) {
        unregisterSelectedClassRecord(selectedClassState, record);
        disposeSingleNodeRecord(record);
        record?.node.parentNode?.removeChild(record.node);
        record = createSingleNodeRecord(
          insertionParent,
          itemKey,
          item,
          sourceIndex,
          currentItems,
          renderItem,
          selectedClassState,
        );
      }

      nextRecords.set(itemKey, record);
      orderedRecords.push(record);
    }

    removeStaleSingleNodeRecords(records, nextRecords, selectedClassState);
    reconcileSingleNodeRecordOrder(insertionParent, marker, orderedRecords);
    promoteRecordEvents(nextRecords.values());
    records = nextRecords;
    ownsParent =
      insertionParent.childNodes.length === records.size + 1 && marker.nextSibling === null;
  });

  return registerDispose(() => {
    dispose();
    selectedClassState?.dispose();
    unregisterSelectedClassRecords(selectedClassState, records.values());
    removeRecordNodes(records.values());
    records = new Map();
  });
}

function uniqueSingleNodeKeyedItems<T>(
  items: readonly T[],
  key: (item: T, index: number, items: readonly T[]) => unknown,
): SingleNodeKeyedItems<T> {
  const length = items.length;
  const keys = new Array<unknown>(length);
  const seenKeys = new Set<unknown>();

  for (let index = 0; index < length; index += 1) {
    const itemKey = key(items[index] as T, index, items);

    if (seenKeys.has(itemKey)) {
      return dedupedSingleNodeKeyedItems(items, key, keys, seenKeys, index);
    }

    seenKeys.add(itemKey);
    keys[index] = itemKey;
  }

  return { indexes: null, items, keys };
}

function dedupedSingleNodeKeyedItems<T>(
  items: readonly T[],
  key: (item: T, index: number, items: readonly T[]) => unknown,
  prefixKeys: readonly unknown[],
  seenKeys: Set<unknown>,
  duplicateIndex: number,
): SingleNodeKeyedItems<T> {
  const keys: unknown[] = prefixKeys.slice(0, duplicateIndex);
  const dedupedItems: T[] = items.slice(0, duplicateIndex);
  const indexes: number[] = [];

  for (let index = 0; index < duplicateIndex; index += 1) {
    indexes.push(index);
  }

  for (let index = duplicateIndex + 1; index < items.length; index += 1) {
    const itemKey = key(items[index] as T, index, items);

    if (seenKeys.has(itemKey)) {
      continue;
    }

    seenKeys.add(itemKey);
    keys.push(itemKey);
    dedupedItems.push(items[index] as T);
    indexes.push(index);
  }

  return { indexes, items: dedupedItems, keys };
}

function createSingleNodeRecords<T, TNode extends ChildNode>(
  parent: ParentNode,
  keyedItems: SingleNodeKeyedItems<T>,
  currentItems: readonly T[],
  renderItem: SingleNodeRenderer<T, TNode>,
  selectedClassState: SelectedClassState | undefined,
): Map<unknown, SingleNodeRecord> {
  const records = new Map<unknown, SingleNodeRecord>();
  const keys = keyedItems.keys;
  const items = keyedItems.items;
  const indexes = keyedItems.indexes;

  for (let slot = 0; slot < keys.length; slot += 1) {
    records.set(
      keys[slot],
      createSingleNodeRecord(
        parent,
        keys[slot],
        items[slot] as T,
        indexes === null ? slot : (indexes[slot] as number),
        currentItems,
        renderItem,
        selectedClassState,
      ),
    );
  }

  return records;
}

function createSingleNodeRecord<T, TNode extends ChildNode>(
  parent: ParentNode,
  key: unknown,
  item: T,
  index: number,
  items: readonly T[],
  renderItem: SingleNodeRenderer<T, TNode>,
  selectedClassState: SelectedClassState | undefined,
): SingleNodeRecord {
  const deferred =
    parent.isConnected === true
      ? untrack(() =>
          withDeferredDelegatedEventPromotions(() =>
            createScopedRenderNodeScope(() => renderItem(item, index, items)),
          ),
        )
      : undefined;
  const scoped =
    deferred?.value ??
    untrack(() => createScopedRenderNodeScope(() => renderItem(item, index, items)));

  const record: SingleNodeRecord & { promoteEvents?: () => void } = {
    currentIndex: index,
    currentItem: item,
    currentItems: items,
    key,
    node: scoped.node,
    ...(scoped.scope === undefined ? {} : { scope: scoped.scope }),
    ...(deferred?.promote === undefined ? {} : { promoteEvents: deferred.promote }),
  };

  registerSelectedClassRecord(selectedClassState, record, item, index, items);
  return record;
}

function updateSameOrderRecords<T>(
  records: Map<unknown, SingleNodeRecord>,
  keyedItems: SingleNodeKeyedItems<T>,
  currentItems: readonly T[],
  renderArity: number,
  selectedClassState: SelectedClassState | undefined,
): boolean {
  const keys = keyedItems.keys;
  const items = keyedItems.items;
  const indexes = keyedItems.indexes;
  const previousKeys = records.keys();

  for (let slot = 0; slot < keys.length; slot += 1) {
    const previousKey = previousKeys.next();

    if (previousKey.done || !Object.is(previousKey.value, keys[slot])) {
      return false;
    }

    const record = records.get(keys[slot]);

    if (
      record === undefined ||
      !updateSingleNodeRecord(
        record,
        renderArity,
        items[slot],
        indexes === null ? slot : (indexes[slot] as number),
        currentItems,
      )
    ) {
      return false;
    }

    refreshSelectedClassRecord(selectedClassState, record);
  }

  return true;
}

function updateSingleNodeRecord(
  record: SingleNodeRecord,
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

  record.currentIndex = nextIndex;
  record.currentItems = nextItems;
  return true;
}

function isObjectLike(value: unknown): value is object {
  return typeof value === "object" && value !== null;
}

function areKeysDisjoint(
  records: Map<unknown, SingleNodeRecord>,
  keys: readonly unknown[],
): boolean {
  for (const key of keys) {
    if (records.has(key)) {
      return false;
    }
  }

  return true;
}

function trySwapSingleNodeRecords<T>(
  parent: ParentNode,
  marker: ChildNode,
  records: Map<unknown, SingleNodeRecord>,
  keyedItems: SingleNodeKeyedItems<T>,
  currentItems: readonly T[],
  renderArity: number,
  selectedClassState: SelectedClassState | undefined,
): Map<unknown, SingleNodeRecord> | undefined {
  const keys = keyedItems.keys;

  if (keyedItems.indexes !== null || keys.length !== records.size || keys.length < 2) {
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

    if (Object.is(previousKey.value, keys[slot])) {
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

  const nextRecords = new Map<unknown, SingleNodeRecord>();
  const items = keyedItems.items;

  for (let slot = 0; slot < keys.length; slot += 1) {
    const record = records.get(keys[slot]);

    if (
      record === undefined ||
      !updateSingleNodeRecord(record, renderArity, items[slot], slot, currentItems)
    ) {
      return undefined;
    }

    refreshSelectedClassRecord(selectedClassState, record);
    nextRecords.set(keys[slot], record);
  }

  const firstRecord = nextRecords.get(keys[firstIndex]);
  const secondRecord = nextRecords.get(keys[secondIndex]);

  if (firstRecord === undefined || secondRecord === undefined) {
    return undefined;
  }

  const firstAnchor = secondRecord.node;
  const secondAnchor = nextRecords.get(keys[secondIndex + 1])?.node ?? marker;

  parent.insertBefore(firstRecord.node, firstAnchor);
  parent.insertBefore(secondRecord.node, secondAnchor);

  return nextRecords;
}

function reconcileSingleNodeRecordOrder(
  parent: ParentNode,
  marker: ChildNode,
  orderedRecords: readonly SingleNodeRecord[],
): void {
  let anchor: ChildNode = marker;

  for (let index = orderedRecords.length - 1; index >= 0; index -= 1) {
    const record = orderedRecords[index] as SingleNodeRecord | undefined;

    if (record === undefined) {
      continue;
    }

    if (record.node.nextSibling === anchor) {
      anchor = record.node;
      continue;
    }

    parent.insertBefore(record.node, anchor);
    anchor = record.node;
  }
}

function removeStaleSingleNodeRecords(
  records: Map<unknown, SingleNodeRecord>,
  nextRecords: Map<unknown, SingleNodeRecord>,
  selectedClassState: SelectedClassState | undefined,
): void {
  const staleRecords: SingleNodeRecord[] = [];

  for (const [key, record] of records) {
    if (!nextRecords.has(key)) {
      unregisterSelectedClassRecord(selectedClassState, record);
      staleRecords.push(record);
    }
  }

  removeRecordNodes(staleRecords);
}

function removeRecordNodes(records: Iterable<SingleNodeRecord>): void {
  let firstError: unknown;

  withBatchedDelegatedRootReleases(() => {
    for (const record of records) {
      try {
        disposeSingleNodeRecord(record);
      } catch (error) {
        firstError ??= error;
      }

      record.node.parentNode?.removeChild(record.node);
    }
  });

  if (firstError !== undefined) {
    throw firstError;
  }
}

function disposeRecordValues(records: Iterable<SingleNodeRecord>): unknown {
  let firstError: unknown;

  withBatchedDelegatedRootReleases(() => {
    for (const record of records) {
      try {
        disposeSingleNodeRecord(record);
      } catch (error) {
        firstError ??= error;
      }
    }
  });

  return firstError;
}

function disposeRecords(records: Iterable<SingleNodeRecord>): void {
  withBatchedDelegatedRootReleases(() => {
    for (const record of records) {
      disposeSingleNodeRecord(record);
    }
  });
}

function disposeSingleNodeRecord(record: SingleNodeRecord | undefined): void {
  if (record?.scope !== undefined) {
    disposeScope(record.scope);
    record.scope = undefined;
  }
}

function promoteRecordEvents(records: Iterable<SingleNodeRecord>): void {
  for (const record of records as Iterable<SingleNodeRecord & { promoteEvents?: () => void }>) {
    record.promoteEvents?.();
    delete record.promoteEvents;
  }
}

interface SelectedClassState {
  className: string;
  current: unknown;
  dispose: Dispose;
  preserveInitial: boolean;
  records: Map<unknown, Element>;
  target?: (
    node: ChildNode,
    item: unknown,
    index: number,
    items: readonly unknown[],
  ) => Element | null;
}

function createSelectedClassState<T, TNode extends ChildNode>(
  options: BindStaticKeyedSingleNodeListSelectedClassOptions<T, TNode>,
): SelectedClassState {
  const state: SelectedClassState = {
    className: options.className,
    current: untrack(() => options.source.get()),
    dispose: () => {},
    preserveInitial: options.preserveInitial === true,
    records: new Map(),
    ...(options.target === undefined
      ? {}
      : {
          target: options.target as (
            node: ChildNode,
            item: unknown,
            index: number,
            items: readonly unknown[],
          ) => Element | null,
        }),
  };

  state.dispose =
    subscribeCell(options.source, (next) => {
      updateSelectedClassValue(state, next);
    }) ?? (() => {});

  return state;
}

function updateSelectedClassValue(
  state: SelectedClassState,
  next: unknown,
): void {
  if (Object.is(state.current, next)) {
    return;
  }

  state.records.get(state.current)?.classList.remove(state.className);
  state.current = next;
  state.records.get(next)?.classList.add(state.className);
}

function registerSelectedClassRecord<T, TNode extends ChildNode>(
  state: SelectedClassState | undefined,
  record: SingleNodeRecord,
  item: T,
  index: number,
  items: readonly T[],
): void {
  if (state === undefined) {
    return;
  }

  const element =
    state.target?.(record.node as TNode, item, index, items) ??
    (record.node instanceof Element ? record.node : null);

  if (element === null) {
    return;
  }

  record.selectedClassElement = element;
  state.records.set(record.key, element);

  if (state.preserveInitial) {
    return;
  }

  if (Object.is(state.current, record.key)) {
    element.classList.add(state.className);
  } else {
    element.classList.remove(state.className);
  }
}

function refreshSelectedClassRecord(
  state: SelectedClassState | undefined,
  record: SingleNodeRecord,
): void {
  if (state === undefined || record.selectedClassElement === undefined) {
    return;
  }

  if (state.preserveInitial) {
    return;
  }

  if (Object.is(state.current, record.key)) {
    record.selectedClassElement.classList.add(state.className);
  } else {
    record.selectedClassElement.classList.remove(state.className);
  }
}

function unregisterSelectedClassRecord(
  state: SelectedClassState | undefined,
  record: SingleNodeRecord | undefined,
): void {
  if (state === undefined || record?.selectedClassElement === undefined) {
    return;
  }

  if (state.records.get(record.key) === record.selectedClassElement) {
    state.records.delete(record.key);
  }
}

function unregisterSelectedClassRecords(
  state: SelectedClassState | undefined,
  records: Iterable<SingleNodeRecord>,
): void {
  if (state === undefined) {
    return;
  }

  for (const record of records) {
    unregisterSelectedClassRecord(state, record);
  }
}
