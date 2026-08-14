import { effect } from "@reckona/mreact-reactive-core";
import {
  applyDomProp,
  hasActivePropBindingMetadata,
  registerReactivePropBinding,
  type PropBinding,
} from "./dom-prop-application.js";
import { registerIdempotentDispose } from "./scope.js";
import type { Dispose } from "./types.js";

/** Binds one DOM property or attribute to a reactive value. */
export function bindProp(
  element: Element,
  name: string,
  value: () => unknown,
): Dispose {
  if (hasActivePropBindingMetadata()) {
    return bindPropWithMetadata(element, name, value);
  }

  let initialized = false;
  let previousValue: unknown;

  const disposeEffect = effect(() => {
    const nextValue = value();

    if (initialized && Object.is(previousValue, nextValue)) {
      return;
    }

    initialized = true;
    previousValue = nextValue;
    applyDomProp(element, name, nextValue, true);
  });

  return registerIdempotentDispose(disposeEffect);
}

function bindPropWithMetadata(
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
    applyDomProp(target, name, nextValue, true);
  });
  const binding: PropBinding = {
    dispose: disposeEffect,
    retarget(nextElement) {
      target = nextElement;

      if (initialized) {
        applyDomProp(target, name, previousValue, true);
      }
    },
  };

  return registerReactivePropBinding(element, binding);
}
