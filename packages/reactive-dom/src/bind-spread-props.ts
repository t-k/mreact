import { effect } from "@reckona/mreact-reactive-core";
import { isBooleanishStringAttribute, isEventLikePropName } from "@reckona/mreact-shared";
import { bindEvent } from "./bind-event.js";
import {
  applyDomProp,
  registerReactivePropBinding,
  removeDomProp,
  toDomAttributeName,
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
  const isSelect = element instanceof HTMLSelectElement;
  const selectValueStates = new Map<
    "defaultValue" | "value",
    { changed: boolean; present: boolean; value: unknown }
  >();
  let selectMultipleChanged = false;

  if (nextProps !== null && nextProps !== undefined) {
    for (const [name, value] of Object.entries(nextProps)) {
      if (shouldSkipSpreadProp(element, name, value)) {
        continue;
      }

      if (isSelect && (name === "value" || name === "defaultValue")) {
        const previousValue = previousProps.get(name);
        selectValueStates.set(name, {
          changed: !previousProps.has(name) || !Object.is(previousValue, value),
          present: value !== null && value !== undefined,
          value,
        });
        if (value !== null && value !== undefined) {
          nextNames.add(name);
        }
        continue;
      }

      if (
        isSelect &&
        name === "multiple" &&
        (!previousProps.has(name) || !Object.is(previousProps.get(name), value))
      ) {
        selectMultipleChanged = true;
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
          bindEvent(
            element as HTMLElement,
            eventName as keyof HTMLElementEventMap,
            value as EventListener,
          ),
        );
      } else {
        applyDomProp(element, name, value, false);
      }

      if (
        value === null ||
        value === undefined ||
        (value === false && !isBooleanishStringAttribute(toDomAttributeName(name)))
      ) {
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
      if (isSelect && (name === "value" || name === "defaultValue")) {
        selectValueStates.set(name, { changed: true, present: false, value: undefined });
        continue;
      }

      if (isSelect && name === "multiple") {
        selectMultipleChanged = true;
      }

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

  if (isSelect && selectValueStates.size > 0) {
    const valueState = selectValueStates.get("value");
    const defaultValueState = selectValueStates.get("defaultValue");
    const selectedState = valueState?.present === true ? valueState : defaultValueState;
    const previousSelectionPresent =
      previousProps.has("value") || previousProps.has("defaultValue");
    const selectionChanged = [...selectValueStates.values()].some((state) => state.changed);

    if (selectedState?.present === true) {
      if (!previousSelectionPresent || selectionChanged || selectMultipleChanged) {
        applyDomProp(element, "value", selectedState.value, false);
      }
    } else if (previousSelectionPresent) {
      removeDomProp(element, "value");
    }

    for (const [name, state] of selectValueStates) {
      if (state.present) {
        previousProps.set(name, state.value);
      } else {
        previousProps.delete(name);
      }
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

function shouldSkipSpreadProp(element: Element, name: string, value: unknown): boolean {
  return (
    name === "children" ||
    name === "checked" ||
    name === "defaultChecked" ||
    (name === "defaultValue" && !(element instanceof HTMLSelectElement)) ||
    name === "key" ||
    name === "ref" ||
    name === "domRef" ||
    name === "suppressHydrationWarning" ||
    (name === "value" && !(element instanceof HTMLSelectElement)) ||
    (isEventLikePropName(name) && typeof value !== "function")
  );
}
