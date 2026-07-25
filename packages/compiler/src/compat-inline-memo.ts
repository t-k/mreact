import type { ComponentIr } from "./ir.js";

export interface CompatInlineMemo {
  bindingKind: "const" | "let" | "var";
  functionName?: string;
  compareCode?: string;
}

const inlineMemoByComponent = new WeakMap<ComponentIr, CompatInlineMemo>();

export function setCompatInlineMemo(
  component: ComponentIr,
  inlineMemo: CompatInlineMemo,
): ComponentIr {
  inlineMemoByComponent.set(component, inlineMemo);
  return component;
}

export function getCompatInlineMemo(
  component: ComponentIr,
): CompatInlineMemo | undefined {
  return inlineMemoByComponent.get(component);
}
