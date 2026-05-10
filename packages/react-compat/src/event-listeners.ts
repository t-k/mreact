import type { SyntheticEvent } from "./event-types.js";

export interface AppliedProps {
  props: Record<string, unknown>;
  listeners: Map<string, AppliedEventListener>;
}

export interface AppliedEventListener {
  handler: (event: SyntheticEvent) => void;
}

const appliedProps = new WeakMap<HTMLElement, AppliedProps>();

export function getAppliedProps(element: HTMLElement): AppliedProps | undefined {
  return appliedProps.get(element);
}

export function setAppliedProps(element: HTMLElement, props: AppliedProps): void {
  appliedProps.set(element, props);
}

export function getAppliedEventHandler(
  element: HTMLElement,
  name: string,
): ((event: SyntheticEvent) => void) | undefined {
  return appliedProps.get(element)?.listeners.get(name)?.handler;
}
