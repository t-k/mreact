import { runWithEventPriority } from "./hooks.js";
import { getAppliedEventHandler } from "./event-listeners.js";
import type { SyntheticEvent } from "./event-types.js";

const delegatedRootListeners = new WeakMap<Element, Set<string>>();

export function toEventNames(propName: string): string[] {
  const rawName = propName.slice(2);
  const eventName = rawName.endsWith("Capture")
    ? rawName.slice(0, -"Capture".length).toLowerCase()
    : rawName.toLowerCase();

  if (eventName === "doubleclick") {
    return ["dblclick"];
  }

  if (eventName === "focus") {
    return ["focusin"];
  }

  if (eventName === "blur") {
    return ["focusout"];
  }

  if (eventName === "mouseenter") {
    return ["mouseover"];
  }

  if (eventName === "mouseleave") {
    return ["mouseout"];
  }

  if (eventName === "change") {
    return ["change", "input"];
  }

  return [eventName];
}

export function toEventPropNames(eventName: string): string[] {
  if (eventName === "dblclick") {
    return ["onDoubleClick"];
  }

  if (eventName === "focusin") {
    return ["onFocus"];
  }

  if (eventName === "focusout") {
    return ["onBlur"];
  }

  if (eventName === "input") {
    return ["onChange"];
  }

  if (eventName === "mouseover") {
    return ["onMouseOver"];
  }

  if (eventName === "mouseout") {
    return ["onMouseOut"];
  }

  if (eventName === "mousemove") {
    return ["onMouseMove"];
  }

  if (eventName === "mousedown") {
    return ["onMouseDown"];
  }

  if (eventName === "mouseup") {
    return ["onMouseUp"];
  }

  if (eventName === "pointermove") {
    return ["onPointerMove"];
  }

  if (eventName === "pointerdown") {
    return ["onPointerDown"];
  }

  if (eventName === "pointerup") {
    return ["onPointerUp"];
  }

  if (eventName === "keydown") {
    return ["onKeyDown"];
  }

  if (eventName === "keyup") {
    return ["onKeyUp"];
  }

  const propName = `on${eventName.slice(0, 1).toUpperCase()}${eventName.slice(1)}`;
  return [propName];
}

export function getEventPriority(
  eventName: string,
): "discrete" | "continuous" | "default" {
  if (discreteEventNames.has(eventName)) {
    return "discrete";
  }

  if (continuousEventNames.has(eventName)) {
    return "continuous";
  }

  return "default";
}

const discreteEventNames = new Set([
  "beforeinput",
  "change",
  "click",
  "dblclick",
  "focusin",
  "focusout",
  "input",
  "keydown",
  "keyup",
  "mousedown",
  "mouseup",
  "pointerdown",
  "pointerup",
  "submit",
  "touchcancel",
  "touchend",
  "touchstart",
]);

const continuousEventNames = new Set([
  "drag",
  "dragenter",
  "dragleave",
  "dragover",
  "mousemove",
  "mouseout",
  "mouseover",
  "pointermove",
  "pointerout",
  "pointerover",
  "scroll",
  "touchmove",
  "wheel",
]);

export function ensureDelegatedEventListener(
  root: Element,
  eventName: string,
): void {
  const listeners = delegatedRootListeners.get(root) ?? new Set<string>();

  if (listeners.has(eventName)) {
    return;
  }

  listeners.add(eventName);
  delegatedRootListeners.set(root, listeners);
  root.addEventListener(eventName, (event) => {
    runWithEventPriority(getEventPriority(eventName), () => {
      dispatchDelegatedEvent(root, eventName, event);
    });
  });
}

function dispatchDelegatedEvent(
  root: Element,
  eventName: string,
  event: Event,
): void {
  const path = getEventPath(root, event);
  const propNames = toEventPropNames(eventName);
  const state = {
    defaultPrevented: event.defaultPrevented,
    propagationStopped: false,
  };

  for (let index = path.length - 1; index >= 0; index -= 1) {
    const target = path[index] as HTMLElement;
    dispatchEventPropNames(propNames, "capture", event, target, state);

    if (state.propagationStopped) {
      return;
    }
  }

  if (eventName === "mouseover") {
    for (let index = path.length - 1; index >= 0; index -= 1) {
      const target = path[index] as HTMLElement;
      dispatchMouseTransitionEvent("onMouseEnter", event, target, state);

      if (state.propagationStopped) {
        return;
      }
    }
  }

  if (eventName === "mouseout") {
    for (const target of path) {
      dispatchMouseTransitionEvent("onMouseLeave", event, target, state);

      if (state.propagationStopped) {
        return;
      }
    }
  }

  for (const target of path) {
    dispatchEventPropNames(propNames, "bubble", event, target, state);

    if (state.propagationStopped) {
      return;
    }
  }
}

function dispatchEventPropNames(
  propNames: readonly string[],
  phase: "capture" | "bubble",
  event: Event,
  target: HTMLElement,
  state: { defaultPrevented: boolean; propagationStopped: boolean },
): void {
  for (const propName of propNames) {
    const listenerName = phase === "capture" ? `${propName}Capture` : propName;
    const handler = getAppliedEventHandler(target, listenerName);

    if (handler !== undefined) {
      handler(createSyntheticEvent(event, target, state));
    }

    if (state.propagationStopped) {
      return;
    }
  }
}

function dispatchMouseTransitionEvent(
  propName: "onMouseEnter" | "onMouseLeave",
  event: Event,
  target: HTMLElement,
  state: { defaultPrevented: boolean; propagationStopped: boolean },
): void {
  if (isInternalMouseTransition(event, target)) {
    return;
  }

  const handler = getAppliedEventHandler(target, propName);

  if (handler !== undefined) {
    handler(createSyntheticEvent(event, target, state));
  }
}

function isInternalMouseTransition(event: Event, target: HTMLElement): boolean {
  const relatedTarget =
    event instanceof MouseEvent && event.relatedTarget instanceof Node
      ? event.relatedTarget
      : null;

  return relatedTarget !== null && target.contains(relatedTarget);
}

function getEventPath(root: Element, event: Event): HTMLElement[] {
  const path: HTMLElement[] = [];
  let cursor = event.target instanceof Node ? event.target : null;

  while (cursor !== null) {
    if (cursor instanceof HTMLElement) {
      path.push(cursor);
    }

    if (cursor === root) {
      break;
    }

    cursor = cursor.parentNode;
  }

  return path;
}

function createSyntheticEvent(
  nativeEvent: Event,
  currentTarget: EventTarget,
  state: { defaultPrevented: boolean; propagationStopped: boolean } = {
    defaultPrevented: nativeEvent.defaultPrevented,
    propagationStopped: false,
  },
): SyntheticEvent {
  return {
    nativeEvent,
    type: nativeEvent.type,
    target: nativeEvent.target,
    currentTarget,
    preventDefault() {
      state.defaultPrevented = true;
      nativeEvent.preventDefault();
    },
    stopPropagation() {
      state.propagationStopped = true;
      nativeEvent.stopPropagation();
    },
    isDefaultPrevented() {
      return state.defaultPrevented;
    },
    isPropagationStopped() {
      return state.propagationStopped;
    },
  };
}
