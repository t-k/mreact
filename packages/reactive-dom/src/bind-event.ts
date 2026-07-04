import { registerDispose } from "./scope.js";
import type { Dispose } from "./types.js";

/** Options for binding DOM events through the reactive DOM runtime. */
export interface BindEventOptions {
  direct?: boolean;
}

interface EventBinding {
  delegated: boolean;
  listener: EventListener;
  type: string;
}

interface DelegatedRoot {
  count: number;
  listener: EventListener;
}

type DelegatedListenerStore = EventListener | EventListener[];

type EventElement = HTMLElement & {
  __mreactEventBindings?: EventBinding | EventBinding[];
  __mreactHasEvents?: true;
};
type DeferredDelegatedEventPromotion = () => void;
interface DeferredDelegatedEventPromotionContext {
  promotions?: DeferredDelegatedEventPromotion[] | undefined;
}

const delegatedEventTypes = " change click input keydown keyup pointerdown pointermove pointerup submit ";
const delegatedListenerPrefix = "__mreactDelegatedEvent$";
const delegatedRoots = new WeakMap<EventTarget, Map<string, DelegatedRoot>>();
const pendingDisconnectedPromotions = new Set<() => void>();
let currentDeferredDelegatedEventPromotions:
  | DeferredDelegatedEventPromotionContext
  | undefined;
let currentDelegatedRootReleaseBatch:
  | Map<EventTarget, Record<string, number>>
  | undefined;
let disconnectedPromotionFlushQueued = false;
let eventBindingMetadataDepth = 0;

export function withEventBindingMetadata<T>(fn: () => T): T {
  eventBindingMetadataDepth += 1;

  try {
    return fn();
  } finally {
    eventBindingMetadataDepth -= 1;
  }
}

export function withDeferredDelegatedEventPromotions<T>(fn: () => T): {
  promote?: () => void;
  value: T;
} {
  const previousPromotions = currentDeferredDelegatedEventPromotions;
  const context: DeferredDelegatedEventPromotionContext = {};
  currentDeferredDelegatedEventPromotions = context;

  try {
    const value = fn();
    const promotions = context.promotions;

    if (promotions === undefined) {
      return { value };
    }

    return {
      promote: () => {
        for (const promote of promotions) {
          promote();
        }
      },
      value,
    };
  } finally {
    currentDeferredDelegatedEventPromotions = previousPromotions;
  }
}

export function withBatchedDelegatedRootReleases<T>(fn: () => T): T {
  const previousBatch = currentDelegatedRootReleaseBatch;
  const batch = previousBatch ?? new Map<EventTarget, Record<string, number>>();

  currentDelegatedRootReleaseBatch = batch;

  try {
    return fn();
  } finally {
    currentDelegatedRootReleaseBatch = previousBatch;

    if (previousBatch === undefined) {
      flushDelegatedRootReleaseBatch(batch);
    }
  }
}

/** Binds an event handler to an element and returns a disposer. */
export function bindEvent<K extends keyof HTMLElementEventMap>(
  element: HTMLElement,
  type: K,
  handler: (event: HTMLElementEventMap[K]) => void,
  options?: BindEventOptions,
): Dispose {
  const listener = handler as EventListener;
  const useDelegation = options?.direct !== true && delegatedEventTypes.includes(` ${type} `);
  const eventElement = eventBindingMetadataDepth > 0 ? (element as EventElement) : undefined;
  const binding =
    eventElement === undefined ? undefined : { delegated: useDelegation, listener, type };

  if (eventElement !== undefined && binding !== undefined) {
    eventElement.__mreactHasEvents = true;
    const bindings = eventElement.__mreactEventBindings;
    if (bindings === undefined) {
      eventElement.__mreactEventBindings = binding;
    } else if (Array.isArray(bindings)) {
      bindings.push(binding);
    } else {
      eventElement.__mreactEventBindings = [bindings, binding];
    }
  }

  let disposeListener: Dispose;
  if (useDelegation) {
    disposeListener = addDelegatedEventListener(element, type, listener);
  } else {
    element.addEventListener(type, listener);
    disposeListener = () => element.removeEventListener(type, listener);
  }

  return registerDispose(() => {
    disposeListener();

    if (eventElement === undefined || binding === undefined) {
      return;
    }

    const currentBindings = eventElement.__mreactEventBindings;

    if (Array.isArray(currentBindings)) {
      const index = currentBindings.indexOf(binding);

      if (index !== -1) {
        currentBindings.splice(index, 1);
      }

      if (currentBindings.length === 1) {
        eventElement.__mreactEventBindings = currentBindings[0]!;
        return;
      }

      if (currentBindings.length > 0) {
        return;
      }
    } else if (currentBindings !== binding) {
      return;
    }

    delete eventElement.__mreactEventBindings;
    delete eventElement.__mreactHasEvents;
  });
}

function addDelegatedEventListener(
  element: HTMLElement,
  type: string,
  listener: EventListener,
): Dispose {
  addElementDelegatedListener(element, type, listener);

  if (element.isConnected) {
    const root = element.ownerDocument;
    retainDelegatedRoot(root, type);

    return () => {
      removeDelegatedElementListener(element, type, listener);
      releaseDelegatedRoot(root, type);
    };
  }

  let delegatedRoot: EventTarget | undefined;

  const retainCurrentRoot = () => {
    if (delegatedRoot !== undefined) {
      return;
    }

    delegatedRoot = element.ownerDocument;
    retainDelegatedRoot(delegatedRoot, type);
  };
  const disposeDeferredPromotion = addDeferredDelegatedEventPromotion(
    element,
    type,
    listener,
    retainCurrentRoot,
  );

  if (disposeDeferredPromotion !== undefined) {
    return () => {
      removeDelegatedElementListener(element, type, listener);
      disposeDeferredPromotion();
    };
  }

  const disposeDisconnectedFallback = addDisconnectedFallback(
    element,
    type,
    listener,
    retainCurrentRoot,
  );

  return () => {
    removeDelegatedElementListener(element, type, listener);

    if (delegatedRoot !== undefined) {
      releaseDelegatedRoot(delegatedRoot, type);
    }

    disposeDisconnectedFallback();
  };
}

function addDeferredDelegatedEventPromotion(
  element: HTMLElement,
  type: string,
  listener: EventListener,
  retainCurrentRoot: () => void,
): Dispose | undefined {
  const context = currentDeferredDelegatedEventPromotions;

  if (context === undefined) {
    return undefined;
  }

  const promotions = (context.promotions ??= []);

  let active = true;
  let delegatedRoot: EventTarget | undefined;
  let disposeDisconnectedFallback: Dispose | undefined;
  const promote = () => {
    if (!active || delegatedRoot !== undefined) {
      return;
    }

    if (element.isConnected) {
      delegatedRoot = element.ownerDocument;
      retainDelegatedRoot(delegatedRoot, type);
      disposeDisconnectedFallback?.();
      disposeDisconnectedFallback = undefined;
      return;
    }

    disposeDisconnectedFallback ??= addDisconnectedFallback(
      element,
      type,
      listener,
      retainCurrentRoot,
    );
  };
  promotions.push(promote);

  return () => {
    active = false;
    disposeDisconnectedFallback?.();
    disposeDisconnectedFallback = undefined;

    if (delegatedRoot !== undefined) {
      releaseDelegatedRoot(delegatedRoot, type);
    }
  };
}

function removeDelegatedElementListener(
  element: HTMLElement,
  type: string,
  listener: EventListener,
): void {
  const store = delegatedListenerStore(element);
  const key = delegatedListenerKey(type);
  const current = store[key];

  if (current === undefined) {
    return;
  }

  if (typeof current === "function") {
    if (current === listener) {
      delete store[key];
    }
    return;
  }

  const index = current.indexOf(listener);

  if (index === -1) {
    return;
  }

  current.splice(index, 1);

  if (current.length === 0) {
    delete store[key];
  } else if (current.length === 1) {
    store[key] = current[0];
  }
}

function addDisconnectedFallback(
  element: HTMLElement,
  type: string,
  listener: EventListener,
  retainCurrentRoot: () => void,
): Dispose {
  let active = true;
  let attached = true;
  let promotionQueued = false;
  const promote = () => {
    if (!active || !element.isConnected) {
      return;
    }

    retainCurrentRoot();
    remove();
  };
  const queuePromotion = () => {
    if (promotionQueued) {
      return;
    }

    promotionQueued = true;
    enqueueDisconnectedPromotion(() => {
      promotionQueued = false;
      promote();
    });
  };
  const fallback = (event: Event) => {
    if (!active) {
      return;
    }

    listener.call(element, event);

    if (element.isConnected) {
      queuePromotion();
    }
  };
  const remove = () => {
    if (!attached) {
      return;
    }

    attached = false;
    element.removeEventListener(type, fallback);
  };

  element.addEventListener(type, fallback);
  queuePromotion();

  return () => {
    active = false;
    remove();
  };
}

function enqueueMicrotask(callback: () => void): void {
  if (typeof queueMicrotask === "function") {
    queueMicrotask(callback);
    return;
  }

  void Promise.resolve().then(callback);
}

function enqueueDisconnectedPromotion(callback: () => void): void {
  pendingDisconnectedPromotions.add(callback);

  if (disconnectedPromotionFlushQueued) {
    return;
  }

  disconnectedPromotionFlushQueued = true;
  enqueueMicrotask(flushDisconnectedPromotions);
}

function flushDisconnectedPromotions(): void {
  disconnectedPromotionFlushQueued = false;
  const promotions = Array.from(pendingDisconnectedPromotions);
  pendingDisconnectedPromotions.clear();

  for (const promote of promotions) {
    promote();
  }
}

function retainDelegatedRoot(root: EventTarget, type: string): void {
  let rootsByType = delegatedRoots.get(root);

  if (rootsByType === undefined) {
    rootsByType = new Map();
    delegatedRoots.set(root, rootsByType);
  }

  const current = rootsByType.get(type);

  if (current !== undefined) {
    current.count += 1;
    return;
  }

  const listener = (event: Event) => dispatchDelegatedEvent(root, type, event);
  rootsByType.set(type, { count: 1, listener });
  root.addEventListener(type, listener);
}

function releaseDelegatedRoot(root: EventTarget, type: string): void {
  const batch = currentDelegatedRootReleaseBatch;

  if (batch !== undefined) {
    let releasesByType = batch.get(root);

    if (releasesByType === undefined) {
      releasesByType = Object.create(null) as Record<string, number>;
      batch.set(root, releasesByType);
    }

    releasesByType[type] = (releasesByType[type] ?? 0) + 1;
    return;
  }

  releaseDelegatedRootCount(root, type, 1);
}

function flushDelegatedRootReleaseBatch(
  batch: Map<EventTarget, Record<string, number>>,
): void {
  for (const [root, releasesByType] of batch) {
    for (const [type, count] of Object.entries(releasesByType)) {
      releaseDelegatedRootCount(root, type, count);
    }
  }
}

function releaseDelegatedRootCount(
  root: EventTarget,
  type: string,
  count: number,
): void {
  const rootsByType = delegatedRoots.get(root);
  const current = rootsByType?.get(type);

  if (rootsByType === undefined || current === undefined) {
    return;
  }

  current.count -= count;

  if (current.count > 0) {
    return;
  }

  root.removeEventListener(type, current.listener);
  rootsByType.delete(type);
}

function dispatchDelegatedEvent(root: EventTarget, type: string, event: Event): void {
  const key = delegatedListenerKey(type);

  for (const target of event.composedPath()) {
    if (target === root) {
      break;
    }

    if (!(target instanceof HTMLElement)) {
      continue;
    }

    const listeners = delegatedListenerStore(target)[key];

    if (listeners === undefined) {
      continue;
    }

    if (typeof listeners === "function") {
      callWithCurrentTarget(listeners, event, target);
    } else {
      const activeListeners = listeners.slice();

      for (const listener of activeListeners) {
        callWithCurrentTarget(listener, event, target);
      }
    }

    if (event.cancelBubble) {
      break;
    }
  }
}

function addElementDelegatedListener(
  element: HTMLElement,
  type: string,
  listener: EventListener,
): void {
  const store = delegatedListenerStore(element);
  const key = delegatedListenerKey(type);
  const current = store[key];

  if (current === undefined) {
    store[key] = listener;
  } else if (typeof current === "function") {
    store[key] = [current, listener];
  } else {
    current.push(listener);
  }
}

function delegatedListenerKey(type: string): string {
  return `${delegatedListenerPrefix}${type}`;
}

function delegatedListenerStore(
  element: HTMLElement,
): Record<string, DelegatedListenerStore | undefined> {
  return element as unknown as Record<string, DelegatedListenerStore | undefined>;
}

function callWithCurrentTarget(
  listener: EventListener,
  event: Event,
  currentTarget: HTMLElement,
): void {
  const descriptor = Object.getOwnPropertyDescriptor(event, "currentTarget");

  Object.defineProperty(event, "currentTarget", {
    configurable: true,
    value: currentTarget,
  });

  try {
    listener.call(currentTarget, event);
  } finally {
    if (descriptor === undefined) {
      delete (event as { currentTarget?: EventTarget | null }).currentTarget;
    } else {
      Object.defineProperty(event, "currentTarget", descriptor);
    }
  }
}
