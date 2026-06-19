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
  propertySnapshots?: Map<PropertyKey, ShallowObjectSnapshot> | undefined;
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
    const value = Reflect.get(cell.value, property);
    rememberReactivePropObjectSnapshot(cell, property, value);
    return value;
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

interface ShallowObjectSnapshot {
  value: object;
  entries: Map<PropertyKey, unknown>;
}

function rememberReactivePropObjectSnapshot(
  cell: ReactivePropCell,
  property: PropertyKey,
  value: unknown,
): void {
  if (!isObjectLike(value)) {
    cell.propertySnapshots?.delete(property);
    return;
  }

  let snapshots = cell.propertySnapshots;
  if (snapshots === undefined) {
    snapshots = new Map();
    cell.propertySnapshots = snapshots;
  }

  snapshots.set(property, createShallowObjectSnapshot(value));
}

function createShallowObjectSnapshot(value: object): ShallowObjectSnapshot {
  const entries = new Map<PropertyKey, unknown>();
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Reflect.getOwnPropertyDescriptor(value, key);
    if (descriptor !== undefined && "value" in descriptor) {
      entries.set(key, descriptor.value);
    }
  }

  return { value, entries };
}

function isObjectLike(value: unknown): value is object {
  return (typeof value === "object" && value !== null) || typeof value === "function";
}

function hasShallowObjectSnapshotChanged(
  snapshot: ShallowObjectSnapshot | undefined,
  nextValue: unknown,
): boolean {
  if (snapshot === undefined || snapshot.value !== nextValue || !isObjectLike(nextValue)) {
    return false;
  }

  for (const key of Reflect.ownKeys(nextValue)) {
    const descriptor = Reflect.getOwnPropertyDescriptor(nextValue, key);
    if (descriptor !== undefined && "value" in descriptor) {
      if (!snapshot.entries.has(key) || !Object.is(snapshot.entries.get(key), descriptor.value)) {
        return true;
      }
    }
  }

  for (const key of snapshot.entries.keys()) {
    const descriptor = Reflect.getOwnPropertyDescriptor(nextValue, key);
    if (descriptor === undefined || !("value" in descriptor)) {
      return true;
    }
  }

  return false;
}

function shouldNotifyReactivePropProperty(
  previous: Record<string, unknown>,
  next: Record<string, unknown>,
  property: PropertyKey,
  snapshot: ShallowObjectSnapshot | undefined,
): boolean {
  if ((property in previous) !== (property in next)) {
    return true;
  }

  const previousValue = Reflect.get(previous, property);
  const nextValue = Reflect.get(next, property);
  return !Object.is(previousValue, nextValue) ||
    hasShallowObjectSnapshotChanged(snapshot, nextValue);
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
      if (
        shouldNotifyReactivePropProperty(
          previous,
          next,
          property,
          cell.propertySnapshots?.get(property),
        )
      ) {
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
