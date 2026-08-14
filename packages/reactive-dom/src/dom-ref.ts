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

interface PendingConnection {
  binding: WeakRef<InternalDomRefBinding>;
  documents: Set<Document>;
}

interface PendingConnectionObserver {
  document: Document;
  observer: MutationObserver;
  pending: Set<PendingConnection>;
}

const pendingBindings = new Set<InternalDomRefBinding>();
const bindingsByElement = new WeakMap<Element, Set<InternalDomRefBinding>>();
// A detached subtree may connect many tasks after its initial commit. Observe
// document mutations instead of polling, and keep the waiting binding weak so
// an abandoned subtree can still be collected without an explicit dispose.
const pendingConnectionsByBinding = new WeakMap<InternalDomRefBinding, PendingConnection>();
const pendingConnectionObservers = new WeakMap<Document, PendingConnectionObserver>();
const pendingConnectionFinalizer =
  typeof FinalizationRegistry === "undefined"
    ? undefined
    : new FinalizationRegistry<PendingConnection>((pending) => {
        removePendingConnection(pending);
      });
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
  commitBindings(bindings);
}

function commitBindings(bindings: readonly InternalDomRefBinding[]): void {
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

function waitForConnection(binding: InternalDomRefBinding, element: Element): void {
  if (pendingConnectionsByBinding.has(binding) || typeof WeakRef === "undefined") {
    return;
  }

  const documents = new Set<Document>([element.ownerDocument]);
  if (typeof document !== "undefined") {
    documents.add(document);
  }

  const pending: PendingConnection = {
    binding: new WeakRef(binding),
    documents: new Set(),
  };

  for (const observedDocument of documents) {
    const observer = pendingConnectionObserver(observedDocument);
    if (observer === undefined) {
      continue;
    }

    observer.pending.add(pending);
    pending.documents.add(observedDocument);
  }

  if (pending.documents.size === 0) {
    return;
  }

  pendingConnectionsByBinding.set(binding, pending);
  pendingConnectionFinalizer?.register(binding, pending, binding);
}

function pendingConnectionObserver(
  observedDocument: Document,
): PendingConnectionObserver | undefined {
  const existing = pendingConnectionObservers.get(observedDocument);
  if (existing !== undefined) {
    return existing;
  }

  const MutationObserverConstructor =
    observedDocument.defaultView?.MutationObserver ??
    (typeof MutationObserver === "undefined" ? undefined : MutationObserver);
  if (MutationObserverConstructor === undefined) {
    return undefined;
  }

  let state: PendingConnectionObserver;
  const observer = new MutationObserverConstructor(() => {
    const bindings: InternalDomRefBinding[] = [];

    for (const pending of Array.from(state.pending)) {
      const binding = pending.binding.deref();
      if (binding === undefined) {
        removePendingConnection(pending);
      } else {
        bindings.push(binding);
      }
    }

    commitBindings(bindings);
  });
  state = {
    document: observedDocument,
    observer,
    pending: new Set(),
  };
  observer.observe(observedDocument, { childList: true, subtree: true });
  pendingConnectionObservers.set(observedDocument, state);
  return state;
}

function stopWaitingForConnection(binding: InternalDomRefBinding): void {
  const pending = pendingConnectionsByBinding.get(binding);
  if (pending === undefined) {
    return;
  }

  pendingConnectionsByBinding.delete(binding);
  pendingConnectionFinalizer?.unregister(binding);
  removePendingConnection(pending);
}

function removePendingConnection(pending: PendingConnection): void {
  for (const observedDocument of pending.documents) {
    const state = pendingConnectionObservers.get(observedDocument);
    if (state === undefined) {
      continue;
    }

    state.pending.delete(pending);
    if (state.pending.size === 0) {
      state.observer.disconnect();
      pendingConnectionObservers.delete(state.document);
    }
  }

  pending.documents.clear();
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
export function bindDomRef(element: Element, callback: DomRefCallback): DomRefBinding {
  let state: "pending" | "committed" | "disposed" = "pending";
  let target = element;
  let cleanup: Dispose | undefined;

  const binding: InternalDomRefBinding = {
    commit() {
      if (state !== "pending") {
        return;
      }

      if (!target.isConnected) {
        waitForConnection(binding, target);
        return;
      }

      stopWaitingForConnection(binding);
      state = "committed";
      cleanup = callback(target) || undefined;
    },
    dispose() {
      if (state === "disposed") {
        return;
      }

      state = "disposed";
      pendingBindings.delete(binding);
      stopWaitingForConnection(binding);
      detachBinding(target, binding);
      const disposeCleanup = cleanup;
      cleanup = undefined;
      disposeCleanup?.();
    },
    retarget(element) {
      if (state === "disposed" || target === element) {
        return;
      }

      stopWaitingForConnection(binding);
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
