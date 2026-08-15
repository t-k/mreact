const queuedHydrationEvents = new WeakMap<Element, QueuedHydrationEvent[]>();
const replayedEvents = new WeakSet<Event>();
const allowedReplayEventTypes = new Set(["click", "input", "change", "submit"]);

/** Serialized map of server-rendered event handlers used for hydration replay. */
export interface EventHydrationManifest {
  version: 1;
  events: EventHydrationManifestEntry[];
}

/** Single event handler entry in a hydration replay manifest. */
export interface EventHydrationManifestEntry {
  id: string;
  event: string;
  handler: string;
}

interface QueuedHydrationEvent {
  target: EventTarget;
  event: Event;
  identity: QueuedHydrationTargetIdentity | undefined;
}

interface QueuedHydrationTargetIdentity {
  id: string | undefined;
}

export interface HydrationEventReplayOptions {
  onCapturedEvent?: (event: Event, target: EventTarget) => void;
}

/** Queues a captured event so it can be replayed after hydration. */
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
  events.push({
    event,
    target,
    identity: captureHydrationTargetIdentity(target),
  });
  queuedHydrationEvents.set(container, events);
}

/** Captures supported events on a container until hydration can replay them. */
export function enableHydrationEventReplay(container: Element): () => void {
  return enableHydrationEventReplayForTypes(container, allowedReplayEventTypes);
}

/** Reads an event hydration manifest script from a document or parent node. */
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

/** Captures only the event types declared by a hydration manifest. */
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
    if (!(target instanceof Node) || !container.contains(target)) {
      continue;
    }

    replayedEvents.add(event);
    target.dispatchEvent(event);
  }
}

export function retargetQueuedHydrationEvents(
  container: Element,
  replacementRoots: readonly Node[],
): void {
  const events = queuedHydrationEvents.get(container);
  if (events === undefined) return;

  for (const queued of events) {
    if (queued.identity?.id === undefined) {
      continue;
    }

    const matches = findElementsByExactId(replacementRoots, queued.identity.id);
    if (matches.length === 1) {
      queued.target = matches[0]!;
    }
  }
}

function captureHydrationTargetIdentity(
  target: EventTarget,
): QueuedHydrationTargetIdentity | undefined {
  if (!(target instanceof Element)) {
    return undefined;
  }

  const id = target.getAttribute("id") ?? undefined;
  return { id: id === "" ? undefined : id };
}

function findElementsByExactId(roots: readonly Node[], id: string): Element[] {
  const matches: Element[] = [];
  for (const root of roots) {
    if (!(root instanceof Element)) {
      continue;
    }
    if (root.getAttribute("id") === id) {
      matches.push(root);
    }
    for (const candidate of root.querySelectorAll<Element>("[id]")) {
      if (candidate.getAttribute("id") === id) {
        matches.push(candidate);
      }
    }
  }
  return matches;
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
