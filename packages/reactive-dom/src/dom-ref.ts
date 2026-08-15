import { registerCleanup } from "@reckona/mreact-reactive-core/internal";
import { registerIdempotentDispose } from "./scope.js";
import type { Dispose } from "./types.js";

declare const process: { env: { NODE_ENV?: string | undefined } } | undefined;

export type DomRefCallback = (element: Element) => void | Dispose;

export interface DomRefBinding {
  retarget(element: Element): void;
  dispose(): void;
}

interface InternalDomRefBinding extends DomRefBinding {
  commit(): void;
}

interface PendingConnection {
  attempts: number;
  binding: WeakRef<InternalDomRefBinding>;
  delay: number;
  documents: Set<Document>;
  nextPollAt: number;
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
// Automatic adoption does not notify the source document. A shared backoff poll
// discovers moves into documents that were not reachable when the ref was bound.
const pendingConnectionPolls = new Set<PendingConnection>();
let pendingConnectionPoll: ReturnType<typeof setTimeout> | undefined;
let pendingConnectionPollAt: number | undefined;
const INITIAL_CONNECTION_POLL_DELAY = 16;
const MAX_CONNECTION_POLL_DELAY = 250;
const MAX_CONNECTION_POLL_ATTEMPTS = 8;
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
    attempts: 0,
    binding: new WeakRef(binding),
    delay: INITIAL_CONNECTION_POLL_DELAY,
    documents: new Set(),
    nextPollAt: Date.now() + INITIAL_CONNECTION_POLL_DELAY,
  };

  for (const observedDocument of documents) {
    const observer = pendingConnectionObserver(observedDocument);
    if (observer === undefined) {
      continue;
    }

    observer.pending.add(pending);
    pending.documents.add(observedDocument);
  }

  pendingConnectionsByBinding.set(binding, pending);
  pendingConnectionPolls.add(pending);
  pendingConnectionFinalizer?.register(binding, pending, binding);
  schedulePendingConnectionPoll(pending.nextPollAt);
}

function schedulePendingConnectionPoll(candidatePollAt?: number): void {
  if (pendingConnectionPolls.size === 0) {
    return;
  }

  if (
    candidatePollAt !== undefined &&
    pendingConnectionPoll !== undefined &&
    pendingConnectionPollAt !== undefined &&
    pendingConnectionPollAt <= candidatePollAt
  ) {
    return;
  }

  let nextPollAt = candidatePollAt ?? Number.POSITIVE_INFINITY;
  if (candidatePollAt === undefined) {
    for (const pending of pendingConnectionPolls) {
      nextPollAt = Math.min(nextPollAt, pending.nextPollAt);
    }
  }

  if (
    pendingConnectionPoll !== undefined &&
    pendingConnectionPollAt !== undefined &&
    pendingConnectionPollAt <= nextPollAt
  ) {
    return;
  }

  if (pendingConnectionPoll !== undefined) {
    clearTimeout(pendingConnectionPoll);
  }

  pendingConnectionPollAt = nextPollAt;
  pendingConnectionPoll = setTimeout(
    () => {
      pendingConnectionPoll = undefined;
      pendingConnectionPollAt = undefined;
      const now = Date.now();
      const bindings: InternalDomRefBinding[] = [];
      const attempted: Array<{
        binding: InternalDomRefBinding;
        pending: PendingConnection;
      }> = [];

      for (const pending of Array.from(pendingConnectionPolls)) {
        if (pending.nextPollAt > now) {
          continue;
        }

        const binding = pending.binding.deref();
        if (binding === undefined) {
          removePendingConnection(pending);
        } else {
          pending.attempts += 1;
          bindings.push(binding);
          attempted.push({ binding, pending });
        }
      }

      commitBindings(bindings);

      for (const { binding, pending } of attempted) {
        if (!pendingConnectionPolls.has(pending)) {
          continue;
        }

        if (pending.attempts >= MAX_CONNECTION_POLL_ATTEMPTS) {
          dropPendingConnection(binding, pending);
          warnDroppedPendingConnection();
          continue;
        }

        pending.delay = Math.min(pending.delay * 2, MAX_CONNECTION_POLL_DELAY);
        pending.nextPollAt = now + pending.delay;
      }

      schedulePendingConnectionPoll();
    },
    Math.max(0, nextPollAt - Date.now()),
  );
  (pendingConnectionPoll as ReturnType<typeof setTimeout> & { unref?: () => void }).unref?.();
}

function dropPendingConnection(binding: InternalDomRefBinding, pending: PendingConnection): void {
  pendingConnectionsByBinding.delete(binding);
  pendingConnectionFinalizer?.unregister(binding);
  removePendingConnection(pending);
}

function warnDroppedPendingConnection(): void {
  if (typeof process !== "undefined" && process.env.NODE_ENV === "production") {
    return;
  }

  console.warn("[mreact] A domRef target never connected and was dropped after bounded retries.");
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
  pendingConnectionPolls.delete(pending);
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
  if (pendingConnectionPolls.size === 0 && pendingConnectionPoll !== undefined) {
    clearTimeout(pendingConnectionPoll);
    pendingConnectionPoll = undefined;
    pendingConnectionPollAt = undefined;
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
