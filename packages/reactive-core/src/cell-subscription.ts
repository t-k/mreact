import { getCellSource } from "./cell.js";
import { queueComputation } from "./scheduler.js";
import { runtimeState, type ReactiveComputation, type Source } from "./state.js";
import type { ReadonlyCell } from "./types.js";
import { addSourceSubscriber, removeSourceSubscriber } from "./tracking.js";

const emptyDeps = new Set<Source>();

interface CellSubscription<T> extends ReactiveComputation {
  cell: ReadonlyCell<T>;
  listener: (value: T) => void;
  source: Source;
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
  const source = getCellSource(cell);

  if (source === undefined) {
    return undefined;
  }

  const computation: CellSubscription<T> = {
    ...CELL_SUBSCRIPTION_COMPUTATION_METHODS,
    cell,
    id: runtimeState.nextComputationId,
    deps: emptyDeps,
    disposed: false,
    listener,
    queued: false,
    source,
  };

  runtimeState.nextComputationId += 1;
  addSourceSubscriber(source, computation);

  return () => computation.dispose();
}

function cellSubscriptionMarkDirty(this: ReactiveComputation): void {
  queueComputation(this);
}

function cellSubscriptionRun(this: ReactiveComputation): void {
  const subscription = this as CellSubscription<unknown>;

  if (subscription.disposed) {
    return;
  }

  subscription.listener(subscription.cell.get());
}

function cellSubscriptionDispose(this: ReactiveComputation): void {
  const subscription = this as CellSubscription<unknown>;

  if (subscription.disposed) {
    return;
  }

  subscription.disposed = true;
  subscription.queued = false;
  runtimeState.pendingComputed.delete(subscription);
  removeSourceSubscriber(subscription.source, subscription);
}
