import { readExpressionFacts } from "./expression-facts.js";
import type { ComponentIr, ComponentRefIr, JsxNodeIr } from "./ir.js";
import { readObject } from "./oxc-node-utils.js";

/**
 * Collects component names the module uses as a value rather than only as a JSX
 * tag.
 *
 * A JSX tag name parses as `JSXIdentifier`, so any plain `Identifier` with the
 * same name is a reference that could hand the component to something the
 * compiler cannot see. The declaration's own `id` is not such a reference.
 * Non-reference identifiers such as a plain object key count as escapes too,
 * which only costs an optimization.
 */
export function collectOxcEscapedComponentNames(
  program: unknown,
  componentNames: ReadonlySet<string>,
): Set<string> {
  const escaped = new Set<string>();

  if (componentNames.size === 0) {
    return escaped;
  }

  const visit = (value: unknown, parentKey: string | undefined): void => {
    if (Array.isArray(value)) {
      for (const item of value) visit(item, parentKey);
      return;
    }

    if (typeof value !== "object" || value === null) {
      return;
    }

    const node = readObject(value);

    if (
      node.type === "Identifier" &&
      parentKey !== "id" &&
      typeof node.name === "string" &&
      componentNames.has(node.name)
    ) {
      escaped.add(node.name);
    }

    for (const [key, child] of Object.entries(node)) {
      if (key === "type" || key === "start" || key === "end") {
        continue;
      }

      visit(child, key);
    }
  };

  visit(program, undefined);
  return escaped;
}

/**
 * Lowers a component's prop children to text bindings when every in-module call
 * site passes a value the compiler would already render as text on its own.
 *
 * A prop read is normally treated as a potential render value, because a caller
 * could pass an element or a list. That forces the generic render-value
 * insertion, which reaches the keyed list runtime. When the callee cannot be
 * reached from outside the module and every call site passes a literal or a
 * proven native cell read, the prop can only be text, so the callee gets an
 * ordinary text binding instead.
 *
 * This runs for client output only. Both shapes render one text node, so the
 * hydrated structure is unchanged, while the server emitters keep the render
 * value classification they use to choose between their string and stream
 * calling conventions.
 */
export function lowerProvenTextComponentProps(
  components: readonly ComponentIr[],
  escapedComponentNames: ReadonlySet<string>,
): void {
  const callSites = collectComponentCallSites(components);

  for (const component of components) {
    if (!isTextOnlyCallee(component, callSites.get(component.name), escapedComponentNames)) {
      continue;
    }

    lowerPropReadRenderValues(component.root);
  }
}

function collectComponentCallSites(
  components: readonly ComponentIr[],
): Map<string, ComponentRefIr[]> {
  const callSites = new Map<string, ComponentRefIr[]>();
  const visit = (node: JsxNodeIr): void => {
    if (node.kind === "component") {
      const existing = callSites.get(node.name);

      if (existing === undefined) {
        callSites.set(node.name, [node]);
      } else {
        existing.push(node);
      }

      for (const prop of node.props) {
        if (prop.kind === "render-prop") {
          for (const child of prop.children) visit(child);
        }
      }
    }

    if (node.kind === "conditional") {
      for (const child of [...node.whenTrue, ...node.whenFalse]) visit(child);
      return;
    }

    if (node.kind === "async-boundary") {
      for (const child of [
        ...node.children,
        ...(node.placeholderChildren ?? []),
        ...(node.catchChildren ?? []),
      ]) {
        visit(child);
      }
      return;
    }

    if (
      node.kind === "element" ||
      node.kind === "fragment" ||
      node.kind === "list" ||
      node.kind === "component"
    ) {
      for (const child of node.children) visit(child);
    }
  };

  for (const component of components) {
    visit(component.root);
  }

  return callSites;
}

function isTextOnlyCallee(
  component: ComponentIr,
  callSites: readonly ComponentRefIr[] | undefined,
  escapedComponentNames: ReadonlySet<string>,
): boolean {
  // `exported` is only set to false for a component the module keeps to itself;
  // an exported one leaves it undefined, so anything but an explicit false may
  // be reachable from outside the module.
  if (
    component.exported !== false ||
    component.exportDefault === true ||
    component.async === true ||
    component.reassigned === true ||
    escapedComponentNames.has(component.name)
  ) {
    return false;
  }

  if (callSites === undefined || callSites.length === 0) {
    return false;
  }

  return callSites.every(isTextOnlyCallSite);
}

function isTextOnlyCallSite(node: ComponentRefIr): boolean {
  if (
    node.clientReference !== undefined ||
    node.runtime === "compat" ||
    node.async === true ||
    node.children.length > 0
  ) {
    return false;
  }

  return node.props.every((prop) => {
    if (prop.kind !== "prop") {
      return false;
    }

    const value = readExpressionFacts(prop).value;

    return value.kind === "renderable-primitive" || value.kind === "native-cell-read";
  });
}

function lowerPropReadRenderValues(node: JsxNodeIr): void {
  if (node.kind === "expr") {
    if (
      readExpressionFacts(node).value.kind === "component-prop-read" &&
      (node.renderMode === "render-value" || node.renderMode === "server-render-value")
    ) {
      delete node.renderMode;
    }

    return;
  }

  if (node.kind === "conditional") {
    for (const child of [...node.whenTrue, ...node.whenFalse]) lowerPropReadRenderValues(child);
    return;
  }

  if (node.kind === "async-boundary") {
    for (const child of [
      ...node.children,
      ...(node.placeholderChildren ?? []),
      ...(node.catchChildren ?? []),
    ]) {
      lowerPropReadRenderValues(child);
    }
    return;
  }

  if (node.kind === "component") {
    for (const prop of node.props) {
      if (prop.kind === "render-prop") {
        for (const child of prop.children) lowerPropReadRenderValues(child);
      }
    }
  }

  if (
    node.kind === "element" ||
    node.kind === "fragment" ||
    node.kind === "list" ||
    node.kind === "component"
  ) {
    for (const child of node.children) lowerPropReadRenderValues(child);
  }
}
