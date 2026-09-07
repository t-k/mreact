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

  // readObject yields an empty record for primitives, so arrays and scalars
  // need no separate branch: arrays enumerate their elements by index.
  const visit = (value: unknown, parentKey: string | undefined): void => {
    const node = readObject(value);

    if (
      node.type === "Identifier" &&
      parentKey !== "id" &&
      componentNames.has(node.name as string)
    ) {
      escaped.add(node.name as string);
    }

    for (const [key, child] of Object.entries(node)) {
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
 * This runs for every target. Both shapes render one text node, so the hydrated
 * structure is unchanged, and each server emitter calls a lowered callee with
 * its own calling convention rather than inferring one from the classification.
 */
export function lowerProvenTextComponentProps(
  components: readonly ComponentIr[],
  escapedComponentNames: ReadonlySet<string>,
): void {
  const callSites = new Map<string, ComponentRefIr[]>();

  for (const component of components) {
    visitJsxTree(component.root, (node) => {
      if (node.kind === "component") {
        const existing = callSites.get(node.name);

        if (existing === undefined) {
          callSites.set(node.name, [node]);
        } else {
          existing.push(node);
        }
      }
    });
  }

  for (const component of components) {
    if (!isTextOnlyCallee(component, callSites.get(component.name), escapedComponentNames)) {
      continue;
    }

    visitJsxTree(component.root, (node) => {
      if (
        node.kind === "expr" &&
        readExpressionFacts(node).value.kind === "component-prop-read" &&
        (node.renderMode === "render-value" || node.renderMode === "server-render-value")
      ) {
        delete node.renderMode;
      }
    });
  }
}

/** Visits every node of one lowered JSX tree, including render-prop children. */
function visitJsxTree(node: JsxNodeIr, visitor: (node: JsxNodeIr) => void): void {
  visitor(node);

  for (const child of childNodesOf(node)) {
    visitJsxTree(child, visitor);
  }
}

function childNodesOf(node: JsxNodeIr): readonly JsxNodeIr[] {
  if (node.kind === "conditional") {
    return [...node.whenTrue, ...node.whenFalse];
  }

  if (node.kind === "async-boundary") {
    return [
      ...node.children,
      ...(node.placeholderChildren ?? []),
      ...(node.catchChildren ?? []),
    ];
  }

  if (node.kind === "component") {
    return [
      ...node.props.flatMap((prop) => (prop.kind === "render-prop" ? prop.children : [])),
      ...node.children,
    ];
  }

  if (node.kind === "element" || node.kind === "fragment" || node.kind === "list") {
    return node.children;
  }

  return [];
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

  // No call site at all means the module cannot reach the component, so nothing
  // can pass it a value the text binding would be wrong for.
  return callSites === undefined || callSites.every(isTextOnlyCallSite);
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
