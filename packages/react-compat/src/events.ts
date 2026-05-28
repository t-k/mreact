import { runWithEventPriority } from "./hooks.js";
import { getAppliedEventHandler } from "./event-listeners.js";
import type { SyntheticEvent } from "./event-types.js";

const delegatedRootListeners = new WeakMap<Element, Set<string>>();
const logicalEventParents = new WeakMap<Element, ParentNode>();

const reactPropToNativeEvent = new Map<string, string[]>([
  ["onAnimationEnd", ["animationend"]],
  ["onAnimationIteration", ["animationiteration"]],
  ["onAnimationStart", ["animationstart"]],
  ["onBeforeInput", ["beforeinput"]],
  ["onCompositionEnd", ["compositionend"]],
  ["onCompositionStart", ["compositionstart"]],
  ["onCompositionUpdate", ["compositionupdate"]],
  ["onContextMenu", ["contextmenu"]],
  ["onDoubleClick", ["dblclick"]],
  ["onDragEnd", ["dragend"]],
  ["onDragEnter", ["dragenter"]],
  ["onDragExit", ["dragexit"]],
  ["onDragLeave", ["dragleave"]],
  ["onDragOver", ["dragover"]],
  ["onDragStart", ["dragstart"]],
  ["onDrop", ["drop"]],
  ["onFocus", ["focusin"]],
  ["onBlur", ["focusout"]],
  ["onGotPointerCapture", ["gotpointercapture"]],
  ["onLostPointerCapture", ["lostpointercapture"]],
  ["onMouseEnter", ["mouseover"]],
  ["onMouseLeave", ["mouseout"]],
  ["onPointerCancel", ["pointercancel"]],
  ["onPointerDown", ["pointerdown"]],
  ["onPointerEnter", ["pointerover"]],
  ["onPointerLeave", ["pointerout"]],
  ["onPointerMove", ["pointermove"]],
  ["onPointerOut", ["pointerout"]],
  ["onPointerOver", ["pointerover"]],
  ["onPointerUp", ["pointerup"]],
  ["onTouchCancel", ["touchcancel"]],
  ["onTouchEnd", ["touchend"]],
  ["onTouchMove", ["touchmove"]],
  ["onTouchStart", ["touchstart"]],
  ["onTransitionEnd", ["transitionend"]],
  ["onChange", ["change", "input"]],
]);

const nativeEventToReactProps = new Map<string, string[]>([
  ["animationend", ["onAnimationEnd"]],
  ["animationiteration", ["onAnimationIteration"]],
  ["animationstart", ["onAnimationStart"]],
  ["beforeinput", ["onBeforeInput"]],
  ["compositionend", ["onCompositionEnd"]],
  ["compositionstart", ["onCompositionStart"]],
  ["compositionupdate", ["onCompositionUpdate"]],
  ["contextmenu", ["onContextMenu"]],
  ["dblclick", ["onDoubleClick"]],
  ["dragend", ["onDragEnd"]],
  ["dragenter", ["onDragEnter"]],
  ["dragexit", ["onDragExit"]],
  ["dragleave", ["onDragLeave"]],
  ["dragover", ["onDragOver"]],
  ["dragstart", ["onDragStart"]],
  ["drop", ["onDrop"]],
  ["focusin", ["onFocus"]],
  ["focusout", ["onBlur"]],
  ["gotpointercapture", ["onGotPointerCapture"]],
  ["lostpointercapture", ["onLostPointerCapture"]],
  ["input", ["onInput", "onChange"]],
  ["keydown", ["onKeyDown"]],
  ["keyup", ["onKeyUp"]],
  ["mousedown", ["onMouseDown"]],
  ["mousemove", ["onMouseMove"]],
  ["mouseup", ["onMouseUp"]],
  ["mouseout", ["onMouseOut"]],
  ["mouseover", ["onMouseOver"]],
  ["pointercancel", ["onPointerCancel"]],
  ["pointerdown", ["onPointerDown"]],
  ["pointermove", ["onPointerMove"]],
  ["pointerout", ["onPointerOut"]],
  ["pointerover", ["onPointerOver"]],
  ["pointerup", ["onPointerUp"]],
  ["touchcancel", ["onTouchCancel"]],
  ["touchend", ["onTouchEnd"]],
  ["touchmove", ["onTouchMove"]],
  ["touchstart", ["onTouchStart"]],
  ["transitionend", ["onTransitionEnd"]],
]);

export function toEventNames(propName: string): string[] {
  const basePropName = propName.endsWith("Capture")
    ? propName.slice(0, -"Capture".length)
    : propName;
  return reactPropToNativeEvent.get(basePropName) ?? [
    basePropName.slice(2).toLowerCase(),
  ];
}

export function toEventPropNames(eventName: string): string[] {
  const propNames = nativeEventToReactProps.get(eventName);
  if (propNames !== undefined) {
    return propNames;
  }
  const propName = `on${eventName.slice(0, 1).toUpperCase()}${eventName.slice(1)}`;
  return [propName];
}

export function setLogicalEventParent(
  container: Element,
  parent: ParentNode,
): void {
  logicalEventParents.set(container, parent);
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
    const target = path[index]!;
    dispatchEventPropNames(propNames, "capture", event, target, state);

    if (state.propagationStopped) {
      return;
    }
  }

  if (eventName === "mouseover") {
    for (let index = path.length - 1; index >= 0; index -= 1) {
      const target = path[index]!;
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

  if (eventName === "pointerover") {
    for (let index = path.length - 1; index >= 0; index -= 1) {
      const target = path[index]!;
      dispatchPointerTransitionEvent("onPointerEnter", event, target, state);

      if (state.propagationStopped) {
        return;
      }
    }
  }

  if (eventName === "pointerout") {
    for (const target of path) {
      dispatchPointerTransitionEvent("onPointerLeave", event, target, state);

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

function dispatchPointerTransitionEvent(
  propName: "onPointerEnter" | "onPointerLeave",
  event: Event,
  target: Element,
  state: { defaultPrevented: boolean; propagationStopped: boolean },
): void {
  if (isInternalMouseTransition(event, target)) {
    return;
  }

  const handler = getAppliedEventHandler(target, propName);

  if (handler !== undefined) {
    handler(createSyntheticEvent(event, target, state, propName.slice(2).toLowerCase()));
  }
}

function dispatchEventPropNames(
  propNames: readonly string[],
  phase: "capture" | "bubble",
  event: Event,
  target: Element,
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
  target: Element,
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

function isInternalMouseTransition(event: Event, target: Element): boolean {
  const relatedTarget =
    event instanceof MouseEvent && event.relatedTarget instanceof Node
      ? event.relatedTarget
      : null;

  return relatedTarget !== null && target.contains(relatedTarget);
}

function getEventPath(root: Element, event: Event): Element[] {
  const path: Element[] = [];
  let cursor = event.target instanceof Node ? event.target : null;

  while (cursor !== null) {
    if (cursor instanceof Element) {
      path.push(cursor);
    }

    if (cursor === root) {
      const logicalParent = logicalEventParents.get(root);
      if (logicalParent === undefined) {
        break;
      }
      cursor = logicalParent;
      continue;
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
  syntheticType = nativeEvent.type,
): SyntheticEvent {
  return {
    bubbles: nativeEvent.bubbles,
    cancelable: nativeEvent.cancelable,
    get defaultPrevented() {
      return state.defaultPrevented;
    },
    eventPhase: nativeEvent.eventPhase,
    isTrusted: nativeEvent.isTrusted ?? false,
    nativeEvent,
    timeStamp: nativeEvent.timeStamp,
    type: syntheticType,
    target: nativeEvent.target,
    currentTarget,
    persist() {},
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
    isPersistent() {
      return true;
    },
    isPropagationStopped() {
      return state.propagationStopped;
    },
  };
}
