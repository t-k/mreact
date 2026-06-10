import { effect } from "@reckona/mreact-reactive-core";
import {
  applyDomProp,
  registerReactivePropBinding,
  removeDomProp,
  type PropBinding,
} from "./dom-prop-application.js";
import type { Dispose } from "./types.js";

export function bindSpreadProps(
  element: HTMLElement,
  props: () => Record<string, unknown> | null | undefined,
): Dispose {
  let target: Element = element;
  const previousProps = new Map<string, unknown>();

  const createTrackedApplyEffect = (): Dispose =>
    effect(() => {
      applySpreadProps(target, props(), previousProps);
    });
  let disposeEffect = createTrackedApplyEffect();
  const binding: PropBinding = {
    dispose() {
      disposeEffect();
      clearSpreadProps(target, previousProps);
    },
    retarget(nextElement) {
      const previousTarget = target;
      target = nextElement;

      clearSpreadProps(previousTarget, previousProps);
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
): void {
  const nextNames = new Set<string>();

  if (nextProps !== null && nextProps !== undefined) {
    for (const [name, value] of Object.entries(nextProps)) {
      if (shouldSkipSpreadProp(name)) {
        continue;
      }

      nextNames.add(name);

      if (previousProps.has(name) && Object.is(previousProps.get(name), value)) {
        continue;
      }

      applyDomProp(element, name, value, { preferProperty: false });

      if (value === false || value === null || value === undefined) {
        previousProps.delete(name);
      } else {
        previousProps.set(name, value);
      }
    }
  }

  for (const name of previousProps.keys()) {
    if (!nextNames.has(name)) {
      removeDomProp(element, name);
      previousProps.delete(name);
    }
  }
}

function clearSpreadProps(element: Element, previousProps: Map<string, unknown>): void {
  for (const name of previousProps.keys()) {
    removeDomProp(element, name);
  }

  previousProps.clear();
}

function shouldSkipSpreadProp(name: string): boolean {
  return name === "children" || name === "key" || name === "ref";
}
