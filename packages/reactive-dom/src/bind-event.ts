import { registerDispose } from "./scope.js";
import type { Dispose } from "./types.js";

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

type EventElement = HTMLElement & {
  __mreactEventBindings?: EventBinding[];
  __mreactHasEvents?: true;
};

const delegatedEventTypes = " change click input keydown keyup pointerdown pointermove pointerup submit ";
const elementListeners = new WeakMap<HTMLElement, Map<string, EventListener[]>>();
const delegatedRoots = new WeakMap<EventTarget, Map<string, DelegatedRoot>>();

export function bindEvent<K extends keyof HTMLElementEventMap>(
  element: HTMLElement,
  type: K,
  handler: (event: HTMLElementEventMap[K]) => void,
  options?: BindEventOptions,
): Dispose {
  const listener = (event: Event) => {
    handler(event as HTMLElementEventMap[K]);
  };
  const useDelegation = options?.direct !== true && delegatedEventTypes.includes(` ${type} `);
  const eventElement = element as EventElement;

  eventElement.__mreactHasEvents = true;
  eventElement.__mreactEventBindings = [
    ...(eventElement.__mreactEventBindings ?? []),
    { delegated: useDelegation, listener, type },
  ];

  if (useDelegation) {
    return registerDispose(addDelegatedEventListener(element, type, listener));
  }

  element.addEventListener(type, listener);

  return registerDispose(() => element.removeEventListener(type, listener));
}

function addDelegatedEventListener(
  element: HTMLElement,
  type: string,
  listener: EventListener,
): Dispose {
  const root = element.ownerDocument;
  let listenersByType = elementListeners.get(element);

  if (listenersByType === undefined) {
    listenersByType = new Map();
    elementListeners.set(element, listenersByType);
  }

  let listeners = listenersByType.get(type);

  if (listeners === undefined) {
    listeners = [];
    listenersByType.set(type, listeners);
  }

  listeners.push(listener);
  retainDelegatedRoot(root, type);
  const disposeDisconnectedFallback = addDisconnectedFallback(element, type, listener);

  return () => {
    const currentListeners = elementListeners.get(element)?.get(type);
    const index = currentListeners?.indexOf(listener) ?? -1;

    if (index !== -1) {
      currentListeners?.splice(index, 1);
    }

    if (currentListeners?.length === 0) {
      elementListeners.get(element)?.delete(type);
    }

    releaseDelegatedRoot(root, type);
    disposeDisconnectedFallback();
  };
}

function addDisconnectedFallback(
  element: HTMLElement,
  type: string,
  listener: EventListener,
): Dispose {
  if (element.isConnected) {
    return () => {};
  }

  let active = true;
  let attached = true;
  const fallback = (event: Event) => {
    if (element.isConnected) {
      remove();
      return;
    }

    if (!element.isConnected) {
      listener.call(element, event);
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
  queueMicrotask(() => {
    if (active && element.isConnected) {
      remove();
    }
  });

  return () => {
    active = false;
    remove();
  };
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
  for (const target of event.composedPath()) {
    if (target === root) {
      break;
    }

    if (!(target instanceof HTMLElement)) {
      continue;
    }

    const listeners = elementListeners.get(target)?.get(type);

    if (listeners === undefined || listeners.length === 0) {
      continue;
    }

    const activeListeners = listeners.slice();

    for (const listener of activeListeners) {
      callWithCurrentTarget(listener, event, target);
    }

    if (event.cancelBubble) {
      break;
    }
  }
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
