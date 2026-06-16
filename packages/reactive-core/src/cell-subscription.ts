import { getCellSource } from "./cell.js";
import { queueComputation } from "./scheduler.js";
import { runtimeState, type ReactiveComputation, type Source } from "./state.js";
import type { ReadonlyCell } from "./types.js";
import { addSourceSubscriber, removeSourceSubscriber } from "./tracking.js";

const emptyDeps = new Set<Source>();

export function subscribeCell<T>(
  cell: ReadonlyCell<T>,
  listener: (value: T) => void,
): (() => void) | undefined {
  const source = getCellSource(cell);

  if (source === undefined) {
    return undefined;
  }

  const computation: ReactiveComputation = {
    id: runtimeState.nextComputationId,
    deps: emptyDeps,
    disposed: false,
    queued: false,
    markDirty() {
      queueComputation(computation);
    },
    run() {
      if (computation.disposed) {
        return;
      }

      listener(cell.get());
    },
    dispose() {
      if (computation.disposed) {
        return;
      }

      computation.disposed = true;
      computation.queued = false;
      runtimeState.pendingComputed.delete(computation);
      removeSourceSubscriber(source, computation);
    },
  };

  runtimeState.nextComputationId += 1;
  addSourceSubscriber(source, computation);

  return computation.dispose;
}
