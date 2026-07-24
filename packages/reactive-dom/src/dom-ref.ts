import { registerCleanup } from "@reckona/mreact-reactive-core/internal";
import { registerIdempotentDispose } from "./scope.js";
import type { Dispose } from "./types.js";

export type DomRefCallback = (element: Element) => void | Dispose;

export interface DomRefBinding {
  retarget(element: Element): void;
  dispose(): void;
}

interface InternalDomRefBinding extends DomRefBinding {
  commit(): void;
}

const pendingBindings = new Set<InternalDomRefBinding>();
const bindingsByElement = new WeakMap<Element, Set<InternalDomRefBinding>>();
let commitScheduled = false;

function enqueue(binding: InternalDomRefBinding): void {
  pendingBindings.add(binding);

  if (commitScheduled) {
    return;
  }

  commitScheduled = true;
  queueMicrotask(commitPendingBindings);
}

function commitPendingBindings(): void {
  commitScheduled = false;
  const bindings = Array.from(pendingBindings);
  pendingBindings.clear();
  let firstError: unknown;

  for (const binding of bindings) {
    try {
      binding.commit();
    } catch (error) {
      firstError ??= error;
    }
  }

  if (firstError !== undefined) {
    queueMicrotask(() => {
      throw firstError;
    });
  }
}

function attachBinding(element: Element, binding: InternalDomRefBinding): void {
  const bindings = bindingsByElement.get(element) ?? new Set();
  bindings.add(binding);
  bindingsByElement.set(element, bindings);
}

function detachBinding(element: Element, binding: InternalDomRefBinding): void {
  const bindings = bindingsByElement.get(element);

  if (bindings === undefined) {
    return;
  }

  bindings.delete(binding);

  if (bindings.size === 0) {
    bindingsByElement.delete(element);
  }
}

/** Runs a DOM callback after its element is connected and owns its cleanup. */
export function bindDomRef(
  element: Element,
  callback: DomRefCallback,
): DomRefBinding {
  let state: "pending" | "committed" | "disposed" = "pending";
  let target = element;
  let cleanup: Dispose | undefined;

  const binding: InternalDomRefBinding = {
    commit() {
      if (state !== "pending" || !target.isConnected) {
        return;
      }

      state = "committed";
      cleanup = callback(target) || undefined;
    },
    dispose() {
      if (state === "disposed") {
        return;
      }

      state = "disposed";
      pendingBindings.delete(binding);
      detachBinding(target, binding);
      const disposeCleanup = cleanup;
      cleanup = undefined;
      disposeCleanup?.();
    },
    retarget(element) {
      if (state === "disposed" || target === element) {
        return;
      }

      detachBinding(target, binding);
      const disposeCleanup = cleanup;
      cleanup = undefined;
      target = element;
      attachBinding(target, binding);

      if (state === "committed") {
        state = "pending";
        try {
          disposeCleanup?.();
        } finally {
          enqueue(binding);
        }
        return;
      }

      enqueue(binding);
    },
  };

  attachBinding(element, binding);
  registerIdempotentDispose(binding.dispose);
  registerCleanup(binding.dispose);
  enqueue(binding);
  return binding;
}

/** Returns the DOM ref bindings owned by one annotated element. */
export function getDomRefBindings(element: Element): readonly DomRefBinding[] {
  return Array.from(bindingsByElement.get(element) ?? []);
}
