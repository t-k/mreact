import { effect } from "@reckona/mreact-reactive-core";
import {
  hasActivePropBindingMetadata,
  registerReactivePropBinding,
  type PropBinding,
} from "./prop-binding-registry.js";
import { isDomRenderValue } from "./render-value-guard.js";
import { registerIdempotentDispose } from "./scope.js";
import type { Dispose } from "./types.js";

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";

/**
 * @internal Binds one plain element property the compiler proved safe.
 *
 * The compiler only emits this for a fixed allowlist of string props on
 * non-SVG intrinsic elements: names that are never event handlers, never URL
 * carriers, never dangerous HTML sinks, never style objects, never booleanish
 * attributes and never form state. Everything outside that allowlist keeps
 * bindProp and its generic applyDomProp validation, so no sanitization is
 * skipped - the specialization is only chosen where applyDomProp provably
 * reduces to a property assignment plus an attribute write.
 *
 * The property-versus-attribute decision, the SVG fallback and the DOM node
 * rejection below mirror applyDomProp exactly, including for a custom element
 * that defines its own accessor for one of the allowlisted names.
 */
export function bindElementProperty(
  element: Element,
  propertyName: string,
  attributeName: string,
  value: () => unknown,
): Dispose {
  let target = element;
  let initialized = false;
  let previousValue: unknown;
  const run = () => {
    const nextValue = value();

    if (initialized && Object.is(previousValue, nextValue)) {
      return;
    }

    initialized = true;
    previousValue = nextValue;
    applyElementProperty(target, propertyName, attributeName, nextValue);
  };

  if (!hasActivePropBindingMetadata()) {
    return registerIdempotentDispose(effect(run));
  }

  const disposeEffect = effect(run);
  const binding: PropBinding = {
    dispose: disposeEffect,
    retarget(nextElement) {
      target = nextElement;

      if (initialized) {
        applyElementProperty(target, propertyName, attributeName, previousValue);
      }
    },
  };

  return registerReactivePropBinding(element, binding);
}

function applyElementProperty(
  element: Element,
  propertyName: string,
  attributeName: string,
  value: unknown,
): void {
  const record = element as unknown as Record<string, unknown>;
  const assignsProperty = element.namespaceURI !== SVG_NAMESPACE && propertyName in element;

  if (value === null || value === undefined || value === false || isDomRenderValue(value)) {
    if (assignsProperty) {
      record[propertyName] = typeof record[propertyName] === "boolean" ? false : "";
    }

    element.removeAttribute(attributeName);
    return;
  }

  if (assignsProperty) {
    record[propertyName] = value;

    if (value === true) {
      element.setAttribute(attributeName, "");
    }

    return;
  }

  element.setAttribute(attributeName, value === true ? "" : String(value));
}
