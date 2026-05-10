const queuedHydrationEvents = new WeakMap<Element, QueuedHydrationEvent[]>();
const replayedEvents = new WeakSet<Event>();
const allowedReplayEventTypes = new Set(["click", "input", "change", "submit"]);

export interface EventHydrationManifest {
  version: 1;
  events: EventHydrationManifestEntry[];
}

export interface EventHydrationManifestEntry {
  id: string;
  event: string;
  handler: string;
}

interface QueuedHydrationEvent {
  target: EventTarget;
  event: Event;
}

export interface HydrationEventReplayOptions {
  onCapturedEvent?: (event: Event, target: EventTarget) => void;
}

export function queueHydrationEvent(
  container: Element,
  event: Event,
  target: EventTarget,
): void {
  if (
    !allowedReplayEventTypes.has(event.type) ||
    !(target instanceof Node) ||
    !container.contains(target)
  ) {
    return;
  }

  const events = queuedHydrationEvents.get(container) ?? [];
  events.push({ event, target });
  queuedHydrationEvents.set(container, events);
}

export function enableHydrationEventReplay(container: Element): () => void {
  return enableHydrationEventReplayForTypes(container, allowedReplayEventTypes);
}

export function readEventHydrationManifest(
  root: ParentNode = document,
): EventHydrationManifest | undefined {
  const script = root.querySelector<HTMLScriptElement>(
    "script[data-mreact-event-manifest]",
  );

  if (script === null) {
    return undefined;
  }

  const value = JSON.parse(script.textContent ?? "") as EventHydrationManifest;

  if (value.version !== 1 || !Array.isArray(value.events)) {
    return undefined;
  }

  return value;
}

export function enableEventHydrationManifestReplay(
  container: Element,
  manifest: EventHydrationManifest | undefined,
  options: HydrationEventReplayOptions = {},
): () => void {
  if (manifest === undefined) {
    return () => undefined;
  }

  const eventTypes = new Set(
    manifest.events
      .map((event) => event.event)
      .filter((event) => allowedReplayEventTypes.has(event)),
  );

  return enableHydrationEventReplayForTypes(container, eventTypes, options);
}

export function replayQueuedHydrationEvents(container: Element): void {
  const events = queuedHydrationEvents.get(container) ?? [];
  queuedHydrationEvents.delete(container);

  for (const { event, target } of events) {
    replayedEvents.add(event);
    target.dispatchEvent(event);
  }
}

function enableHydrationEventReplayForTypes(
  container: Element,
  eventTypes: Iterable<string>,
  options: HydrationEventReplayOptions = {},
): () => void {
  const listeners = Array.from(eventTypes, (type) => {
    const listener = (event: Event): void => {
      if (replayedEvents.has(event) || !(event.target instanceof Node)) {
        return;
      }

      const replayEvent = cloneReplayableEvent(event);
      queueHydrationEvent(container, replayEvent, event.target);
      options.onCapturedEvent?.(replayEvent, event.target);
      event.stopImmediatePropagation();
      event.preventDefault();
    };

    container.addEventListener(type, listener, true);
    return { type, listener };
  });

  return () => {
    for (const { type, listener } of listeners) {
      container.removeEventListener(type, listener, true);
    }
  };
}

function cloneReplayableEvent(event: Event): Event {
  const init = {
    bubbles: event.bubbles,
    cancelable: event.cancelable,
    composed: event.composed,
  };

  if (typeof MouseEvent !== "undefined" && event instanceof MouseEvent) {
    return new MouseEvent(event.type, {
      ...init,
      button: event.button,
      buttons: event.buttons,
      clientX: event.clientX,
      clientY: event.clientY,
      ctrlKey: event.ctrlKey,
      metaKey: event.metaKey,
      shiftKey: event.shiftKey,
      altKey: event.altKey,
    });
  }

  if (typeof InputEvent !== "undefined" && event instanceof InputEvent) {
    return new InputEvent(event.type, {
      ...init,
      data: event.data,
      inputType: event.inputType,
    });
  }

  return new Event(event.type, init);
}
