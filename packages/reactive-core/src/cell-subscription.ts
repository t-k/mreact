import { getCellSource } from "./cell.js";
import { queueComputation } from "./scheduler.js";
import { runtimeState, type ReactiveComputation, type Source } from "./state.js";
import type { ReadonlyCell } from "./types.js";
import { addSourceSubscriber } from "./tracking.js";

interface CellValueSource<T> extends Source {
  value: T;
}

interface CellSubscriptionBase<T> extends Omit<ReactiveComputation, "deps"> {
  source: CellValueSource<T>;
}

interface CellSubscription<T> extends CellSubscriptionBase<T> {
  listener: (value: T) => void;
}

interface CellValueSubscription<T, TValue> extends CellSubscriptionBase<T> {
  listener: (value: TValue, cellValue: T) => void;
  value: TValue;
}

const CELL_SUBSCRIPTION_COMPUTATION_METHODS = {
  markDirty: cellSubscriptionMarkDirty,
  run: cellSubscriptionRun,
  dispose: cellSubscriptionDispose,
} satisfies Pick<ReactiveComputation, "markDirty" | "run" | "dispose">;
const CELL_VALUE_SUBSCRIPTION_COMPUTATION_METHODS = {
  dispose: cellSubscriptionDispose,
  markDirty: cellSubscriptionMarkDirty,
  run: cellValueSubscriptionRun,
} satisfies Pick<ReactiveComputation, "markDirty" | "run" | "dispose">;

export function subscribeCell<T>(
  cell: ReadonlyCell<T>,
  listener: (value: T) => void,
): (() => void) | undefined {
  const source = getCellSource(cell) as CellValueSource<T> | undefined;

  if (source === undefined) {
    return undefined;
  }

  const computation: CellSubscription<T> = {
    dispose: CELL_SUBSCRIPTION_COMPUTATION_METHODS.dispose,
    disposed: false,
    id: runtimeState.nextComputationId,
    listener,
    markDirty: CELL_SUBSCRIPTION_COMPUTATION_METHODS.markDirty,
    queued: false,
    run: CELL_SUBSCRIPTION_COMPUTATION_METHODS.run,
    source,
  };

  runtimeState.nextComputationId += 1;
  addSourceSubscriber(source, computation as unknown as ReactiveComputation);

  return () => computation.dispose();
}

export function subscribeCellValue<T, TValue>(
  cell: ReadonlyCell<T>,
  listener: (value: TValue, cellValue: T) => void,
  value: TValue,
): (() => void) | undefined {
  const source = getCellSource(cell) as CellValueSource<T> | undefined;

  if (source === undefined) {
    return undefined;
  }

  const computation: CellValueSubscription<T, TValue> = {
    dispose: CELL_VALUE_SUBSCRIPTION_COMPUTATION_METHODS.dispose,
    disposed: false,
    id: runtimeState.nextComputationId,
    listener,
    markDirty: CELL_VALUE_SUBSCRIPTION_COMPUTATION_METHODS.markDirty,
    queued: false,
    run: CELL_VALUE_SUBSCRIPTION_COMPUTATION_METHODS.run,
    source,
    value,
  };

  runtimeState.nextComputationId += 1;
  addSourceSubscriber(source, computation as unknown as ReactiveComputation);

  return () => computation.dispose();
}

function cellSubscriptionMarkDirty(this: ReactiveComputation): void {
  queueComputation(this);
}

function cellSubscriptionRun(this: ReactiveComputation): void {
  const subscription = this as unknown as CellSubscription<unknown>;

  if (subscription.disposed) {
    return;
  }

  subscription.listener(subscription.source.value);
}

function cellValueSubscriptionRun(this: ReactiveComputation): void {
  const subscription = this as unknown as CellValueSubscription<unknown, unknown>;

  if (subscription.disposed) {
    return;
  }

  subscription.listener(subscription.value, subscription.source.value);
}

function cellSubscriptionDispose(this: ReactiveComputation): void {
  const subscription = this as unknown as CellSubscriptionBase<unknown>;

  if (subscription.disposed) {
    return;
  }

  subscription.disposed = true;
  if (subscription.queued) {
    subscription.queued = false;
    runtimeState.pendingComputed.delete(subscription as unknown as ReactiveComputation);
  }

  const source = subscription.source;
  const subscribers = source.subscribers;

  if ((subscribers as unknown) === subscription) {
    source.subscribers = null;
    const onNoSubscribers = source.onNoSubscribers;
    if (onNoSubscribers !== undefined) {
      onNoSubscribers();
    }
    return;
  }

  removeCellSubscriptionSourceSubscriber(subscription.source, subscription);
}

function removeCellSubscriptionSourceSubscriber(
  source: Source,
  subscription: CellSubscriptionBase<unknown>,
): void {
  const subscribers = source.subscribers;
  const computation = subscription as unknown as ReactiveComputation;
  const current = subscribers as unknown;

  if (current === subscription) {
    source.subscribers = null;
    const onNoSubscribers = source.onNoSubscribers;
    if (onNoSubscribers !== undefined) {
      onNoSubscribers();
    }
    return;
  }

  if (!(subscribers instanceof Set) || !subscribers.delete(computation)) {
    return;
  }

  if (subscribers.size === 0) {
    source.subscribers = null;
    const onNoSubscribers = source.onNoSubscribers;
    if (onNoSubscribers !== undefined) {
      onNoSubscribers();
    }
  }
}
