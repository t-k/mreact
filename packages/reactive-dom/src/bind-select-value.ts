import { effect } from "@reckona/mreact-reactive-core";
import { registerReactivePropBinding, type PropBinding } from "./dom-prop-application.js";
import { applySelectValue } from "./form-state.js";
import type { Dispose } from "./types.js";

/** Names the controlled selection props a compiler-owned select binding applies. */
export interface SelectControlProps {
  defaultValue?: unknown;
  value?: unknown;
}

type SelectControlName = "defaultValue" | "value";

interface SelectControlState {
  changed: boolean;
  present: boolean;
  value: unknown;
}

/**
 * @internal Binds the controlled value of a select element.
 *
 * The compiler emits this instead of bindSpreadProps when a select carries no
 * spread prop and no dynamic `multiple`, so a form page does not pull in the
 * generic spread prop machinery. Selection itself still runs through
 * applySelectValue, and the decision of when to re-apply it mirrors the select
 * branch of applySpreadProps: value wins over defaultValue, a nullish value
 * falls back to defaultValue, and the selection is only re-applied when one of
 * the two actually changed.
 */
export function bindSelectValue(
  element: HTMLSelectElement,
  props: () => SelectControlProps,
): Dispose {
  let target = element;
  const previous = new Map<SelectControlName, unknown>();
  const run = () => {
    applySelectControlProps(target, props(), previous);
  };
  let disposeEffect = effect(run);
  const binding: PropBinding = {
    dispose() {
      disposeEffect();
      previous.clear();
    },
    retarget(nextElement) {
      target = nextElement as HTMLSelectElement;
      previous.clear();
      disposeEffect();
      disposeEffect = effect(run);
    },
  };

  return registerReactivePropBinding(element, binding);
}

function applySelectControlProps(
  element: HTMLSelectElement,
  next: SelectControlProps,
  previous: Map<SelectControlName, unknown>,
): void {
  const valueState = readSelectControlState(next, "value", previous);
  const defaultValueState = readSelectControlState(next, "defaultValue", previous);
  const selected = valueState?.present === true ? valueState : defaultValueState;

  // A prop that was not present on the previous run always reports `changed`,
  // so the first run applies the selection without a separate first-run flag.
  if (
    selected?.present === true &&
    (valueState?.changed === true || defaultValueState?.changed === true)
  ) {
    applySelectValue(element, selected.value);
  }

  commitSelectControlState(previous, "value", valueState);
  commitSelectControlState(previous, "defaultValue", defaultValueState);
}

function readSelectControlState(
  next: SelectControlProps,
  name: SelectControlName,
  previous: Map<SelectControlName, unknown>,
): SelectControlState | undefined {
  if (!Object.hasOwn(next, name)) {
    return undefined;
  }

  const value = next[name];

  return {
    changed: !previous.has(name) || !Object.is(previous.get(name), value),
    present: value !== null && value !== undefined,
    value,
  };
}

function commitSelectControlState(
  previous: Map<SelectControlName, unknown>,
  name: SelectControlName,
  state: SelectControlState | undefined,
): void {
  if (state === undefined) {
    return;
  }

  if (state.present) {
    previous.set(name, state.value);
    return;
  }

  previous.delete(name);
}
