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
}

// What a reactive-dom-block fiber stores in stateNode: the committed node and
// its dispose, plus the prop cell when the block bridges component props.
export interface ReactiveDomBlockState extends ReactiveDomBlockResult {
  propCell?: ReactivePropCell | undefined;
}

export function createReactivePropCell(props: Record<string, unknown>): ReactivePropCell {
  return { value: props, source: { subscribers: null } };
}

const PROP_PROXY_HANDLER: ProxyHandler<ReactivePropCell> = {
  get(cell, property) {
    trackSource(cell.source);
    return cell.value[property as string];
  },
  has(cell, property) {
    trackSource(cell.source);
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

export function setReactivePropCell(
  cell: ReactivePropCell,
  next: Record<string, unknown>,
): void {
  if (Object.is(cell.value, next)) {
    return;
  }

  cell.value = next;

  if (cell.source.subscribers !== null) {
    notifySubscribers(cell.source);
    flushQueuedComputations();
  }
}
