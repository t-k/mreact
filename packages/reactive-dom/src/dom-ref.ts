import { registerDispose } from "./scope.js";
import type { Dispose } from "./types.js";

export type DomRefCallback = (element: Element) => void | Dispose;

export interface DomRefBinding {
  retarget(element: Element): void;
  dispose(): void;
}

interface InternalDomRefBinding extends DomRefBinding {
  commit(): void;
}

interface ElementWithDomRefBindings extends Element {
  __mreactDomRefBindings?: InternalDomRefBinding[] | undefined;
}

const pendingBindings = new Set<InternalDomRefBinding>();
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

  for (const binding of bindings) {
    binding.commit();
  }
}

function attachBinding(element: Element, binding: InternalDomRefBinding): void {
  const target = element as ElementWithDomRefBindings;
  const bindings = target.__mreactDomRefBindings;

  if (bindings === undefined) {
    Object.defineProperty(target, "__mreactDomRefBindings", {
      configurable: true,
      value: [binding],
      writable: true,
    });
    return;
  }

  if (!bindings.includes(binding)) {
    bindings.push(binding);
  }
}

function detachBinding(element: Element, binding: InternalDomRefBinding): void {
  const target = element as ElementWithDomRefBindings;
  const bindings = target.__mreactDomRefBindings;

  if (bindings === undefined) {
    return;
  }

  const index = bindings.indexOf(binding);

  if (index !== -1) {
    bindings.splice(index, 1);
  }

  if (bindings.length === 0) {
    delete target.__mreactDomRefBindings;
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
  registerDispose(binding.dispose);
  enqueue(binding);
  return binding;
}

/** Returns the sparse DOM ref metadata attached to one annotated element. */
export function getDomRefBindings(element: Element): readonly DomRefBinding[] {
  return (element as ElementWithDomRefBindings).__mreactDomRefBindings ?? [];
}
