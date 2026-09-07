import { readExpressionFacts } from "./expression-facts.js";
import type { ComponentIr, ComponentRefIr, JsxNodeIr, StaticAttributeIr } from "./ir.js";

/**
 * Folds a component call whose props are all constants into its caller's tree.
 *
 * A component call costs a props object, a placeholder node the caller replaces
 * and, inside the callee, a live text binding for every prop it renders. None of
 * that is observable when the call site passes only constants: the callee can
 * only ever produce one fixed subtree, so the caller carries that subtree in its
 * own template instead.
 *
 * The rewrite is deliberately narrow. It accepts only a callee the module keeps
 * to itself whose whole body is static markup plus single-use prop reads, and a
 * call site that passes a literal for every prop the body reads. That body holds
 * no emitter placeholder to substitute, so `serverRenderValuePlaceholder`, which
 * names one for the whole module rather than recording that this component uses
 * one, does not disqualify it. Anything else
 * keeps the shared component, which is also what the code-size budget wants: an
 * inlined call site with a dynamic prop pays for its own binding, so repeating it
 * across call sites costs more than the one shared callee it replaces, while
 * repeated constant markup folds into the caller's template and compresses.
 */
export function inlineConstantComponentCalls(
  components: readonly ComponentIr[],
  escapedComponentNames: ReadonlySet<string>,
): void {
  const inlinable = new Map<string, StaticMarkupIr>();

  for (const component of components) {
    const markup = readInlinableCallee(component, escapedComponentNames);

    if (markup !== undefined) {
      inlinable.set(component.name, markup);
    }
  }

  if (inlinable.size === 0) {
    return;
  }

  for (const component of components) {
    // A component whose own root is a call keeps that call: the emitters read the
    // root node kind to decide how the component returns its node.
    rewriteChildren(component.root, inlinable);
  }
}

/** The subset of a callee body the compiler can reproduce at a call site. */
type StaticMarkupIr =
  | { kind: "text"; value: string }
  | { kind: "prop"; name: string }
  | {
      kind: "element";
      tagName: string;
      attributes: StaticAttributeIr[];
      children: StaticMarkupIr[];
    };

function rewriteChildren(node: JsxNodeIr, inlinable: ReadonlyMap<string, StaticMarkupIr>): void {
  for (const children of childListsOf(node)) {
    for (const [index, child] of children.entries()) {
      const folded = child.kind === "component" ? foldComponentCall(child, inlinable) : undefined;

      if (folded === undefined) {
        rewriteChildren(child, inlinable);
      } else {
        children[index] = folded;
      }
    }
  }
}

/**
 * Yields the child arrays the rewrite may replace an element of.
 *
 * Only plain markup children qualify. A conditional branch, a list row, a render
 * prop, an await branch and a component's own children each belong to another
 * specialization that decides what to emit from the node kind it finds there, so
 * a call site in one of those positions keeps the shared component.
 */
function childListsOf(node: JsxNodeIr): JsxNodeIr[][] {
  return node.kind === "element" || node.kind === "fragment" ? [node.children] : [];
}

function foldComponentCall(
  node: ComponentRefIr,
  inlinable: ReadonlyMap<string, StaticMarkupIr>,
): JsxNodeIr | undefined {
  const markup = inlinable.get(node.name);

  // `clientReference`, `runtime` and `async` are attached to a call site after
  // this pass runs, so they cannot be read here. None of them can apply: an
  // inlinable callee is declared in this module, which rules out a client
  // boundary reference and a compat runtime import, and its own declaration is
  // proven non-async before it becomes inlinable.
  if (markup === undefined || node.children.length > 0 || node.keyCode !== undefined) {
    return undefined;
  }

  const constants = new Map<string, string>();

  for (const prop of node.props) {
    if (prop.kind !== "prop") {
      return undefined;
    }

    const text = readLiteralText(prop.code);

    if (text === undefined) {
      return undefined;
    }

    constants.set(prop.name, text);
  }

  return substituteMarkup(markup, constants);
}

/**
 * Reads the text a prop expression always renders, or `undefined` when the
 * expression is not a literal the compiler can evaluate.
 *
 * JSON is a strict subset of JavaScript literal syntax, and for the strings and
 * numbers it accepts both languages agree on the value, so parsing the lowered
 * prop code as JSON either yields exactly what the expression evaluates to or
 * rejects it. A template literal, an identifier or a call is rejected.
 */
function readLiteralText(code: string): string | undefined {
  let value: unknown;

  try {
    value = JSON.parse(code);
  } catch {
    return undefined;
  }

  if (typeof value === "string") {
    return value;
  }

  // A boolean, null and undefined all render as nothing rather than as text, and
  // folding away a node the server still separates would change its structure.
  return typeof value === "number" && Number.isFinite(value) ? String(value) : undefined;
}

function substituteMarkup(
  markup: StaticMarkupIr,
  constants: ReadonlyMap<string, string>,
): JsxNodeIr | undefined {
  if (markup.kind === "text") {
    return { kind: "text", value: markup.value };
  }

  if (markup.kind === "prop") {
    const value = constants.get(markup.name);

    return value === undefined ? undefined : { kind: "text", value };
  }

  const children: JsxNodeIr[] = [];

  for (const child of markup.children) {
    const substituted = substituteMarkup(child, constants);

    if (substituted === undefined) {
      return undefined;
    }

    children.push(substituted);
  }

  return {
    kind: "element",
    tagName: markup.tagName,
    attributes: markup.attributes.map((attribute) => ({ ...attribute })),
    children,
  };
}

function readInlinableCallee(
  component: ComponentIr,
  escapedComponentNames: ReadonlySet<string>,
): StaticMarkupIr | undefined {
  // `exported` is only set to false for a component the module keeps to itself;
  // an exported one leaves it undefined, so anything but an explicit false may
  // be reachable from outside the module. A default export is one of those, so
  // it needs no check of its own.
  if (
    component.exported !== false ||
    component.async === true ||
    component.reassigned === true ||
    component.bodyStatements.length > 0 ||
    // `bindingNames` opens with the parameters, so anything beyond them is a
    // destructuring alias or a body binding the fold would have to reproduce.
    component.bindingNames.length !== component.parameters.length ||
    component.parameterPropAliases !== undefined ||
    !readsPropsThroughOneParameter(component.parameters) ||
    escapedComponentNames.has(component.name)
  ) {
    return undefined;
  }

  return readStaticMarkup(component.root, new Set<string>());
}

/**
 * Reports whether the component's parameter list lets `props.name` mean this
 * component's own props, so a fold can substitute the call site's value for it.
 */
function readsPropsThroughOneParameter(parameters: readonly string[]): boolean {
  return parameters.length === 0 || (parameters.length === 1 && parameters[0] === "props");
}

/**
 * Reproduces `node` as markup a call site can carry, or returns `undefined` when
 * the node is anything the fold cannot account for.
 *
 * A prop may be read at most once: substituting the same call-site value twice
 * would duplicate whatever the caller wrote. An element may hold at most one
 * text-producing child, because folding a prop read next to other text would
 * merge nodes the server keeps separate and break hydration.
 */
function readStaticMarkup(node: JsxNodeIr, readPropNames: Set<string>): StaticMarkupIr | undefined {
  if (node.kind === "text") {
    return { kind: "text", value: node.value };
  }

  if (node.kind === "expr") {
    const name = readPropReadName(node.code);

    if (
      name === undefined ||
      readPropNames.has(name) ||
      node.deferRenderValue === true ||
      node.compilerKeyedProperty !== undefined ||
      readExpressionFacts(node).value.kind !== "component-prop-read"
    ) {
      return undefined;
    }

    readPropNames.add(name);
    return { kind: "prop", name };
  }

  if (
    node.kind !== "element" ||
    node.keyCode !== undefined ||
    node.namespace !== undefined ||
    node.children.filter(producesText).length > 1
  ) {
    return undefined;
  }

  const attributes: StaticAttributeIr[] = [];

  for (const attribute of node.attributes) {
    if (attribute.kind !== "static-attr") {
      return undefined;
    }

    attributes.push(attribute);
  }

  const children: StaticMarkupIr[] = [];

  for (const child of node.children) {
    const markup = readStaticMarkup(child, readPropNames);

    if (markup === undefined) {
      return undefined;
    }

    children.push(markup);
  }

  return { kind: "element", tagName: node.tagName, attributes, children };
}

function producesText(node: JsxNodeIr): boolean {
  return node.kind === "text" || node.kind === "expr";
}

/** Reads the prop name of a plain `props.name` read, or `undefined` for anything else. */
function readPropReadName(code: string): string | undefined {
  return /^props\.([A-Za-z_$][\w$]*)$/.exec(code)?.[1];
}
