import { runWithEventPriority } from "./hooks.js";
import {
  getAppliedEventHandler,
  restoreAppliedControlledFormState,
} from "./event-listeners.js";
import type { SyntheticEvent } from "./event-types.js";

const delegatedRootListeners = new WeakMap<Element, Set<string>>();
const nonDelegatedRootCaptureListeners = new WeakMap<Element, Set<string>>();
const nonDelegatedElementListeners = new WeakMap<
  Element,
  Map<string, { eventRoot: Element; listener: EventListener }>
>();
// A synthetic update can mount another delegated root before the native event
// finishes bubbling. Track both the delegated root and handlers already visited.
const dispatchedDelegatedEvents = new WeakMap<Event, Map<string, WeakSet<Element>>>();
const dispatchedDelegatedHandlers = new WeakMap<Event, WeakMap<Element, Set<string>>>();
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

const nonDelegatedEventDescriptors = [
  ["abort", "onAbort"],
  ["beforetoggle", "onBeforeToggle"],
  ["cancel", "onCancel"],
  ["canplay", "onCanPlay"],
  ["canplaythrough", "onCanPlayThrough"],
  ["close", "onClose"],
  ["durationchange", "onDurationChange"],
  ["emptied", "onEmptied"],
  ["encrypted", "onEncrypted"],
  ["ended", "onEnded"],
  ["error", "onError"],
  ["invalid", "onInvalid"],
  ["load", "onLoad"],
  ["loadeddata", "onLoadedData"],
  ["loadedmetadata", "onLoadedMetadata"],
  ["loadstart", "onLoadStart"],
  ["pause", "onPause"],
  ["play", "onPlay"],
  ["playing", "onPlaying"],
  ["progress", "onProgress"],
  ["ratechange", "onRateChange"],
  ["resize", "onResize"],
  ["scroll", "onScroll"],
  ["scrollend", "onScrollEnd"],
  ["seeked", "onSeeked"],
  ["seeking", "onSeeking"],
  ["stalled", "onStalled"],
  ["suspend", "onSuspend"],
  ["timeupdate", "onTimeUpdate"],
  ["toggle", "onToggle"],
  ["volumechange", "onVolumeChange"],
  ["waiting", "onWaiting"],
] as const;

const mediaEventNames = [
  "abort",
  "canplay",
  "canplaythrough",
  "durationchange",
  "emptied",
  "encrypted",
  "ended",
  "error",
  "loadeddata",
  "loadedmetadata",
  "loadstart",
  "pause",
  "play",
  "playing",
  "progress",
  "ratechange",
  "resize",
  "seeked",
  "seeking",
  "stalled",
  "suspend",
  "timeupdate",
  "volumechange",
  "waiting",
] as const;

const nonDelegatedEventNames = new Set<string>();
for (const [eventName, propName] of nonDelegatedEventDescriptors) {
  nonDelegatedEventNames.add(eventName);
  reactPropToNativeEvent.set(propName, [eventName]);
  nativeEventToReactProps.set(eventName, [propName]);
}

export function toEventNames(propName: string): string[] {
  const eventNames: string[] = [];
  forEachEventName(propName, (eventName) => {
    eventNames.push(eventName);
  });
  return eventNames;
}

export function forEachEventName(propName: string, callback: (eventName: string) => void): void {
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

export function ensureDelegatedEventListenersForProp(root: Element, propName: string): void {
  forEachEventName(propName, (eventName) => {
    if (!isNonDelegatedEventName(eventName)) {
      ensureDelegatedEventListener(root, eventName);
    }
  });
}

export function beginDirectEventListenerUpdate(element: Element): Set<string> | undefined {
  const listeners = nonDelegatedElementListeners.get(element);
  return listeners === undefined ? undefined : new Set(listeners.keys());
}

export function ensureEventListenersForProp(
  element: Element,
  eventRoot: Element,
  propName: string,
  staleDirectEventNames?: Set<string>,
): void {
  forEachEventName(propName, (eventName) => {
    if (isNonDelegatedEventName(eventName)) {
      ensureNonDelegatedEventListener(element, eventRoot, eventName, staleDirectEventNames);
      return;
    }

    ensureDelegatedEventListener(eventRoot, eventName);
  });
}

export function ensureMandatoryNonDelegatedElementListeners(
  element: Element,
  eventRoot: Element,
  props: Record<string, unknown>,
  staleDirectEventNames?: Set<string>,
): void {
  switch (element.localName) {
    case "dialog":
      ensureNonDelegatedEventListener(element, eventRoot, "beforetoggle", staleDirectEventNames);
      ensureNonDelegatedEventListener(element, eventRoot, "toggle", staleDirectEventNames);
      ensureNonDelegatedEventListener(element, eventRoot, "cancel", staleDirectEventNames);
      ensureNonDelegatedEventListener(element, eventRoot, "close", staleDirectEventNames);
      break;
    case "iframe":
    case "object":
      ensureNonDelegatedEventListener(element, eventRoot, "load", staleDirectEventNames);
      break;
    case "embed":
    case "source":
    case "link":
    case "img":
    case "image":
      ensureNonDelegatedEventListener(element, eventRoot, "error", staleDirectEventNames);
      ensureNonDelegatedEventListener(element, eventRoot, "load", staleDirectEventNames);
      break;
    case "video":
    case "audio":
      for (const eventName of mediaEventNames) {
        ensureNonDelegatedEventListener(element, eventRoot, eventName, staleDirectEventNames);
      }
      break;
    case "details":
      ensureNonDelegatedEventListener(element, eventRoot, "toggle", staleDirectEventNames);
      break;
    case "input":
    case "select":
    case "textarea":
      ensureNonDelegatedEventListener(element, eventRoot, "invalid", staleDirectEventNames);
      break;
  }

  if (props.popover !== null && props.popover !== undefined) {
    ensureNonDelegatedEventListener(element, eventRoot, "beforetoggle", staleDirectEventNames);
    ensureNonDelegatedEventListener(element, eventRoot, "toggle", staleDirectEventNames);
  }
}

export function finishDirectEventListenerUpdate(
  element: Element,
  staleDirectEventNames: Set<string> | undefined,
): void {
  if (staleDirectEventNames === undefined) {
    return;
  }

  for (const eventName of staleDirectEventNames) {
    removeNonDelegatedElementListener(element, eventName);
  }
}

export function disposeDirectEventListeners(element: Element): void {
  const listeners = nonDelegatedElementListeners.get(element);
  if (listeners === undefined) {
    return;
  }

  for (const [eventName, registration] of listeners) {
    element.removeEventListener(eventName, registration.listener);
  }
  nonDelegatedElementListeners.delete(element);
}

export function isNonDelegatedEventName(eventName: string): boolean {
  return nonDelegatedEventNames.has(eventName);
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

export function setLogicalEventParent(container: Element, parent: ParentNode): void {
  logicalEventParents.set(container, parent);
}

export function getEventPriority(eventName: string): "discrete" | "continuous" | "default" {
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

export function ensureDelegatedEventListener(root: Element, eventName: string): void {
  const listeners = delegatedRootListeners.get(root) ?? new Set<string>();

  if (listeners.has(eventName)) {
    return;
  }

  listeners.add(eventName);
  delegatedRootListeners.set(root, listeners);
  root.addEventListener(eventName, (event) => {
    if (hasDispatchedDelegatedEvent(root, event, eventName)) {
      return;
    }
    markDispatchedDelegatedEvent(root, event, eventName);
    const priority = getEventPriority(eventName);
    try {
      runWithEventPriority(priority, () => {
        dispatchDelegatedEvent(root, eventName, event);
      }, priority === "discrete" && shouldDeferDiscreteEventFlush(eventName) ? (flush) => {
        deferFlushUntilNativeEventComplete(root, event, flush);
      } : undefined);
    } finally {
      if (
        event.target instanceof Element &&
        isControlledRestoreEvent(eventName, event.target)
      ) {
        restoreAppliedControlledFormState(event.target);
      }
    }
  });
}

function ensureNonDelegatedRootCaptureListener(root: Element, eventName: string): void {
  const listeners = nonDelegatedRootCaptureListeners.get(root) ?? new Set<string>();
  if (listeners.has(eventName)) {
    return;
  }

  listeners.add(eventName);
  nonDelegatedRootCaptureListeners.set(root, listeners);
  root.addEventListener(
    eventName,
    (event) => {
      const priority = getEventPriority(eventName);
      runWithEventPriority(priority, () => {
        dispatchNonDelegatedCaptureEvent(root, eventName, event);
      });
    },
    true,
  );
}

function ensureNonDelegatedEventListener(
  element: Element,
  eventRoot: Element,
  eventName: string,
  staleDirectEventNames: Set<string> | undefined,
): void {
  staleDirectEventNames?.delete(eventName);
  ensureNonDelegatedRootCaptureListener(eventRoot, eventName);
  ensureNonDelegatedElementListener(element, eventRoot, eventName);
}

function ensureNonDelegatedElementListener(
  element: Element,
  eventRoot: Element,
  eventName: string,
): void {
  const listeners = nonDelegatedElementListeners.get(element) ?? new Map();
  const current = listeners.get(eventName);
  if (current?.eventRoot === eventRoot) {
    return;
  }
  if (current !== undefined) {
    element.removeEventListener(eventName, current.listener);
  }

  const listener = (event: Event): void => {
    if (event.target !== element) {
      return;
    }

    const priority = getEventPriority(eventName);
    runWithEventPriority(priority, () => {
      dispatchNonDelegatedBubbleEvent(eventRoot, eventName, event);
    });
  };
  listeners.set(eventName, { eventRoot, listener });
  nonDelegatedElementListeners.set(element, listeners);
  element.addEventListener(eventName, listener);
}

function removeNonDelegatedElementListener(element: Element, eventName: string): void {
  const listeners = nonDelegatedElementListeners.get(element);
  const registration = listeners?.get(eventName);
  if (listeners === undefined || registration === undefined) {
    return;
  }

  element.removeEventListener(eventName, registration.listener);
  listeners.delete(eventName);
  if (listeners.size === 0) {
    nonDelegatedElementListeners.delete(element);
  }
}

function shouldDeferDiscreteEventFlush(eventName: string): boolean {
  return eventName === "pointerdown" || eventName === "mousedown" || eventName === "touchstart";
}

function deferFlushUntilNativeEventComplete(
  root: Element,
  event: Event,
  flush: () => void,
): void {
  let flushed = false;
  const flushOnce = (): void => {
    if (flushed) {
      return;
    }
    flushed = true;
    flush();
  };

  root.ownerDocument.addEventListener(event.type, flushOnce, { once: true });
  queueMicrotask(flushOnce);
}

function hasDispatchedDelegatedEvent(root: Element, event: Event, eventName: string): boolean {
  return dispatchedDelegatedEvents.get(event)?.get(eventName)?.has(root) ?? false;
}

function markDispatchedDelegatedEvent(root: Element, event: Event, eventName: string): void {
  const events = dispatchedDelegatedEvents.get(event) ?? new Map<string, WeakSet<Element>>();
  const roots = events.get(eventName) ?? new WeakSet<Element>();
  roots.add(root);
  events.set(eventName, roots);
  dispatchedDelegatedEvents.set(event, events);
}

function dispatchNonDelegatedCaptureEvent(
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
    dispatchEventPropNames(propNames, "capture", event, path[index]!, state);
    if (state.propagationStopped) {
      return;
    }
  }
}

function dispatchNonDelegatedBubbleEvent(root: Element, eventName: string, event: Event): void {
  const path = getEventPath(root, event);
  const propNames = toEventPropNames(eventName);
  const state = {
    defaultPrevented: event.defaultPrevented,
    propagationStopped: false,
  };
  const bubblePath = eventName === "scroll" || eventName === "scrollend" ? path.slice(0, 1) : path;

  for (const target of bubblePath) {
    dispatchEventPropNames(propNames, "bubble", event, target, state);
    if (state.propagationStopped) {
      return;
    }
  }
}

function dispatchDelegatedEvent(root: Element, eventName: string, event: Event): void {
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

  dispatchEventHandlerOnce(propName, event, target, state, propName.slice(2).toLowerCase());
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
      ((event.type === "change" && isTextInputChangeTarget(target)) ||
        (event.type === "input" && isChangeEventControl(target)))
    ) {
      continue;
    }

    const listenerName = phase === "capture" ? `${propName}Capture` : propName;
    dispatchEventHandlerOnce(listenerName, event, target, state);

    if (state.propagationStopped) {
      return;
    }
  }
}

function isChangeEventControl(target: Element): boolean {
  return (
    target instanceof HTMLSelectElement ||
    (target instanceof HTMLInputElement && nonTextInputTypes.has(target.type))
  );
}

function isControlledRestoreEvent(eventName: string, target: Element): boolean {
  return (
    (eventName === "input" && isTextInputChangeTarget(target)) ||
    (eventName === "change" && isChangeEventControl(target))
  );
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

  dispatchEventHandlerOnce(propName, event, target, state);
}

function dispatchEventHandlerOnce(
  propName: string,
  event: Event,
  target: Element,
  state: { defaultPrevented: boolean; propagationStopped: boolean },
  syntheticType = event.type,
): void {
  const handler = getAppliedEventHandler(target, propName);
  if (handler === undefined || hasDispatchedDelegatedHandler(event, target, propName)) {
    return;
  }

  markDispatchedDelegatedHandler(event, target, propName);
  handler(createSyntheticEvent(event, target, state, syntheticType));
}

function hasDispatchedDelegatedHandler(event: Event, target: Element, propName: string): boolean {
  return dispatchedDelegatedHandlers.get(event)?.get(target)?.has(propName) ?? false;
}

function markDispatchedDelegatedHandler(event: Event, target: Element, propName: string): void {
  const targets = dispatchedDelegatedHandlers.get(event) ?? new WeakMap<Element, Set<string>>();
  const propNames = targets.get(target) ?? new Set<string>();
  propNames.add(propName);
  targets.set(target, propNames);
  dispatchedDelegatedHandlers.set(event, targets);
}

function isInternalMouseTransition(event: Event, target: Element): boolean {
  const relatedTarget =
    event instanceof MouseEvent && event.relatedTarget instanceof Node ? event.relatedTarget : null;

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
  const pointerEvent =
    "pointerId" in nativeEvent || "pointerType" in nativeEvent
      ? (nativeEvent as PointerEvent)
      : undefined;
  const touchEvent =
    typeof TouchEvent !== "undefined" && nativeEvent instanceof TouchEvent
      ? nativeEvent
      : undefined;
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
    ...(pointerEvent === undefined
      ? {}
      : {
          pointerId: pointerEvent.pointerId,
          pointerType: pointerEvent.pointerType,
          isPrimary: pointerEvent.isPrimary,
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
