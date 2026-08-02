import { effect, untrack, type ReadonlyCell } from "@reckona/mreact-reactive-core";
import {
  notifySubscribers,
  runtimeState,
  subscribeCell,
  subscribeRefreshable,
  subscribeRefreshableIfTracked,
  trackSource,
  type RefreshableSubscription,
  type Source,
} from "@reckona/mreact-reactive-core/internal";
import {
  withBatchedDelegatedRootReleases,
  withDeferredDelegatedEventPromotions,
} from "./bind-event.js";
import {
  setupCompilerKeyedEvents,
  type CompilerKeyedEventProgram,
} from "./compiler-keyed-events.js";
import { isDynamicHydrationEnabled, markDynamicNode } from "./dynamic-node.js";
import { createScopedRenderNodeScope } from "./render-scope.js";
import { normalizeText } from "./bind-text.js";
import { registerDispose, registerIdempotentDispose } from "./scope.js";
import type { DomScope } from "./scope.js";
import type { Dispose } from "./types.js";

export interface BindStaticKeyedSingleNodeListOptions<T, TNode extends ChildNode = ChildNode> {
  /** Set to false when the item renderer never binds delegated events on row nodes. */
  deferEventPromotion?: boolean;
  key: (item: T, index: number, items: readonly T[]) => unknown;
  selectedClass?: BindStaticKeyedSingleNodeListSelectedClassOptions<T, TNode>;
}

export interface BindStaticKeyedSingleNodeListSelectedClassOptions<T, TNode extends ChildNode> {
  className: string;
  preserveInitial?: boolean;
  source: ReadonlyCell<unknown>;
  target?: (node: TNode, item: T, index: number, items: readonly T[]) => Element | null;
}

export interface BindCompilerKeyedSingleNodeListOptions<
  T,
  TNode extends ChildNode = ChildNode,
> extends BindStaticKeyedSingleNodeListOptions<T, TNode> {
  compilerEvents?: readonly CompilerKeyedEventProgram<T>[];
  compilerOwnsTextCleanup?: true;
  compilerSelectedClass?: {
    className: string;
    initialClassValue?: "";
    source: ReadonlyCell<unknown>;
  };
}

interface InternalSelectedClassOptions<
  T,
  TNode extends ChildNode,
> extends BindStaticKeyedSingleNodeListSelectedClassOptions<T, TNode> {
  compilerMode?: "strict-replace";
  initialClassValue?: "";
}

interface InternalStaticKeyedSingleNodeListOptions<T, TNode extends ChildNode>
  extends BindStaticKeyedSingleNodeListOptions<T, TNode> {
  compilerEventOwner?: object;
  compilerEvents?: readonly CompilerKeyedEventProgram<T>[];
}

type ListParentNode = ParentNode & Node & { replaceChildren(...nodes: Node[]): void };
export type SingleNodeRenderer<T, TNode extends ChildNode> = (
  item: T,
  index: number,
  items: readonly T[],
) => TNode;

interface SingleNodeRecord {
  compilerContext?: InternalCompilerKeyedRowContext | undefined;
  currentIndex?: number | undefined;
  currentItem?: unknown;
  currentItems?: readonly unknown[] | undefined;
  key: unknown;
  node: ChildNode;
  selectedClassElement?: Element | undefined;
  scope?: DomScope | undefined;
}

/** Internal row state used by compiler-generated keyed single-node renderers. */
export interface CompilerKeyedRowContext<T> {
  readonly index: number;
  readonly item: T;
  readonly items: readonly T[];
}

/** Internal renderer contract used only by compiler-generated output. */
export type CompilerKeyedSingleNodeRenderer<T, TNode extends ChildNode> = (
  context: CompilerKeyedRowContext<T>,
) => TNode;

const compilerRowIndex = Symbol("compilerRowIndex");
const compilerRowItem = Symbol("compilerRowItem");
const compilerRowItems = Symbol("compilerRowItems");
const compilerRowReads = Symbol("compilerRowReads");
const compilerRowSource = Symbol("compilerRowSource");
const compilerRowTextSubscriptions = Symbol("compilerRowTextSubscriptions");
const compilerRowStaticPropertyTextNode = Symbol("compilerRowStaticPropertyTextNode");
const compilerRowStaticPropertyTextKey = Symbol("compilerRowStaticPropertyTextKey");
const compilerRowStaticPropertyTexts = Symbol("compilerRowStaticPropertyTexts");
const compilerRowOwnsTextCleanup = Symbol("compilerRowOwnsTextCleanup");
const compilerRowEventOwner = Symbol("compilerRowEventOwner");
const activeCompilerRowContext = Symbol("activeCompilerRowContext");
const compilerOwnsTextCleanupRenderer = Symbol("compilerOwnsTextCleanupRenderer");
const noopCompilerTextDispose: Dispose = () => {};
let activeCompilerTextContext: InternalCompilerKeyedRowContext | undefined;
type InternalCompilerKeyedRowContext = CompilerKeyedRowContext<unknown> & {
  [compilerRowIndex]: number;
  [compilerRowItem]: unknown;
  [compilerRowItems]: readonly unknown[];
  [compilerRowReads]: number;
  [compilerRowSource]?: Source | undefined;
  [compilerRowTextSubscriptions]?:
    | RefreshableSubscription
    | RefreshableSubscription[]
    | undefined;
  [compilerRowStaticPropertyTextNode]?: Text | undefined;
  [compilerRowStaticPropertyTextKey]?: PropertyKey | undefined;
  [compilerRowStaticPropertyTexts]?: Array<Text | PropertyKey> | undefined;
  [compilerRowOwnsTextCleanup]?: true | undefined;
  [compilerRowEventOwner]?: object | undefined;
};
type CompilerKeyedRowNode = Node & {
  [activeCompilerRowContext]?: InternalCompilerKeyedRowContext;
};
type InternalSingleNodeRenderer<T, TNode extends ChildNode> = SingleNodeRenderer<T, TNode> & {
  [compilerOwnsTextCleanupRenderer]?: true | undefined;
};
const compilerRowContextPrototype: CompilerKeyedRowContext<unknown> = {
  get index(): number {
    const context = this as InternalCompilerKeyedRowContext;
    context[compilerRowReads] |= 2;
    trackCompilerRowContext(context);
    return context[compilerRowIndex];
  },
  get item(): unknown {
    const context = this as InternalCompilerKeyedRowContext;
    context[compilerRowReads] |= 1;
    trackCompilerRowContext(context);
    return context[compilerRowItem];
  },
  get items(): readonly unknown[] {
    const context = this as InternalCompilerKeyedRowContext;
    context[compilerRowReads] |= 4;
    trackCompilerRowContext(context);
    return context[compilerRowItems];
  },
};
type RemovedSingleNodeRecords =
  | {
      records: Map<unknown, SingleNodeRecord>;
      staleRecord: SingleNodeRecord;
      staleRecords?: undefined;
    }
  | {
      records: Map<unknown, SingleNodeRecord>;
      staleRecord?: undefined;
      staleRecords: SingleNodeRecord[];
    };

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
  const deferEventPromotion = options.deferEventPromotion !== false;
  const renderArity = renderItem.length;
  const selectedClass = options.selectedClass as
    | BindStaticKeyedSingleNodeListSelectedClassOptions<T, TNode>
    | undefined;
  const selectedClassState: SelectedClassState | undefined =
    selectedClass === undefined
      ? undefined
      : createSelectedClassState(selectedClass, () => records.values());
  const internalOptions = options as InternalStaticKeyedSingleNodeListOptions<T, TNode>;
  const compilerEvents = internalOptions.compilerEvents;
  const compilerEventOwner = internalOptions.compilerEventOwner;

  const dispose = effect(() => {
    const currentItems = items();
    const insertionParent = marker.parentNode as ListParentNode | null;

    if (insertionParent === null) {
      clearSelectedClassRecords(selectedClassState);
      removeRecordNodes(records.values(), deferEventPromotion);
      records = new Map();
      ownsParent = false;
      return;
    }

    const ownsCurrentParent =
      ownsParent &&
      insertionParent.childNodes.length === records.size + 1 &&
      marker.nextSibling === null;

    if (currentItems.length === 0) {
      clearSelectedClassRecords(selectedClassState);
      if (ownsCurrentParent) {
        disposeRecords(records.values(), deferEventPromotion);
        insertionParent.replaceChildren(marker);
      } else {
        removeRecordNodes(records.values(), deferEventPromotion);
      }
      records = new Map();
      ownsParent = marker.nextSibling === null && insertionParent.childNodes.length === 1;
      return;
    }

    const fastReplacementRecords =
      (records.size === 0 &&
        insertionParent.childNodes.length === 1 &&
        marker.nextSibling === null) ||
      (ownsCurrentParent && records.size === currentItems.length && records.size > 0)
        ? tryReplaceDisjointSingleNodeItems(
            insertionParent,
            marker,
            records,
            currentItems,
            options.key,
            renderItem,
            renderArity,
            deferEventPromotion,
            selectedClassState,
          )
        : undefined;

    if (fastReplacementRecords !== undefined) {
      records = fastReplacementRecords;
      ownsParent = true;
      return;
    }

    const fastAppendedRecords = ownsCurrentParent
      ? tryAppendSingleNodeItems(
          insertionParent,
          marker,
          records,
          currentItems,
          options.key,
          renderItem,
          renderArity,
          deferEventPromotion,
          selectedClassState,
        )
      : undefined;

    if (fastAppendedRecords !== undefined) {
      records = fastAppendedRecords;
      ownsParent = true;
      return;
    }

    const fastRemovedRecords = ownsCurrentParent
      ? tryRemoveSingleNodeItems(
          records,
          currentItems,
          options.key,
          renderArity,
          selectedClassState,
        )
      : undefined;

    if (fastRemovedRecords !== undefined) {
      removeChangedSingleNodeRecords(fastRemovedRecords, selectedClassState, deferEventPromotion);
      records = fastRemovedRecords.records;
      ownsParent = true;
      return;
    }

    const fastSwappedRecords = ownsCurrentParent
      ? trySwapSingleNodeItems(
          insertionParent,
          marker,
          records,
          currentItems,
          options.key,
          renderArity,
          selectedClassState,
        )
      : undefined;

    if (fastSwappedRecords !== undefined) {
      records = fastSwappedRecords;
      ownsParent = true;
      return;
    }

    const keyedItems = uniqueSingleNodeKeyedItems(currentItems, options.key);
    const keys = keyedItems.keys;

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

    const appendedRecords = ownsCurrentParent
      ? tryAppendSingleNodeRecords(
          insertionParent,
          marker,
          records,
          keyedItems,
          currentItems,
          renderItem,
          renderArity,
          deferEventPromotion,
          selectedClassState,
        )
      : undefined;

    if (appendedRecords !== undefined) {
      records = appendedRecords;
      ownsParent = true;
      return;
    }

    const removedRecords = ownsCurrentParent
      ? tryRemoveSingleNodeRecords(
          records,
          keyedItems,
          currentItems,
          renderArity,
          selectedClassState,
        )
      : undefined;

    if (removedRecords !== undefined) {
      removeChangedSingleNodeRecords(removedRecords, selectedClassState, deferEventPromotion);
      records = removedRecords.records;
      ownsParent = true;
      return;
    }

    const canBulkReplace =
      (records.size === 0 &&
        insertionParent.childNodes.length === 1 &&
        marker.nextSibling === null) ||
      (ownsCurrentParent && keys.length === records.size && areKeysDisjoint(records, keys));

    if (canBulkReplace) {
      const next = createSingleNodeRecordsWithFragment(
        insertionParent,
        keyedItems,
        currentItems,
        renderItem,
        renderArity,
        deferEventPromotion,
        selectedClassState,
      );

      const disposeError = disposeRecordValues(records.values(), deferEventPromotion);
      insertionParent.replaceChildren(next.fragment, marker);
      if (deferEventPromotion) {
        promoteRecordEvents(next.records.values());
      }
      records = next.records;
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
          renderArity,
          deferEventPromotion,
          selectedClassState,
        );
      }

      nextRecords.set(itemKey, record);
      orderedRecords.push(record);
    }

    removeStaleSingleNodeRecords(records, nextRecords, selectedClassState, deferEventPromotion);
    reconcileSingleNodeRecordOrder(insertionParent, marker, orderedRecords);
    if (deferEventPromotion) {
      promoteRecordEvents(nextRecords.values());
    }
    records = nextRecords;
    ownsParent =
      insertionParent.childNodes.length === records.size + 1 && marker.nextSibling === null;
  });

  const disposeCompilerEvents = setupCompilerKeyedEvents(
    parent,
    compilerEvents ?? [],
    (node) => {
      const context = (node as CompilerKeyedRowNode)[activeCompilerRowContext];
      return context !== undefined &&
        (compilerEventOwner === undefined ||
          context[compilerRowEventOwner] === compilerEventOwner)
        ? (context as CompilerKeyedRowContext<T>)
        : undefined;
    },
  );

  return registerDispose(() => {
    dispose();
    disposeCompilerEvents();
    selectedClassState?.dispose();
    unregisterSelectedClassRecords(selectedClassState, records.values());
    removeRecordNodes(records.values(), deferEventPromotion);
    records = new Map();
  });
}

/** Binds compiler-generated keyed rows through mutable per-row context. */
export function bindCompilerKeyedSingleNodeList<T, TNode extends ChildNode>(
  parent: ParentNode,
  marker: ChildNode,
  items: () => readonly T[],
  renderItem: CompilerKeyedSingleNodeRenderer<T, TNode>,
  options: BindCompilerKeyedSingleNodeListOptions<T, TNode>,
): Dispose {
  const markRecordsForHydration = isDynamicHydrationEnabled();
  const compilerSelectedClass = options.compilerSelectedClass;
  const compilerEventOwner = options.compilerEvents === undefined ? undefined : {};
  const listOptions: InternalStaticKeyedSingleNodeListOptions<T, TNode> = {
    ...options,
    ...(compilerEventOwner === undefined ? {} : { compilerEventOwner }),
    ...(compilerSelectedClass === undefined
      ? {}
      : {
          selectedClass: {
            ...compilerSelectedClass,
            compilerMode: "strict-replace",
          } as InternalSelectedClassOptions<T, TNode>,
        }),
  };

  if (markRecordsForHydration) {
    markDynamicNode(marker);
  }

  const compilerRenderer: InternalSingleNodeRenderer<T, TNode> = (
    item,
    index,
    currentItems,
  ) => {
    const context = Object.create(compilerRowContextPrototype) as InternalCompilerKeyedRowContext;
    context[compilerRowIndex] = index;
    context[compilerRowItem] = item;
    context[compilerRowItems] = currentItems;
    context[compilerRowReads] = 0;
    if (options.compilerOwnsTextCleanup === true) {
      context[compilerRowOwnsTextCleanup] = true;
    }
    if (compilerEventOwner !== undefined) {
      context[compilerRowEventOwner] = compilerEventOwner;
    }
    let node: TNode;
    try {
      node = renderItem(context as CompilerKeyedRowContext<T>);
    } catch (error) {
      if (options.compilerOwnsTextCleanup === true) {
        disposeCompilerRowTextSubscriptions(context);
      }
      throw error;
    }
    (node as CompilerKeyedRowNode)[activeCompilerRowContext] = context;
    if (markRecordsForHydration) {
      markDynamicNode(node);
    }
    return node;
  };

  if (options.compilerOwnsTextCleanup === true) {
    compilerRenderer[compilerOwnsTextCleanupRenderer] = true;
  }

  return bindStaticKeyedSingleNodeList(parent, marker, items, compilerRenderer, listOptions);
}

function ensureCompilerRowSource(context: InternalCompilerKeyedRowContext): Source {
  return (context[compilerRowSource] ??= { subscribers: null });
}

function trackCompilerRowContext(context: InternalCompilerKeyedRowContext): void {
  if (activeCompilerTextContext !== context && runtimeState.activeTracker !== null) {
    trackSource(ensureCompilerRowSource(context));
  }
}

/** Internal text binding used only by compiler-generated keyed row renderers. */
export function bindCompilerKeyedText<T>(
  context: CompilerKeyedRowContext<T>,
  node: Text,
  readValue: () => unknown,
): Dispose {
  const internalContext = context as InternalCompilerKeyedRowContext;
  const reactiveText = node as Text & { __mreactReactiveText?: true };
  reactiveText.__mreactReactiveText = true;

  const subscription = subscribeRefreshable(() => {
    const previousContext = activeCompilerTextContext;
    activeCompilerTextContext = internalContext;

    try {
      node.data = normalizeText(readValue());
    } finally {
      activeCompilerTextContext = previousContext;
    }
  });
  const subscriptions = internalContext[compilerRowTextSubscriptions];

  if (subscriptions === undefined) {
    internalContext[compilerRowTextSubscriptions] = subscription;
  } else if (Array.isArray(subscriptions)) {
    subscriptions.push(subscription);
  } else {
    internalContext[compilerRowTextSubscriptions] = [subscriptions, subscription];
  }

  if (internalContext[compilerRowOwnsTextCleanup] === true) {
    return noopCompilerTextDispose;
  }

  return registerIdempotentDispose(() => subscription.dispose());
}

/** Internal direct-property text binding used by compiler-generated keyed rows. */
export function bindCompilerKeyedPropertyText<T, K extends keyof T>(
  context: CompilerKeyedRowContext<T>,
  node: Text,
  property: K,
): Dispose {
  const internalContext = context as InternalCompilerKeyedRowContext;
  const reactiveText = node as Text & { __mreactReactiveText?: true };
  reactiveText.__mreactReactiveText = true;

  const subscription = subscribeRefreshableIfTracked(() => {
    const previousContext = activeCompilerTextContext;
    activeCompilerTextContext = internalContext;

    try {
      node.data = normalizeText(context.item[property]);
    } finally {
      activeCompilerTextContext = previousContext;
    }
  });

  if (subscription === undefined) {
    registerCompilerStaticPropertyText(internalContext, node, property);
    return noopCompilerTextDispose;
  }

  registerCompilerRowTextSubscription(internalContext, subscription);

  if (internalContext[compilerRowOwnsTextCleanup] === true) {
    return noopCompilerTextDispose;
  }

  return registerIdempotentDispose(() => subscription.dispose());
}

function registerCompilerStaticPropertyText(
  context: InternalCompilerKeyedRowContext,
  node: Text,
  property: PropertyKey,
): void {
  const firstNode = context[compilerRowStaticPropertyTextNode];

  if (firstNode === undefined) {
    context[compilerRowStaticPropertyTextNode] = node;
    context[compilerRowStaticPropertyTextKey] = property;
    return;
  }

  const bindings = (context[compilerRowStaticPropertyTexts] ??= [
    firstNode,
    context[compilerRowStaticPropertyTextKey] as PropertyKey,
  ]);
  context[compilerRowStaticPropertyTextNode] = undefined;
  context[compilerRowStaticPropertyTextKey] = undefined;
  bindings.push(node, property);
}

function registerCompilerRowTextSubscription(
  context: InternalCompilerKeyedRowContext,
  subscription: RefreshableSubscription,
): void {
  const subscriptions = context[compilerRowTextSubscriptions];

  if (subscriptions === undefined) {
    context[compilerRowTextSubscriptions] = subscription;
  } else if (Array.isArray(subscriptions)) {
    subscriptions.push(subscription);
  } else {
    context[compilerRowTextSubscriptions] = [subscriptions, subscription];
  }
}

/** Internal Cell-property text binding used by compiler-generated keyed rows. */
export function bindCompilerKeyedCellText<T, K extends keyof T>(
  context: CompilerKeyedRowContext<T>,
  node: Text,
  property: K,
): Dispose {
  const internalContext = context as InternalCompilerKeyedRowContext;
  const reactiveText = node as Text & { __mreactReactiveText?: true };
  reactiveText.__mreactReactiveText = true;

  const subscription = subscribeRefreshable(() => {
    const previousContext = activeCompilerTextContext;
    activeCompilerTextContext = internalContext;

    try {
      const value = context.item[property] as ReadonlyCell<unknown>;
      node.data = normalizeText(value.get());
    } finally {
      activeCompilerTextContext = previousContext;
    }
  });
  const subscriptions = internalContext[compilerRowTextSubscriptions];

  if (subscriptions === undefined) {
    internalContext[compilerRowTextSubscriptions] = subscription;
  } else if (Array.isArray(subscriptions)) {
    subscriptions.push(subscription);
  } else {
    internalContext[compilerRowTextSubscriptions] = [subscriptions, subscription];
  }

  if (internalContext[compilerRowOwnsTextCleanup] === true) {
    return noopCompilerTextDispose;
  }

  return registerIdempotentDispose(() => subscription.dispose());
}

function uniqueSingleNodeKeyedItems<T>(
  items: readonly T[],
  key: (item: T, index: number, items: readonly T[]) => unknown,
): SingleNodeKeyedItems<T> {
  const length = items.length;
  // oxlint-disable-next-line unicorn/no-new-array -- a sparse preallocated keys array avoids per-slot callbacks on the hot list path.
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

function createSingleNodeRecordsWithFragment<T, TNode extends ChildNode>(
  parent: ParentNode,
  keyedItems: SingleNodeKeyedItems<T>,
  currentItems: readonly T[],
  renderItem: SingleNodeRenderer<T, TNode>,
  renderArity: number,
  deferEventPromotion: boolean,
  selectedClassState: SelectedClassState | undefined,
): { fragment: DocumentFragment; records: Map<unknown, SingleNodeRecord> } {
  const records = new Map<unknown, SingleNodeRecord>();
  const fragment = document.createDocumentFragment();
  const keys = keyedItems.keys;
  const items = keyedItems.items;
  const indexes = keyedItems.indexes;

  for (let slot = 0; slot < keys.length; slot += 1) {
    const record = createSingleNodeRecord(
      parent,
      keys[slot],
      items[slot] as T,
      indexes === null ? slot : (indexes[slot] as number),
      currentItems,
      renderItem,
      renderArity,
      deferEventPromotion,
      selectedClassState,
    );

    records.set(keys[slot], record);
    fragment.appendChild(record.node);
  }

  return { fragment, records };
}

function createSingleNodeRecordsFromKeysWithFragment<T, TNode extends ChildNode>(
  parent: ParentNode,
  keys: readonly unknown[],
  items: readonly T[],
  renderItem: SingleNodeRenderer<T, TNode>,
  renderArity: number,
  deferEventPromotion: boolean,
  selectedClassState: SelectedClassState | undefined,
): { fragment: DocumentFragment; records: Map<unknown, SingleNodeRecord> } {
  const records = new Map<unknown, SingleNodeRecord>();
  const fragment = document.createDocumentFragment();

  for (let index = 0; index < keys.length; index += 1) {
    const record = createSingleNodeRecord(
      parent,
      keys[index],
      items[index] as T,
      index,
      items,
      renderItem,
      renderArity,
      deferEventPromotion,
      selectedClassState,
    );

    records.set(keys[index], record);
    fragment.appendChild(record.node);
  }

  return { fragment, records };
}

function createSingleNodeRecord<T, TNode extends ChildNode>(
  parent: ParentNode,
  key: unknown,
  item: T,
  index: number,
  items: readonly T[],
  renderItem: SingleNodeRenderer<T, TNode>,
  renderArity: number,
  deferEventPromotion: boolean,
  selectedClassState: SelectedClassState | undefined,
): SingleNodeRecord {
  const compilerOwnsTextCleanup =
    (renderItem as InternalSingleNodeRenderer<T, TNode>)[compilerOwnsTextCleanupRenderer] === true;
  let node: TNode;
  let scope: DomScope | undefined;
  let promoteEvents: (() => void) | undefined;

  if (compilerOwnsTextCleanup) {
    const deferred =
      deferEventPromotion && parent.isConnected === true
        ? untrack(() =>
            withDeferredDelegatedEventPromotions(() => renderItem(item, index, items)),
          )
        : undefined;
    node = deferred?.value ?? untrack(() => renderItem(item, index, items));
    promoteEvents = deferred?.promote;
  } else {
    const deferred =
      deferEventPromotion && parent.isConnected === true
        ? untrack(() =>
            withDeferredDelegatedEventPromotions(() =>
              createScopedRenderNodeScope(() => renderItem(item, index, items)),
            ),
          )
        : undefined;
    const scoped =
      deferred?.value ??
      untrack(() => createScopedRenderNodeScope(() => renderItem(item, index, items)));
    node = scoped.node;
    scope = scoped.scope;
    promoteEvents = deferred?.promote;
  }

  const record: SingleNodeRecord & { promoteEvents?: () => void } = {
    key,
    node,
  };
  const compilerContext = (node as CompilerKeyedRowNode)[activeCompilerRowContext];

  if (compilerContext !== undefined) {
    record.compilerContext = compilerContext;
  } else {
    record.currentItem = item;
    if (renderArity >= 2) {
      record.currentIndex = index;
    }
    if (renderArity >= 3) {
      record.currentItems = items;
    }
  }

  if (scope !== undefined) {
    record.scope = scope;
  }

  if (promoteEvents !== undefined) {
    record.promoteEvents = promoteEvents;
  }

  registerSelectedClassRecord(selectedClassState, record, item, index, items);
  return record;
}

function tryReplaceDisjointSingleNodeItems<T, TNode extends ChildNode>(
  parent: ListParentNode,
  marker: ChildNode,
  records: Map<unknown, SingleNodeRecord>,
  currentItems: readonly T[],
  key: (item: T, index: number, items: readonly T[]) => unknown,
  renderItem: SingleNodeRenderer<T, TNode>,
  renderArity: number,
  deferEventPromotion: boolean,
  selectedClassState: SelectedClassState | undefined,
): Map<unknown, SingleNodeRecord> | undefined {
  const length = currentItems.length;
  // oxlint-disable-next-line unicorn/no-new-array -- keys are filled sequentially and reused while creating records.
  const keys = new Array<unknown>(length);
  const seenKeys = new Set<unknown>();

  for (let index = 0; index < length; index += 1) {
    const itemKey = key(currentItems[index] as T, index, currentItems);

    if (seenKeys.has(itemKey) || records.has(itemKey)) {
      return undefined;
    }

    seenKeys.add(itemKey);
    keys[index] = itemKey;
  }

  const next = createSingleNodeRecordsFromKeysWithFragment(
    parent,
    keys,
    currentItems,
    renderItem,
    renderArity,
    deferEventPromotion,
    selectedClassState,
  );
  const disposeError = disposeRecordValues(records.values(), deferEventPromotion);
  unregisterSelectedClassRecords(selectedClassState, records.values());
  parent.replaceChildren(next.fragment, marker);
  if (deferEventPromotion) {
    promoteRecordEvents(next.records.values());
  }

  if (disposeError !== undefined) {
    throw disposeError;
  }

  return next.records;
}

function tryAppendSingleNodeItems<T, TNode extends ChildNode>(
  parent: ParentNode,
  marker: ChildNode,
  records: Map<unknown, SingleNodeRecord>,
  currentItems: readonly T[],
  key: (item: T, index: number, items: readonly T[]) => unknown,
  renderItem: SingleNodeRenderer<T, TNode>,
  renderArity: number,
  deferEventPromotion: boolean,
  selectedClassState: SelectedClassState | undefined,
): Map<unknown, SingleNodeRecord> | undefined {
  if (currentItems.length <= records.size || records.size === 0) {
    return undefined;
  }

  const previousSize = records.size;
  const previousRecords = records[Symbol.iterator]();
  const refreshSelectedClasses = shouldRefreshSelectedClassRecords(selectedClassState);

  for (let index = 0; index < previousSize; index += 1) {
    const previousRecord = previousRecords.next();
    const item = currentItems[index] as T;
    const itemKey = key(item, index, currentItems);

    if (previousRecord.done || !Object.is(previousRecord.value[0], itemKey)) {
      return undefined;
    }

    const record = previousRecord.value[1];

    if (
      !canKeepSingleNodeRecordWithoutUpdate(record, renderArity) &&
      !updateSingleNodeRecord(record, renderArity, item, index, currentItems)
    ) {
      return undefined;
    }

    if (refreshSelectedClasses) {
      refreshSelectedClassRecord(selectedClassState, record);
    }
  }

  const appendedLength = currentItems.length - previousSize;
  // oxlint-disable-next-line unicorn/no-new-array -- appended keys are validated once and reused for record creation.
  const appendedKeys = new Array<unknown>(appendedLength);
  const seenAppendedKeys = appendedLength > 1 ? new Set<unknown>() : undefined;

  for (let index = previousSize; index < currentItems.length; index += 1) {
    const itemKey = key(currentItems[index] as T, index, currentItems);

    if (records.has(itemKey) || seenAppendedKeys?.has(itemKey) === true) {
      return undefined;
    }

    seenAppendedKeys?.add(itemKey);
    appendedKeys[index - previousSize] = itemKey;
  }

  const appendFragment = document.createDocumentFragment();
  const appendedRecords: SingleNodeRecord[] = [];

  try {
    for (let index = previousSize; index < currentItems.length; index += 1) {
      const record = createSingleNodeRecord(
        parent,
        appendedKeys[index - previousSize],
        currentItems[index] as T,
        index,
        currentItems,
        renderItem,
        renderArity,
        deferEventPromotion,
        selectedClassState,
      );

      appendedRecords.push(record);
      appendFragment.appendChild(record.node);
    }
  } catch (error) {
    unregisterSelectedClassRecords(selectedClassState, appendedRecords);
    disposeRecordValues(appendedRecords, deferEventPromotion);
    throw error;
  }

  for (let index = 0; index < appendedRecords.length; index += 1) {
    records.set(appendedKeys[index], appendedRecords[index] as SingleNodeRecord);
  }

  parent.insertBefore(appendFragment, marker);
  if (deferEventPromotion) {
    promoteRecordEvents(appendedRecords);
  }
  return records;
}

function tryRemoveSingleNodeItems<T>(
  records: Map<unknown, SingleNodeRecord>,
  currentItems: readonly T[],
  key: (item: T, index: number, items: readonly T[]) => unknown,
  renderArity: number,
  selectedClassState: SelectedClassState | undefined,
): RemovedSingleNodeRecords | undefined {
  if (currentItems.length >= records.size || currentItems.length === 0) {
    return undefined;
  }

  const refreshSelectedClasses = shouldRefreshSelectedClassRecords(selectedClassState);
  let index = 0;
  let staleRecord: SingleNodeRecord | undefined;
  let staleRecords: SingleNodeRecord[] | undefined;

  for (const [previousKey, record] of records) {
    if (index < currentItems.length) {
      const item = currentItems[index] as T;
      const itemKey = key(item, index, currentItems);

      if (Object.is(previousKey, itemKey)) {
        if (
          !canKeepSingleNodeRecordWithoutUpdate(record, renderArity) &&
          !updateSingleNodeRecord(record, renderArity, item, index, currentItems)
        ) {
          return undefined;
        }

        if (refreshSelectedClasses) {
          refreshSelectedClassRecord(selectedClassState, record);
        }
        index += 1;
        continue;
      }
    }

    if (staleRecord === undefined && staleRecords === undefined) {
      staleRecord = record;
    } else {
      staleRecords ??= [staleRecord as SingleNodeRecord];
      staleRecord = undefined;
      staleRecords.push(record);
    }
  }

  if (index !== currentItems.length || (staleRecord === undefined && staleRecords === undefined)) {
    return undefined;
  }

  if (staleRecords === undefined) {
    records.delete((staleRecord as SingleNodeRecord).key);
    return { records, staleRecord: staleRecord as SingleNodeRecord };
  }

  for (const record of staleRecords) {
    records.delete(record.key);
  }

  return { records, staleRecords };
}

function trySwapSingleNodeItems<T>(
  parent: ParentNode,
  marker: ChildNode,
  records: Map<unknown, SingleNodeRecord>,
  currentItems: readonly T[],
  key: (item: T, index: number, items: readonly T[]) => unknown,
  renderArity: number,
  selectedClassState: SelectedClassState | undefined,
): Map<unknown, SingleNodeRecord> | undefined {
  if (currentItems.length !== records.size || currentItems.length < 2) {
    return undefined;
  }

  const previousRecords = records[Symbol.iterator]();
  // oxlint-disable-next-line unicorn/no-new-array -- this hot path fills every slot while avoiding a second swap buffer.
  const orderedRecords = new Array<SingleNodeRecord>(currentItems.length);
  let firstIndex = -1;
  let secondIndex = -1;
  let firstPreviousKey: unknown;
  let secondPreviousKey: unknown;
  let firstNextKey: unknown;
  let secondNextKey: unknown;
  let firstRecord: SingleNodeRecord | undefined;
  let secondRecord: SingleNodeRecord | undefined;

  for (let index = 0; index < currentItems.length; index += 1) {
    const previousRecord = previousRecords.next();

    if (previousRecord.done) {
      return undefined;
    }

    const nextKey = key(currentItems[index] as T, index, currentItems);
    const previousKey = previousRecord.value[0];
    const record = previousRecord.value[1];

    if (Object.is(previousKey, nextKey)) {
      orderedRecords[index] = record;
      continue;
    }

    if (firstIndex === -1) {
      firstIndex = index;
      firstPreviousKey = previousKey;
      firstNextKey = nextKey;
      firstRecord = record;
    } else if (secondIndex === -1) {
      secondIndex = index;
      secondPreviousKey = previousKey;
      secondNextKey = nextKey;
      secondRecord = record;

      if (
        !Object.is(firstPreviousKey, secondNextKey) ||
        !Object.is(secondPreviousKey, firstNextKey)
      ) {
        return undefined;
      }

      orderedRecords[firstIndex] = secondRecord;
      orderedRecords[secondIndex] = firstRecord as SingleNodeRecord;
    } else {
      return undefined;
    }
  }

  if (firstIndex === -1) {
    const refreshSelectedClasses = shouldRefreshSelectedClassRecords(selectedClassState);

    for (let index = 0; index < currentItems.length; index += 1) {
      const item = currentItems[index] as T;
      const record = orderedRecords[index] as SingleNodeRecord;

      if (
        !canKeepSingleNodeRecordWithoutUpdate(record, renderArity) &&
        !updateSingleNodeRecord(record, renderArity, item, index, currentItems)
      ) {
        return undefined;
      }

      if (refreshSelectedClasses) {
        refreshSelectedClassRecord(selectedClassState, record);
      }
    }

    return records;
  }

  if (
    secondIndex === -1 ||
    firstRecord === undefined ||
    secondRecord === undefined
  ) {
    return undefined;
  }

  const nextRecords = new Map<unknown, SingleNodeRecord>();
  const refreshSelectedClasses = shouldRefreshSelectedClassRecords(selectedClassState);

  for (let index = 0; index < currentItems.length; index += 1) {
    const item = currentItems[index] as T;
    const record = orderedRecords[index] as SingleNodeRecord;

    if (
      !canKeepSingleNodeRecordWithoutUpdate(record, renderArity) &&
      !updateSingleNodeRecord(record, renderArity, item, index, currentItems)
    ) {
      return undefined;
    }

    if (refreshSelectedClasses) {
      refreshSelectedClassRecord(selectedClassState, record);
    }
    nextRecords.set(record.key, record);
  }

  const secondAnchor = orderedRecords[secondIndex + 1]?.node ?? marker;

  return moveSwappedSingleNodeRecords(parent, nextRecords, secondRecord, firstRecord, secondAnchor);
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
  const refreshSelectedClasses = shouldRefreshSelectedClassRecords(selectedClassState);

  for (let slot = 0; slot < keys.length; slot += 1) {
    const previousKey = previousKeys.next();

    if (previousKey.done || !Object.is(previousKey.value, keys[slot])) {
      return false;
    }

    const record = records.get(keys[slot]);

    if (
      record === undefined ||
      (!canKeepSingleNodeRecordWithoutUpdate(record, renderArity) &&
        !updateSingleNodeRecord(
          record,
          renderArity,
          items[slot],
          indexes === null ? slot : (indexes[slot] as number),
          currentItems,
        ))
    ) {
      return false;
    }

    if (refreshSelectedClasses) {
      refreshSelectedClassRecord(selectedClassState, record);
    }
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
  const compilerContext = record.compilerContext;

  if (compilerContext !== undefined) {
    const reads = compilerContext[compilerRowReads];
    if (
      (reads & 4) === 0 &&
      Object.is(compilerContext[compilerRowItem], nextItem) &&
      compilerContext[compilerRowIndex] === nextIndex
    ) {
      compilerContext[compilerRowItems] = nextItems;
      return true;
    }
    const changed =
      ((reads & 1) !== 0 && !Object.is(compilerContext[compilerRowItem], nextItem)) ||
      ((reads & 2) !== 0 && compilerContext[compilerRowIndex] !== nextIndex) ||
      ((reads & 4) !== 0 && compilerContext[compilerRowItems] !== nextItems);
    compilerContext[compilerRowItem] = nextItem;
    compilerContext[compilerRowIndex] = nextIndex;
    compilerContext[compilerRowItems] = nextItems;

    if (changed) {
      refreshCompilerRowTextSubscriptions(compilerContext);
    }

    const source = compilerContext[compilerRowSource];
    if (changed && source !== undefined && source.subscribers !== null) {
      notifySubscribers(source);
    }
    return true;
  }

  if (!isObjectLike(record.currentItem) && !Object.is(record.currentItem, nextItem)) {
    return false;
  }

  if (renderArity >= 2 && record.currentIndex !== nextIndex) {
    return false;
  }

  if (renderArity >= 3 && record.currentItems !== nextItems) {
    return false;
  }

  if (renderArity >= 2) {
    record.currentIndex = nextIndex;
  }

  if (renderArity >= 3) {
    record.currentItems = nextItems;
  }
  return true;
}

function refreshCompilerRowTextSubscriptions(context: InternalCompilerKeyedRowContext): void {
  const subscriptions = context[compilerRowTextSubscriptions];
  refreshCompilerStaticPropertyTexts(context);

  if (subscriptions === undefined) {
    return;
  }

  if (!Array.isArray(subscriptions)) {
    subscriptions.refresh();
    return;
  }

  for (let index = 0; index < subscriptions.length; index += 1) {
    subscriptions[index]!.refresh();
  }
}

function refreshCompilerStaticPropertyTexts(context: InternalCompilerKeyedRowContext): void {
  const firstNode = context[compilerRowStaticPropertyTextNode];

  if (firstNode !== undefined) {
    const property = context[compilerRowStaticPropertyTextKey] as PropertyKey;
    const subscription = refreshCompilerStaticPropertyText(context, firstNode, property);
    if (subscription !== undefined) {
      context[compilerRowStaticPropertyTextNode] = undefined;
      context[compilerRowStaticPropertyTextKey] = undefined;
      registerCompilerRowTextSubscription(context, subscription);
    }
    return;
  }

  const bindings = context[compilerRowStaticPropertyTexts];
  if (bindings === undefined) {
    return;
  }

  let retainedLength = 0;
  for (let index = 0; index < bindings.length; index += 2) {
    const node = bindings[index] as Text;
    const property = bindings[index + 1] as PropertyKey;
    const subscription = refreshCompilerStaticPropertyText(context, node, property);

    if (subscription === undefined) {
      bindings[retainedLength] = node;
      bindings[retainedLength + 1] = property;
      retainedLength += 2;
    } else {
      registerCompilerRowTextSubscription(context, subscription);
    }
  }

  if (retainedLength === 0) {
    context[compilerRowStaticPropertyTexts] = undefined;
  } else {
    bindings.length = retainedLength;
  }
}

function refreshCompilerStaticPropertyText(
  context: InternalCompilerKeyedRowContext,
  node: Text,
  property: PropertyKey,
): RefreshableSubscription | undefined {
  return subscribeRefreshableIfTracked(() => {
    const previousContext = activeCompilerTextContext;
    activeCompilerTextContext = context;

    try {
      node.data = normalizeText(
        (context.item as Record<PropertyKey, unknown>)[property],
      );
    } finally {
      activeCompilerTextContext = previousContext;
    }
  });
}

function disposeCompilerRowTextSubscriptions(context: InternalCompilerKeyedRowContext): void {
  const subscriptions = context[compilerRowTextSubscriptions];
  context[compilerRowTextSubscriptions] = undefined;

  if (subscriptions === undefined) {
    return;
  }

  if (!Array.isArray(subscriptions)) {
    subscriptions.dispose();
    return;
  }

  let firstError: unknown;
  for (let index = subscriptions.length - 1; index >= 0; index -= 1) {
    try {
      subscriptions[index]!.dispose();
    } catch (error) {
      firstError ??= error;
    }
  }

  if (firstError !== undefined) {
    throw firstError;
  }
}

function isObjectLike(value: unknown): value is object {
  return typeof value === "object" && value !== null;
}

function canKeepSingleNodeRecordWithoutUpdate(
  record: SingleNodeRecord,
  renderArity: number,
): boolean {
  return (
    record.compilerContext === undefined && renderArity < 2 && isObjectLike(record.currentItem)
  );
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

function tryAppendSingleNodeRecords<T, TNode extends ChildNode>(
  parent: ParentNode,
  marker: ChildNode,
  records: Map<unknown, SingleNodeRecord>,
  keyedItems: SingleNodeKeyedItems<T>,
  currentItems: readonly T[],
  renderItem: SingleNodeRenderer<T, TNode>,
  renderArity: number,
  deferEventPromotion: boolean,
  selectedClassState: SelectedClassState | undefined,
): Map<unknown, SingleNodeRecord> | undefined {
  const keys = keyedItems.keys;
  const items = keyedItems.items;
  const indexes = keyedItems.indexes;
  const refreshSelectedClasses = shouldRefreshSelectedClassRecords(selectedClassState);

  if (indexes !== null || keys.length <= records.size || records.size === 0) {
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

    if (
      !canKeepSingleNodeRecordWithoutUpdate(record, renderArity) &&
      !updateSingleNodeRecord(record, renderArity, items[slot], slot, currentItems)
    ) {
      return undefined;
    }

    if (refreshSelectedClasses) {
      refreshSelectedClassRecord(selectedClassState, record);
    }
  }

  for (let slot = records.size; slot < keys.length; slot += 1) {
    if (records.has(keys[slot])) {
      return undefined;
    }
  }

  const appendFragment = document.createDocumentFragment();
  const appendedRecords: SingleNodeRecord[] = [];

  try {
    for (let slot = records.size; slot < keys.length; slot += 1) {
      const record = createSingleNodeRecord(
        parent,
        keys[slot],
        items[slot] as T,
        slot,
        currentItems,
        renderItem,
        renderArity,
        deferEventPromotion,
        selectedClassState,
      );

      appendedRecords.push(record);
      appendFragment.appendChild(record.node);
    }
  } catch (error) {
    unregisterSelectedClassRecords(selectedClassState, appendedRecords);
    disposeRecordValues(appendedRecords, deferEventPromotion);
    throw error;
  }

  const firstAppendedSlot = keys.length - appendedRecords.length;

  for (let index = 0; index < appendedRecords.length; index += 1) {
    records.set(keys[firstAppendedSlot + index], appendedRecords[index] as SingleNodeRecord);
  }

  parent.insertBefore(appendFragment, marker);

  if (deferEventPromotion) {
    promoteRecordEvents(appendedRecords);
  }
  return records;
}

function tryRemoveSingleNodeRecords<T>(
  records: Map<unknown, SingleNodeRecord>,
  keyedItems: SingleNodeKeyedItems<T>,
  currentItems: readonly T[],
  renderArity: number,
  selectedClassState: SelectedClassState | undefined,
): RemovedSingleNodeRecords | undefined {
  const keys = keyedItems.keys;
  const items = keyedItems.items;
  const indexes = keyedItems.indexes;
  const refreshSelectedClasses = shouldRefreshSelectedClassRecords(selectedClassState);

  if (indexes !== null || keys.length >= records.size || keys.length === 0) {
    return undefined;
  }

  let slot = 0;
  let staleRecord: SingleNodeRecord | undefined;
  let staleRecords: SingleNodeRecord[] | undefined;

  for (const [previousKey, record] of records) {
    if (slot < keys.length && Object.is(previousKey, keys[slot])) {
      if (
        !canKeepSingleNodeRecordWithoutUpdate(record, renderArity) &&
        !updateSingleNodeRecord(record, renderArity, items[slot], slot, currentItems)
      ) {
        return undefined;
      }

      if (refreshSelectedClasses) {
        refreshSelectedClassRecord(selectedClassState, record);
      }
      slot += 1;
    } else {
      if (staleRecord === undefined && staleRecords === undefined) {
        staleRecord = record;
      } else {
        staleRecords ??= [staleRecord as SingleNodeRecord];
        staleRecord = undefined;
        staleRecords.push(record);
      }
    }
  }

  if (slot !== keys.length || (staleRecord === undefined && staleRecords === undefined)) {
    return undefined;
  }

  if (staleRecords === undefined) {
    records.delete((staleRecord as SingleNodeRecord).key);
    return { records, staleRecord: staleRecord as SingleNodeRecord };
  }

  for (const record of staleRecords) {
    records.delete(record.key);
  }

  return { records, staleRecords };
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
  const refreshSelectedClasses = shouldRefreshSelectedClassRecords(selectedClassState);

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
      (!canKeepSingleNodeRecordWithoutUpdate(record, renderArity) &&
        !updateSingleNodeRecord(record, renderArity, items[slot], slot, currentItems))
    ) {
      return undefined;
    }

    if (refreshSelectedClasses) {
      refreshSelectedClassRecord(selectedClassState, record);
    }
    nextRecords.set(keys[slot], record);
  }

  const firstRecord = nextRecords.get(keys[firstIndex]);
  const secondRecord = nextRecords.get(keys[secondIndex]);
  const secondAnchor = nextRecords.get(keys[secondIndex + 1])?.node ?? marker;

  return moveSwappedSingleNodeRecords(parent, nextRecords, firstRecord, secondRecord, secondAnchor);
}

function moveSwappedSingleNodeRecords(
  parent: ParentNode,
  nextRecords: Map<unknown, SingleNodeRecord>,
  firstRecord: SingleNodeRecord | undefined,
  secondRecord: SingleNodeRecord | undefined,
  secondAnchor: ChildNode,
): Map<unknown, SingleNodeRecord> | undefined {
  if (firstRecord === undefined || secondRecord === undefined) {
    return undefined;
  }

  const firstAnchor = secondRecord.node;

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
  batchDelegatedRootReleases: boolean,
): void {
  const staleRecords: SingleNodeRecord[] = [];

  for (const [key, record] of records) {
    if (!nextRecords.has(key)) {
      unregisterSelectedClassRecord(selectedClassState, record);
      staleRecords.push(record);
    }
  }

  removeRecordNodes(staleRecords, batchDelegatedRootReleases);
}

function removeChangedSingleNodeRecords(
  removed: RemovedSingleNodeRecords,
  selectedClassState: SelectedClassState | undefined,
  batchDelegatedRootReleases: boolean,
): void {
  if (removed.staleRecord !== undefined) {
    unregisterSelectedClassRecord(selectedClassState, removed.staleRecord);
    removeRecordNode(removed.staleRecord, batchDelegatedRootReleases);
    return;
  }

  for (const staleRecord of removed.staleRecords) {
    unregisterSelectedClassRecord(selectedClassState, staleRecord);
  }
  removeRecordNodes(removed.staleRecords, batchDelegatedRootReleases);
}

function removeRecordNode(record: SingleNodeRecord, batchDelegatedRootReleases: boolean): void {
  let firstError: unknown;
  const removeRecord = () => {
    try {
      disposeSingleNodeRecord(record);
    } catch (error) {
      firstError = error;
    }

    record.node.parentNode?.removeChild(record.node);
  };

  if (batchDelegatedRootReleases) {
    withBatchedDelegatedRootReleases(removeRecord);
  } else {
    removeRecord();
  }

  if (firstError !== undefined) {
    throw firstError;
  }
}

function removeRecordNodes(
  records: Iterable<SingleNodeRecord>,
  batchDelegatedRootReleases: boolean,
): void {
  let firstError: unknown;
  const removeRecords = () => {
    for (const record of records) {
      try {
        disposeSingleNodeRecord(record);
      } catch (error) {
        firstError ??= error;
      }

      record.node.parentNode?.removeChild(record.node);
    }
  };

  if (batchDelegatedRootReleases) {
    withBatchedDelegatedRootReleases(removeRecords);
  } else {
    removeRecords();
  }

  if (firstError !== undefined) {
    throw firstError;
  }
}

function disposeRecordValues(
  records: Iterable<SingleNodeRecord>,
  batchDelegatedRootReleases: boolean,
): unknown {
  let firstError: unknown;
  const disposeRecordScopes = () => {
    for (const record of records) {
      try {
        disposeSingleNodeRecord(record);
      } catch (error) {
        firstError ??= error;
      }
    }
  };

  if (batchDelegatedRootReleases) {
    withBatchedDelegatedRootReleases(disposeRecordScopes);
  } else {
    disposeRecordScopes();
  }

  return firstError;
}

function disposeRecords(
  records: Iterable<SingleNodeRecord>,
  batchDelegatedRootReleases: boolean,
): void {
  if (batchDelegatedRootReleases) {
    withBatchedDelegatedRootReleases(() => {
      for (const record of records) {
        disposeSingleNodeRecord(record);
      }
    });
    return;
  }

  for (const record of records) {
    disposeSingleNodeRecord(record);
  }
}

function disposeSingleNodeRecord(record: SingleNodeRecord | undefined): void {
  if (record === undefined) {
    return;
  }

  let firstError: unknown;
  const compilerContext = record.compilerContext;
  if (compilerContext?.[compilerRowOwnsTextCleanup] === true) {
    try {
      disposeCompilerRowTextSubscriptions(compilerContext);
    } catch (error) {
      firstError = error;
    }
  }

  const scope = record.scope;
  if (scope !== undefined) {
    record.scope = undefined;
    try {
      disposeSingleNodeRecordScope(scope);
    } catch (error) {
      firstError ??= error;
    }
  }

  if (firstError !== undefined) {
    throw firstError;
  }
}

function disposeSingleNodeRecordScope(scope: DomScope): void {
  if (scope.disposed) {
    return;
  }

  scope.disposed = true;

  const disposers = scope.disposers;

  if (disposers === undefined || (Array.isArray(disposers) && disposers.length === 0)) {
    return;
  }

  scope.disposers = undefined;

  if (typeof disposers === "function") {
    disposers();
    return;
  }

  let firstError: unknown;

  for (let index = disposers.length - 1; index >= 0; index -= 1) {
    try {
      disposers[index]!();
    } catch (error) {
      firstError ??= error;
    }
  }

  if (firstError !== undefined) {
    throw firstError;
  }
}

function promoteRecordEvents(records: Iterable<SingleNodeRecord>): void {
  for (const record of records as Iterable<SingleNodeRecord & { promoteEvents?: () => void }>) {
    record.promoteEvents?.();
    delete record.promoteEvents;
  }
}

interface SelectedClassState {
  activeRecords: boolean;
  current: unknown;
  dispose: Dispose;
  matches: (selected: unknown, key: unknown) => boolean;
  preserveInitial: boolean;
  records: Map<unknown, Element>;
  recordsSource: () => Iterable<SingleNodeRecord>;
  sameSelection: (previous: unknown, next: unknown) => boolean;
  skipInitialUnselectedWrite: boolean;
  target?: (
    node: ChildNode,
    item: unknown,
    index: number,
    items: readonly unknown[],
  ) => Element | null;
  write: (element: Element, selected: boolean) => void;
}

function createSelectedClassState<T, TNode extends ChildNode>(
  options: InternalSelectedClassOptions<T, TNode>,
  recordsSource: () => Iterable<SingleNodeRecord>,
): SelectedClassState {
  const preserveInitial = options.preserveInitial === true;
  const compilerMode = options.compilerMode === "strict-replace";
  const state: SelectedClassState = {
    activeRecords: !preserveInitial,
    current: untrack(() => options.source.get()),
    dispose: () => {},
    matches: compilerMode ? (selected, key) => selected === key : Object.is,
    preserveInitial,
    records: new Map(),
    recordsSource,
    sameSelection: compilerMode
      ? (previous, next) =>
          previous === next ||
          (typeof previous === "number" &&
            typeof next === "number" &&
            Number.isNaN(previous) &&
            Number.isNaN(next))
      : Object.is,
    skipInitialUnselectedWrite: compilerMode && options.initialClassValue === "",
    write: compilerMode
      ? (element, selected) => {
          element.setAttribute("class", selected ? options.className : "");
        }
      : (element, selected) => {
          if (selected) {
            element.classList.add(options.className);
          } else {
            element.classList.remove(options.className);
          }
        },
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

  const directDispose = subscribeCell(options.source, (next) => {
    updateSelectedClassValue(state, next);
  });
  state.dispose =
    directDispose ??
    effect(() => {
      updateSelectedClassValue(state, options.source.get());
    });

  return state;
}

function activateSelectedClassRecords(state: SelectedClassState): void {
  if (state.activeRecords) {
    return;
  }

  state.activeRecords = true;

  for (const record of state.recordsSource()) {
    if (record.selectedClassElement !== undefined) {
      state.records.set(record.key, record.selectedClassElement);
    }
  }
}

function updateSelectedClassValue(state: SelectedClassState, next: unknown): void {
  if (state.sameSelection(state.current, next)) {
    return;
  }

  activateSelectedClassRecords(state);
  const previousElement = state.records.get(state.current);
  if (previousElement !== undefined && state.matches(state.current, state.current)) {
    state.write(previousElement, false);
  }
  state.current = next;
  const nextElement = state.records.get(next);
  if (nextElement !== undefined && state.matches(next, next)) {
    state.write(nextElement, true);
  }
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

  if (!state.activeRecords) {
    return;
  }

  state.records.set(record.key, element);

  if (state.preserveInitial) {
    return;
  }

  const selected = state.matches(state.current, record.key);
  if (!selected && state.skipInitialUnselectedWrite) {
    return;
  }

  state.write(element, selected);
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

  state.write(record.selectedClassElement, state.matches(state.current, record.key));
}

function shouldRefreshSelectedClassRecords(state: SelectedClassState | undefined): boolean {
  return state !== undefined && !state.preserveInitial;
}

function unregisterSelectedClassRecord(
  state: SelectedClassState | undefined,
  record: SingleNodeRecord | undefined,
): void {
  if (state === undefined || !state.activeRecords || record?.selectedClassElement === undefined) {
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
  if (state === undefined || !state.activeRecords) {
    return;
  }

  for (const record of records) {
    unregisterSelectedClassRecord(state, record);
  }
}

function clearSelectedClassRecords(state: SelectedClassState | undefined): void {
  if (state?.activeRecords === true) {
    state.records.clear();
  }
}
