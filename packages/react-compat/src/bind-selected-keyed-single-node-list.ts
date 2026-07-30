import { cell, effect, untrack } from "@reckona/mreact-reactive-core";
import {
  notifySubscribers,
  trackSource,
  type Source,
} from "@reckona/mreact-reactive-core/internal";
import { bindStaticKeyedSingleNodeList, type Dispose } from "@reckona/mreact-reactive-dom";

/** Internal row state used by compat compiler-generated keyed renderers. */
export interface SelectedKeyedRowContext<T> {
  readonly index: number;
  readonly item: T;
  readonly items: readonly T[];
}

/** Internal options used by compat compiler-generated selected keyed lists. */
export interface BindSelectedKeyedSingleNodeListOptions<T> {
  key: (item: T, index: number, items: readonly T[]) => unknown;
  selectedClass: {
    className: string;
    selected: () => unknown;
  };
}

const contextIndex = Symbol("contextIndex");
const contextItem = Symbol("contextItem");
const contextItems = Symbol("contextItems");
const contextKey = Symbol("contextKey");
const contextReads = Symbol("contextReads");
const contextSource = Symbol("contextSource");
const noStrictEqualityMatch = Symbol("noStrictEqualityMatch");

interface InternalSelectedKeyedRowContext extends SelectedKeyedRowContext<unknown> {
  [contextIndex]: number;
  [contextItem]: unknown;
  [contextItems]: readonly unknown[];
  [contextKey]: unknown;
  [contextReads]: number;
  [contextSource]?: Source | undefined;
}

const selectedKeyedRowContextPrototype: SelectedKeyedRowContext<unknown> = {
  get index(): number {
    const context = this as InternalSelectedKeyedRowContext;
    context[contextReads] |= 2;
    trackSource(ensureContextSource(context));
    return context[contextIndex];
  },
  get item(): unknown {
    const context = this as InternalSelectedKeyedRowContext;
    context[contextReads] |= 1;
    trackSource(ensureContextSource(context));
    return context[contextItem];
  },
  get items(): readonly unknown[] {
    const context = this as InternalSelectedKeyedRowContext;
    context[contextReads] |= 4;
    trackSource(ensureContextSource(context));
    return context[contextItems];
  },
};

/** Binds compat compiler-generated keyed rows and updates only the selected row classes. */
export function bindSelectedKeyedSingleNodeList<T, TNode extends ChildNode>(
  parent: ParentNode,
  marker: ChildNode,
  items: () => readonly T[],
  renderItem: (context: SelectedKeyedRowContext<T>) => TNode,
  options: BindSelectedKeyedSingleNodeListOptions<T>,
): Dispose {
  let contextsByKey = new Map<unknown, InternalSelectedKeyedRowContext>();
  let previousItems: readonly T[] | undefined;
  let previousContexts: readonly InternalSelectedKeyedRowContext[] = [];
  const selected = cell(normalizeStrictEqualitySelection(untrack(options.selectedClass.selected)));
  const disposeSelected = effect(() => {
    selected.set(normalizeStrictEqualitySelection(options.selectedClass.selected()));
  });

  const readContexts = (): readonly InternalSelectedKeyedRowContext[] => {
    const currentItems = items();

    if (Object.is(currentItems, previousItems)) {
      return previousContexts;
    }

    const availableContexts = new Map(contextsByKey);
    const nextContexts: InternalSelectedKeyedRowContext[] = [];
    const nextContextsByKey = new Map<unknown, InternalSelectedKeyedRowContext>();

    for (let index = 0; index < currentItems.length; index += 1) {
      const item = currentItems[index] as T;
      const key = normalizeStrictEqualityKey(options.key(item, index, currentItems));
      const context =
        availableContexts.get(key) ?? createSelectedKeyedRowContext(key, item, index, currentItems);

      availableContexts.delete(key);
      updateSelectedKeyedRowContext(context, item, index, currentItems);
      nextContexts.push(context);
      nextContextsByKey.set(key, context);
    }

    contextsByKey = nextContextsByKey;
    previousItems = currentItems;
    previousContexts = nextContexts;
    return nextContexts;
  };

  try {
    const disposeList = bindStaticKeyedSingleNodeList(
      parent,
      marker,
      readContexts,
      (context) => renderItem(context as SelectedKeyedRowContext<T>),
      {
        key: (context) => context[contextKey],
        selectedClass: {
          className: options.selectedClass.className,
          source: selected,
        },
      },
    );

    return () => {
      disposeList();
      disposeSelected();
      contextsByKey.clear();
      previousContexts = [];
      previousItems = undefined;
    };
  } catch (error) {
    disposeSelected();
    throw error;
  }
}

function normalizeStrictEqualityKey(value: unknown): unknown {
  return typeof value === "number" && value === 0 ? 0 : value;
}

function normalizeStrictEqualitySelection(value: unknown): unknown {
  return typeof value === "number" && Number.isNaN(value)
    ? noStrictEqualityMatch
    : normalizeStrictEqualityKey(value);
}

function createSelectedKeyedRowContext<T>(
  key: unknown,
  item: T,
  index: number,
  items: readonly T[],
): InternalSelectedKeyedRowContext {
  const context = Object.create(
    selectedKeyedRowContextPrototype,
  ) as InternalSelectedKeyedRowContext;
  context[contextIndex] = index;
  context[contextItem] = item;
  context[contextItems] = items;
  context[contextKey] = key;
  context[contextReads] = 0;
  return context;
}

function updateSelectedKeyedRowContext<T>(
  context: InternalSelectedKeyedRowContext,
  item: T,
  index: number,
  items: readonly T[],
): void {
  const reads = context[contextReads];
  const changed =
    ((reads & 1) !== 0 && !Object.is(context[contextItem], item)) ||
    ((reads & 2) !== 0 && context[contextIndex] !== index) ||
    ((reads & 4) !== 0 && context[contextItems] !== items);

  context[contextItem] = item;
  context[contextIndex] = index;
  context[contextItems] = items;

  const source = context[contextSource];
  if (changed && source !== undefined && source.subscribers !== null) {
    notifySubscribers(source);
  }
}

function ensureContextSource(context: InternalSelectedKeyedRowContext): Source {
  return (context[contextSource] ??= { subscribers: null });
}
