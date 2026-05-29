import type { AttributeIr, ComponentPropIr, JsxNodeIr } from "./ir.js";
import { escapeHtmlAttribute } from "@reckona/mreact-shared/html-escape";

export const oxcServerStringReactNodeRenderHelperPlaceholder =
  "__mreactRenderReactNodeToString";

export function emitOxcServerStringChildren(children: readonly JsxNodeIr[]): string {
  if (children.length === 0) {
    return '""';
  }

  return children.map(emitOxcServerStringNode).join(" + ");
}

function emitOxcServerStringNode(node: JsxNodeIr): string {
  if (node.kind === "text") {
    return JSON.stringify(node.value);
  }

  if (node.kind === "expr") {
    return `_escapeHtml(${node.code})`;
  }

  if (node.kind === "conditional") {
    return `((${node.conditionCode}) ? ${emitOxcServerStringChildren(node.whenTrue)} : ${emitOxcServerStringChildren(node.whenFalse)})`;
  }

  if (node.kind === "list") {
    const parameters = emitOxcListParameters(node);
    return `(${node.itemsCode}).map((${parameters}) => ${emitOxcServerStringChildren(node.children)}).join("")`;
  }

  if (node.kind === "fragment") {
    return emitOxcServerStringChildren(node.children);
  }

  if (node.kind === "component") {
    const props = emitOxcServerComponentProps(node.props, node.children);
    if (node.runtime === "compat") {
      return `${oxcServerStringReactNodeRenderHelperPlaceholder}(${node.name}, ${props})`;
    }
    return `${node.name}(${props})`;
  }

  if (node.kind === "async-boundary") {
    return '""';
  }

  const attrs = node.attributes.map(emitOxcServerAttribute).join(" + ");
  const open =
    attrs === ""
      ? JSON.stringify(`<${node.tagName}>`)
      : `${JSON.stringify(`<${node.tagName}`)} + ${attrs} + ">"`;
  return `${open} + ${emitOxcServerStringChildren(node.children)} + ${JSON.stringify(`</${node.tagName}>`)}`;
}

function emitOxcServerComponentProps(
  props: readonly ComponentPropIr[],
  children: readonly JsxNodeIr[],
): string {
  const entries = props.map((prop) => {
    if (prop.kind === "spread-prop") {
      return `...(${prop.code})`;
    }

    if (prop.kind === "render-prop") {
      return `${emitOxcCompatObjectPropName(prop.name)}: ${emitOxcServerStringChildren(prop.children)}`;
    }

    return `${emitOxcCompatObjectPropName(prop.name)}: (${prop.code})`;
  });

  if (children.length > 0) {
    entries.push(`children: ${emitOxcServerStringChildren(children)}`);
  }

  return `{ ${entries.join(", ")} }`;
}

function emitOxcServerAttribute(attr: AttributeIr): string {
  if (attr.kind === "static-attr") {
    return JSON.stringify(` ${attr.name}="${escapeHtmlAttribute(attr.value)}"`);
  }

  if (attr.kind === "dynamic-attr") {
    return `${JSON.stringify(` ${attr.name}="`)} + _escapeHtml(${attr.code}) + ${JSON.stringify('"')}`;
  }

  return '""';
}

function emitOxcCompatObjectNode(node: JsxNodeIr): string {
  if (node.kind === "text") {
    return JSON.stringify(node.value);
  }

  if (node.kind === "expr") {
    return `(${node.code})`;
  }

  if (node.kind === "conditional") {
    return `(${node.conditionCode}) ? ${emitOxcCompatObjectChildren(node.whenTrue)} : ${emitOxcCompatObjectChildren(node.whenFalse)}`;
  }

  if (node.kind === "list") {
    const parameters = emitOxcListParameters(node);
    return `(${node.itemsCode}).map((${parameters}) => ${emitOxcCompatObjectChildren(node.children)})`;
  }

  if (node.kind === "fragment") {
    return emitOxcCompatObjectElement('Symbol.for("react.fragment")', [], node.children);
  }

  if (node.kind === "component") {
    return emitOxcCompatObjectElement(
      node.name,
      node.props.map(emitOxcCompatObjectComponentProp),
      node.children,
      node.keyCode,
    );
  }

  if (node.kind === "async-boundary") {
    return "null";
  }

  return emitOxcCompatObjectElement(
    JSON.stringify(node.tagName),
    node.attributes.map(emitOxcCompatObjectAttribute),
    node.children,
    node.keyCode,
  );
}

export function emitOxcCompatObjectChildren(children: readonly JsxNodeIr[]): string {
  if (children.length === 0) {
    return "null";
  }

  if (children.length === 1) {
    return emitOxcCompatObjectNode(children[0] as JsxNodeIr);
  }

  return `[${children.map(emitOxcCompatObjectNode).join(", ")}]`;
}

function emitOxcCompatObjectElement(
  typeCode: string,
  propEntries: readonly string[],
  children: readonly JsxNodeIr[],
  explicitKeyCode?: string,
): string {
  const entries = [...propEntries];

  if (children.length > 0) {
    entries.push(`children: ${emitOxcCompatObjectChildren(children)}`);
  }

  const keyExpression =
    explicitKeyCode === undefined
      ? "_props.key === undefined ? null : String(_props.key)"
      : `String(${explicitKeyCode})`;

  return [
    "(() => {",
    `  const _props = { ${entries.join(", ")} };`,
    `  const _key = ${keyExpression};`,
    "  const _ref = _props.ref ?? null;",
    "  delete _props.key;",
    "  delete _props.ref;",
    '  return { $$typeof: Symbol.for("react.transitional.element"),',
    `    type: ${typeCode},`,
    "    key: _key,",
    "    ref: _ref,",
    "    props: _props };",
    "})()",
  ].join("\n");
}

function emitOxcListParameters(node: Extract<JsxNodeIr, { kind: "list" }>): string {
  return [node.itemName, node.indexName, node.arrayName]
    .filter((name): name is string => name !== undefined)
    .join(", ");
}

function emitOxcCompatObjectAttribute(attr: AttributeIr): string {
  if (attr.kind === "spread-attr") {
    return `...(${attr.code})`;
  }

  if (attr.kind === "static-attr") {
    return `${emitOxcCompatObjectPropName(attr.name)}: ${JSON.stringify(attr.value)}`;
  }

  if (attr.kind === "dynamic-attr") {
    return `${emitOxcCompatObjectPropName(attr.name)}: (${attr.code})`;
  }

  return `${emitOxcCompatObjectPropName(attr.name)}: ${attr.code}`;
}

function emitOxcCompatObjectComponentProp(prop: ComponentPropIr): string {
  if (prop.kind === "spread-prop") {
    return `...(${prop.code})`;
  }

  if (prop.kind === "render-prop") {
    return `${emitOxcCompatObjectPropName(prop.name)}: ${emitOxcCompatObjectChildren(prop.children)}`;
  }

  return `${emitOxcCompatObjectPropName(prop.name)}: (${prop.code})`;
}

function emitOxcCompatObjectPropName(name: string): string {
  return /^[A-Za-z_$][\w$]*$/.test(name) ? name : JSON.stringify(name);
}
