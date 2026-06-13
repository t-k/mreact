import { runWithEventPriority } from "./hooks.js";
import { getAppliedEventHandler } from "./event-listeners.js";
import type { SyntheticEvent } from "./event-types.js";

const delegatedRootListeners = new WeakMap<Element, Set<string>>();
// A synthetic update can mount another delegated root before the native event
// finishes bubbling. Process each native event once across delegated roots.
const dispatchedDelegatedEvents = new WeakMap<Event, Set<string>>();
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
  ["onDrag", ["drag"]],
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
  ["drag", ["onDrag"]],
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
  const eventNames: string[] = [];
  forEachEventName(propName, (eventName) => {
    eventNames.push(eventName);
  });
  return eventNames;
}

export function forEachEventName(
  propName: string,
  callback: (eventName: string) => void,
): void {
  const directEventName = directNativeEventName(propName);

  if (directEventName !== undefined) {
    callback(directEventName);
    return;
  }

  const basePropName = toBaseEventPropName(propName);
  const mappedEventNames = reactPropToNativeEvent.get(basePropName);

  if (mappedEventNames === undefined) {
    callback(basePropName.slice(2).toLowerCase());
    return;
  }

  for (let index = 0; index < mappedEventNames.length; index += 1) {
    callback(mappedEventNames[index]!);
  }
}

export function ensureDelegatedEventListenersForProp(
  root: Element,
  propName: string,
): void {
  const directEventName = directNativeEventName(propName);

  if (directEventName !== undefined) {
    ensureDelegatedEventListener(root, directEventName);
    return;
  }

  const basePropName = toBaseEventPropName(propName);
  const mappedEventNames = reactPropToNativeEvent.get(basePropName);

  if (mappedEventNames === undefined) {
    ensureDelegatedEventListener(root, basePropName.slice(2).toLowerCase());
    return;
  }

  for (let index = 0; index < mappedEventNames.length; index += 1) {
    ensureDelegatedEventListener(root, mappedEventNames[index]!);
  }
}

function directNativeEventName(propName: string): string | undefined {
  switch (propName) {
    case "onClick":
    case "onClickCapture":
      return "click";
    case "onInput":
    case "onInputCapture":
      return "input";
    case "onKeyDown":
    case "onKeyDownCapture":
      return "keydown";
    case "onKeyUp":
    case "onKeyUpCapture":
      return "keyup";
    case "onMouseDown":
    case "onMouseDownCapture":
      return "mousedown";
    case "onMouseMove":
    case "onMouseMoveCapture":
      return "mousemove";
    case "onMouseOut":
    case "onMouseOutCapture":
      return "mouseout";
    case "onMouseOver":
    case "onMouseOverCapture":
      return "mouseover";
    case "onMouseUp":
    case "onMouseUpCapture":
      return "mouseup";
    case "onScroll":
    case "onScrollCapture":
      return "scroll";
    case "onSubmit":
    case "onSubmitCapture":
      return "submit";
    case "onWheel":
    case "onWheelCapture":
      return "wheel";
    default:
      return undefined;
  }
}

function toBaseEventPropName(propName: string): string {
  const basePropName = propName.endsWith("Capture")
    ? propName.slice(0, -"Capture".length)
    : propName;
  return basePropName;
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
    if (hasDispatchedDelegatedEvent(event, eventName)) {
      return;
    }
    markDispatchedDelegatedEvent(event, eventName);
    runWithEventPriority(getEventPriority(eventName), () => {
      dispatchDelegatedEvent(root, eventName, event);
    });
  });
}

function hasDispatchedDelegatedEvent(event: Event, eventName: string): boolean {
  return dispatchedDelegatedEvents.get(event)?.has(eventName) ?? false;
}

function markDispatchedDelegatedEvent(event: Event, eventName: string): void {
  const events = dispatchedDelegatedEvents.get(event) ?? new Set<string>();
  events.add(eventName);
  dispatchedDelegatedEvents.set(event, events);
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
    if (
      propName === "onChange" &&
      event.type === "change" &&
      isTextInputChangeTarget(target)
    ) {
      continue;
    }

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

function isTextInputChangeTarget(target: Element): boolean {
  if (target instanceof HTMLTextAreaElement) {
    return true;
  }

  if (!(target instanceof HTMLInputElement)) {
    return false;
  }

  return !nonTextInputTypes.has(target.type);
}

const nonTextInputTypes = new Set([
  "button",
  "checkbox",
  "color",
  "file",
  "hidden",
  "image",
  "radio",
  "range",
  "reset",
  "submit",
]);

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

export function getEventPath(root: Element, event: Event): Element[] {
  const path: Element[] = [];
  const visited = new Set<Node>();
  let cursor = event.target instanceof Node ? event.target : null;

  while (cursor !== null) {
    if (visited.has(cursor)) {
      break;
    }
    visited.add(cursor);

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
  const mouseEvent = nativeEvent instanceof MouseEvent ? nativeEvent : undefined;
  const touchEvent = nativeEvent instanceof TouchEvent ? nativeEvent : undefined;
  const keyboardEvent = nativeEvent instanceof KeyboardEvent ? nativeEvent : undefined;

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
    ...(mouseEvent === undefined
      ? {}
      : {
          clientX: mouseEvent.clientX,
          clientY: mouseEvent.clientY,
          pageX: mouseEvent.pageX,
          pageY: mouseEvent.pageY,
          screenX: mouseEvent.screenX,
          screenY: mouseEvent.screenY,
          button: mouseEvent.button,
          buttons: mouseEvent.buttons,
          ctrlKey: mouseEvent.ctrlKey,
          shiftKey: mouseEvent.shiftKey,
          altKey: mouseEvent.altKey,
          metaKey: mouseEvent.metaKey,
          relatedTarget: mouseEvent.relatedTarget,
        }),
    ...(touchEvent === undefined
      ? {}
      : {
          touches: touchEvent.touches,
          changedTouches: touchEvent.changedTouches,
        }),
    ...(keyboardEvent === undefined ? {} : { key: keyboardEvent.key }),
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
