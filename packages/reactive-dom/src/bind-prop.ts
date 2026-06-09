import { effect } from "@reckona/mreact-reactive-core";
import {
  applyDomProp,
  registerReactivePropBinding,
  type PropBinding,
} from "./dom-prop-application.js";
import type { Dispose } from "./types.js";

/** Binds one DOM property or attribute to a reactive value. */
export function bindProp(
  element: Element,
  name: string,
  value: () => unknown,
): Dispose {
  let target = element;
  let initialized = false;
  let previousValue: unknown;

  const disposeEffect = effect(() => {
    const nextValue = value();

    if (initialized && Object.is(previousValue, nextValue)) {
      return;
    }

    initialized = true;
    previousValue = nextValue;
    applyDomProp(target, name, nextValue, { preferProperty: true });
  });
  const binding: PropBinding = {
    dispose: disposeEffect,
    retarget(nextElement) {
      target = nextElement;

      if (initialized) {
        applyDomProp(target, name, previousValue, { preferProperty: true });
      }
    },
  };

  return registerReactivePropBinding(element, binding);
}
