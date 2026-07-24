import { effect } from "@reckona/mreact-reactive-core";
import { isEventLikePropName } from "@reckona/mreact-shared";
import { bindEvent } from "./bind-event.js";
import {
  applyDomProp,
  registerReactivePropBinding,
  removeDomProp,
  type PropBinding,
} from "./dom-prop-application.js";
import type { Dispose } from "./types.js";

/** Binds a reactive object of spread props to an element. */
export function bindSpreadProps(
  element: HTMLElement,
  props: () => Record<string, unknown> | null | undefined,
): Dispose {
  let target: Element = element;
  const previousProps = new Map<string, unknown>();
  const eventDisposers = new Map<string, Dispose>();

  const createTrackedApplyEffect = (): Dispose =>
    effect(() => {
      applySpreadProps(target, props(), previousProps, eventDisposers);
    });
  let disposeEffect = createTrackedApplyEffect();
  const binding: PropBinding = {
    dispose() {
      disposeEffect();
      clearSpreadProps(target, previousProps, eventDisposers);
    },
    retarget(nextElement) {
      const previousTarget = target;
      target = nextElement;

      clearSpreadProps(previousTarget, previousProps, eventDisposers);
      disposeEffect();
      disposeEffect = createTrackedApplyEffect();
    },
  };

  return registerReactivePropBinding(element, binding);
}

function applySpreadProps(
  element: Element,
  nextProps: Record<string, unknown> | null | undefined,
  previousProps: Map<string, unknown>,
  eventDisposers: Map<string, Dispose>,
): void {
  const nextNames = new Set<string>();

  if (nextProps !== null && nextProps !== undefined) {
    for (const [name, value] of Object.entries(nextProps)) {
      if (shouldSkipSpreadProp(name, value)) {
        continue;
      }

      nextNames.add(name);

      if (previousProps.has(name) && Object.is(previousProps.get(name), value)) {
        continue;
      }

      if (isEventLikePropName(name) && typeof value === "function") {
        const eventName = name.slice(2).toLowerCase();
        if (previousProps.has(name)) {
          eventDisposers.get(name)?.();
        }
        eventDisposers.set(
          name,
          bindEvent(element as HTMLElement, eventName as keyof HTMLElementEventMap, value as EventListener),
        );
      } else {
        applyDomProp(element, name, value, { preferProperty: false });
      }

      if (value === false || value === null || value === undefined) {
        eventDisposers.get(name)?.();
        eventDisposers.delete(name);
        previousProps.delete(name);
      } else {
        previousProps.set(name, value);
      }
    }
  }

  for (const name of previousProps.keys()) {
    if (!nextNames.has(name)) {
      const disposeEvent = eventDisposers.get(name);
      if (disposeEvent !== undefined) {
        disposeEvent();
        eventDisposers.delete(name);
      } else {
        removeDomProp(element, name);
      }
      previousProps.delete(name);
    }
  }
}

function clearSpreadProps(
  element: Element,
  previousProps: Map<string, unknown>,
  eventDisposers: Map<string, Dispose>,
): void {
  for (const name of previousProps.keys()) {
    const disposeEvent = eventDisposers.get(name);
    if (disposeEvent !== undefined) {
      disposeEvent();
      eventDisposers.delete(name);
    } else {
      removeDomProp(element, name);
    }
  }

  previousProps.clear();
}

function shouldSkipSpreadProp(name: string, value: unknown): boolean {
  return (
    name === "children" ||
    name === "dangerouslySetInnerHTML" ||
    name === "checked" ||
    name === "defaultChecked" ||
    name === "defaultValue" ||
    name === "key" ||
    name === "ref" ||
    name === "domRef" ||
    name === "suppressHydrationWarning" ||
    name === "value" ||
    (isEventLikePropName(name) && typeof value !== "function")
  );
}
