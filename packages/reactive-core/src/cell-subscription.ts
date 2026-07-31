import { getCellSource } from "./cell.js";
import { queueComputation } from "./scheduler.js";
import { runtimeState, type ReactiveComputation, type Source } from "./state.js";
import type { ReadonlyCell } from "./types.js";
import { addSourceSubscriber } from "./tracking.js";

interface CellValueSource<T> extends Source {
  value: T;
}

interface CellSubscription<T> extends Omit<ReactiveComputation, "deps"> {
  listener: (value: T) => void;
  source: CellValueSource<T>;
}

const CELL_SUBSCRIPTION_COMPUTATION_METHODS = {
  markDirty: cellSubscriptionMarkDirty,
  run: cellSubscriptionRun,
  dispose: cellSubscriptionDispose,
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

function cellSubscriptionDispose(this: ReactiveComputation): void {
  const subscription = this as unknown as CellSubscription<unknown>;

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
  subscription: CellSubscription<unknown>,
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
