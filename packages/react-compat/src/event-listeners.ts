import type { SyntheticEvent } from "./event-types.js";

export interface AppliedProps {
  attributeNames?: string[];
  props: Record<string, unknown>;
}

export type AppliedEventListener = (event: SyntheticEvent) => void;

const appliedProps = new WeakMap<Element, AppliedProps>();

export function getAppliedProps(element: Element): AppliedProps | undefined {
  return appliedProps.get(element);
}

export function setAppliedProps(element: Element, props: AppliedProps): void {
  appliedProps.set(element, props);
}

export function getAppliedEventHandler(
  element: Element,
  name: string,
): ((event: SyntheticEvent) => void) | undefined {
  const handler = appliedProps.get(element)?.props[name];
  return typeof handler === "function" ? (handler as (event: SyntheticEvent) => void) : undefined;
}
