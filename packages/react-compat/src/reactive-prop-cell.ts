import { batch } from "@reckona/mreact-reactive-core";
import {
  flushQueuedComputations,
  notifySubscribers,
  trackSource,
  type Source,
} from "@reckona/mreact-reactive-core/internal";
import type { ReactiveDomBlockResult } from "./element.js";

// A stable reactive box over a component's incoming props, analogous to the
// native keyed list's KeyedItemCell (packages/reactive-dom/src/bind-list.ts).
// A reactive-dom-block reads its props through a proxy backed by this cell;
// when the component re-renders with new props the reconciler swaps the cell's
// value and notifies, so bound text/attributes update without re-running the
// block's render closure or reconciling its subtree.
export interface ReactivePropCell {
  value: Record<string, unknown>;
  source: Source;
  propertySources?: Map<PropertyKey, Source> | undefined;
}

// What a reactive-dom-block fiber stores in stateNode: the committed node and
// its dispose, plus the prop cell when the block bridges component props.
export interface ReactiveDomBlockState extends ReactiveDomBlockResult {
  propCell?: ReactivePropCell | undefined;
}

let propCellBatchDepth = 0;
let propCellBatchNeedsFlush = false;

export function createReactivePropCell(props: Record<string, unknown>): ReactivePropCell {
  return { value: props, source: { subscribers: null } };
}

export function batchReactivePropCellUpdates<T>(run: () => T): T {
  propCellBatchDepth += 1;
  try {
    return batch(run);
  } finally {
    propCellBatchDepth -= 1;
    if (propCellBatchDepth === 0 && propCellBatchNeedsFlush) {
      propCellBatchNeedsFlush = false;
      flushQueuedComputations();
    }
  }
}

const PROP_PROXY_HANDLER: ProxyHandler<ReactivePropCell> = {
  get(cell, property) {
    trackSource(getReactivePropPropertySource(cell, property));
    return cell.value[property as string];
  },
  has(cell, property) {
    trackSource(getReactivePropPropertySource(cell, property));
    return property in cell.value;
  },
  ownKeys(cell) {
    trackSource(cell.source);
    return Reflect.ownKeys(cell.value);
  },
  getOwnPropertyDescriptor(cell, property) {
    trackSource(cell.source);
    return Reflect.getOwnPropertyDescriptor(cell.value, property);
  },
};

export function createReactivePropProxy<P extends object>(cell: ReactivePropCell): P {
  return new Proxy(cell, PROP_PROXY_HANDLER) as unknown as P;
}

function getReactivePropPropertySource(cell: ReactivePropCell, property: PropertyKey): Source {
  let propertySources = cell.propertySources;

  if (propertySources === undefined) {
    propertySources = new Map();
    cell.propertySources = propertySources;
  }

  let source = propertySources.get(property);

  if (source === undefined) {
    source = { subscribers: null };
    propertySources.set(property, source);
  }

  return source;
}

export function setReactivePropCell(
  cell: ReactivePropCell,
  next: Record<string, unknown>,
): void {
  if (Object.is(cell.value, next)) {
    return;
  }

  const previous = cell.value;
  const propertySources = cell.propertySources;
  let notified = false;

  cell.value = next;

  if (propertySources !== undefined) {
    for (const [property, source] of propertySources) {
      if (!Object.is(previous[property as string], next[property as string])) {
        notifySubscribers(source);
        notified = true;
      }
    }
  }

  if (cell.source.subscribers !== null) {
    notifySubscribers(cell.source);
    notified = true;
  }

  if (notified) {
    if (propCellBatchDepth === 0) {
      flushQueuedComputations();
    } else {
      propCellBatchNeedsFlush = true;
    }
  }
}
