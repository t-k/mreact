import type { JsxNodeIr } from "./ir.js";
import { readExpressionFacts } from "./expression-facts.js";
import type { ClientSpecializationFlags } from "./types.js";

const DEFAULT_CLIENT_SPECIALIZATIONS: ClientSpecializationFlags = Object.freeze({
  branchInsertion: true,
  directCellText: true,
  elementProperty: true,
  selectBinding: true,
});

let activeSpecializations: ClientSpecializationFlags = DEFAULT_CLIENT_SPECIALIZATIONS;

/**
 * Runs one synchronous client emit with the given specializations switched
 * off. The emitter is synchronous, so a module-level flag set is restored
 * before this returns and never leaks into another transform.
 */
export function withClientSpecializations<T>(
  overrides: Partial<ClientSpecializationFlags> | undefined,
  run: () => T,
): T {
  if (overrides === undefined) {
    return run();
  }

  const previous = activeSpecializations;
  activeSpecializations = { ...previous, ...overrides };

  try {
    return run();
  } finally {
    activeSpecializations = previous;
  }
}


/** The slice of the client emitter state that select binding emission needs. */
export interface SelectBindingEmitState {
  allocateName: (base: string) => string;
  helperNames: { bindSelectValue: string; bindSpreadProps: string };
}

/**
 * Reports whether a select can use the dedicated control binding.
 *
 * A real spread prop or a dynamic `multiple` keeps the generic spread binding,
 * because both can add, remove or reorder arbitrary props and the selection
 * has to be re-applied whenever `multiple` changes.
 */
export function usesDedicatedSelectBinding(node: Extract<JsxNodeIr, { kind: "element" }>): boolean {
  if (!activeSpecializations.selectBinding || node.tagName !== "select") {
    return false;
  }

  let hasControlProp = false;

  for (const attribute of node.attributes) {
    if (attribute.kind === "spread-attr") {
      return false;
    }

    if (attribute.kind !== "static-attr" && attribute.kind !== "dynamic-attr") {
      continue;
    }

    if (attribute.name === "multiple") {
      if (attribute.kind === "dynamic-attr") {
        return false;
      }
      continue;
    }

    if (isSelectControlAttributeName(attribute.name)) {
      hasControlProp = true;
    }
  }

  return hasControlProp;
}

export function emitSelectBindingLine(
  currentPath: string,
  selectControlEntries: readonly string[],
  selectBindingSources: readonly string[],
  state: SelectBindingEmitState,
): string | undefined {
  if (selectControlEntries.length > 0) {
    return `  ${state.helperNames.bindSelectValue}(${currentPath}, () => ({ ${selectControlEntries.join(", ")} }));`;
  }

  if (selectBindingSources.length === 0) {
    return undefined;
  }

  const selectPropsName = state.allocateName("_selectProps");
  const selectAssignments = selectBindingSources
    .map((source) => `Object.assign(${selectPropsName}, ${source});`)
    .join(" ");

  return `  ${state.helperNames.bindSpreadProps}(${currentPath}, () => { const ${selectPropsName} = {}; ${selectAssignments} return ${selectPropsName}; });`;
}

export function isSelectControlAttributeName(name: string): boolean {
  return name === "value" || name === "defaultValue" || name === "multiple";
}

/**
 * Names the cell a text child is proven to read, so the emitter can hand the
 * cell itself to bindText instead of a thunk. bindText subscribes to a native
 * cell source directly and falls back to a tracked effect otherwise, so the
 * observable value, normalization and disposal contract are unchanged.
 */
export function provenNativeCellTextBinding(child: Extract<JsxNodeIr, { kind: "expr" }>): string | undefined {
  if (!activeSpecializations.directCellText) {
    return undefined;
  }

  const value = readExpressionFacts(child).value;

  return value.kind === "native-cell-read" ? value.binding.name : undefined;
}

/**
 * Reports whether both branches of a conditional are proven never to produce a
 * list render value, so the narrow branch insertion helper can replace the
 * generic dynamic insertion and keep the keyed list runtime out of the graph.
 */
export function usesBranchInsertion(node: Extract<JsxNodeIr, { kind: "conditional" }>): boolean {
  return (
    activeSpecializations.branchInsertion &&
    isNonListBranch(node.whenTrue) &&
    isNonListBranch(node.whenFalse)
  );
}

function isNonListBranch(nodes: readonly JsxNodeIr[]): boolean {
  return nodes.every((node) => {
    if (node.kind === "element" || node.kind === "text") {
      return true;
    }

    if (node.kind === "fragment") {
      return isNonListBranch(node.children);
    }

    if (node.kind === "conditional") {
      return usesBranchInsertion(node);
    }

    return node.kind === "expr" && readExpressionFacts(node).value.kind === "renderable-primitive";
  });
}

/**
 * Names whose generic applyDomProp handling provably reduces to writing one
 * element property and its attribute.
 *
 * Every entry is a plain string prop: never an event handler, never a URL
 * carrier, never a dangerous HTML sink, never a style object, never a
 * booleanish attribute, and never form state. The runtime helper decides
 * between the property and the attribute exactly as applyDomProp does.
 */
export const SPECIALIZED_ELEMENT_PROPERTIES: ReadonlyMap<string, { attribute: string; property: string }> =
  new Map([
    ["class", { attribute: "class", property: "class" }],
    ["className", { attribute: "class", property: "className" }],
    ["dir", { attribute: "dir", property: "dir" }],
    ["id", { attribute: "id", property: "id" }],
    ["lang", { attribute: "lang", property: "lang" }],
    ["slot", { attribute: "slot", property: "slot" }],
    ["title", { attribute: "title", property: "title" }],
  ]);

/** Resolves the specialized property binding for one dynamic intrinsic attribute. */
export function specializedElementProperty(
  node: Extract<JsxNodeIr, { kind: "element" }>,
  name: string,
): { attribute: string; property: string } | undefined {
  if (!activeSpecializations.elementProperty || node.namespace === "svg") {
    return undefined;
  }

  return SPECIALIZED_ELEMENT_PROPERTIES.get(name);
}
