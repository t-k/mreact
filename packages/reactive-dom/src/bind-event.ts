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

const delegatedEventTypes = " change click input keydown keyup pointerdown pointermove pointerup submit ";
const delegatedListenerPrefix = "__mreactDelegatedEvent$";
const delegatedRoots = new WeakMap<EventTarget, Map<string, DelegatedRoot>>();
const pendingDisconnectedPromotions = new Set<() => void>();
let disconnectedPromotionFlushQueued = false;

/** Binds an event handler to an element and returns a disposer. */
export function bindEvent<K extends keyof HTMLElementEventMap>(
  element: HTMLElement,
  type: K,
  handler: (event: HTMLElementEventMap[K]) => void,
  options?: BindEventOptions,
): Dispose {
  const listener = handler as EventListener;
  const useDelegation = options?.direct !== true && delegatedEventTypes.includes(` ${type} `);
  const eventElement = element as EventElement;
  const binding = { delegated: useDelegation, listener, type };

  eventElement.__mreactHasEvents = true;
  const bindings = eventElement.__mreactEventBindings;
  if (bindings === undefined) {
    eventElement.__mreactEventBindings = binding;
  } else if (Array.isArray(bindings)) {
    bindings.push(binding);
  } else {
    eventElement.__mreactEventBindings = [bindings, binding];
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
  const rootsByType = delegatedRoots.get(root);
  const current = rootsByType?.get(type);

  if (rootsByType === undefined || current === undefined) {
    return;
  }

  current.count -= 1;

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
