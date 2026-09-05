import type { AttributeIr, ComponentPropIr, JsxNodeIr } from "./ir.js";
import {
  htmlAttributeName,
  isDangerousHtmlAttribute,
  isStaticUrlValueUnsafe,
  isUrlAttribute,
  isVoidHtmlElement,
} from "./emit-server-shared.js";
import { escapeHtmlAttribute } from "@reckona/mreact-shared/html-escape";

export const oxcServerStringReactNodeRenderHelperPlaceholder = "__mreactRenderReactNodeToString";

let currentOxcServerStringUrlSafeHelperName = "_urlAttrSafe";

export function setOxcServerStringUrlSafeHelperName(name: string): void {
  currentOxcServerStringUrlSafeHelperName = name;
}

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
    const whenTrue = emitOxcServerStringChildren(node.whenTrue);
    const whenFalse = emitOxcServerStringChildren(node.whenFalse);

    return node.conditionValueName === undefined
      ? `((${node.conditionCode}) ? ${whenTrue} : ${whenFalse})`
      : `(() => { const ${node.conditionValueName} = (${node.conditionCode}); return ${node.conditionTestCode ?? node.conditionValueName} ? ${whenTrue} : ${whenFalse}; })()`;
  }

  if (node.kind === "list") {
    const parameters = emitOxcListParameters(node);
    const valueExpression = emitOxcServerStringChildren(node.children);
    if (node.bodyStatements === undefined || node.bodyStatements.length === 0) {
      return `(${node.itemsCode}).map((${parameters}) => ${valueExpression}).join("")`;
    }

    return `(${node.itemsCode}).map((${parameters}) => {\n${node.bodyStatements.map((statement) => `  ${statement}`).join("\n")}\n  return ${valueExpression};\n}).join("")`;
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

  const attrs = node.attributes
    .map((attr) => emitOxcServerAttribute(node.tagName, attr))
    .join(" + ");
  const open =
    attrs === ""
      ? JSON.stringify(`<${node.tagName}>`)
      : `${JSON.stringify(`<${node.tagName}`)} + ${attrs} + ">"`;
  if (isVoidHtmlElement(node.tagName)) {
    return open;
  }

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

function emitOxcServerAttribute(tagName: string, attr: AttributeIr): string {
  if (attr.kind === "spread-attr" || attr.kind === "event" || attr.kind === "dom-ref") {
    return '""';
  }

  if (attr.name === "key" || attr.name === "dangerouslySetInnerHTML") {
    return '""';
  }

  const htmlName = htmlAttributeNameForElement(tagName, attr.name);

  if (attr.kind === "static-attr") {
    if (isUrlAttribute(htmlName) && isStaticUrlValueUnsafe(htmlName, attr.value)) {
      return '""';
    }

    if (isDangerousHtmlAttribute(htmlName)) {
      return '""';
    }

    return JSON.stringify(` ${htmlName}="${escapeHtmlAttribute(attr.value)}"`);
  }

  if (attr.kind === "dynamic-attr") {
    if (isDangerousHtmlAttribute(htmlName)) {
      return `(() => { const _value = (${attr.code}); if (typeof _value !== "object" || _value === null) return ""; try { const _descriptor = Object.getOwnPropertyDescriptor(_value, "__html"); if (_descriptor !== undefined && "value" in _descriptor && typeof _descriptor.value === "string") return ${JSON.stringify(` ${htmlName}="`)} + _escapeHtml(_descriptor.value) + ${JSON.stringify('"')}; return ""; } catch { return ""; } })()`;
    }

    if (isUrlAttribute(htmlName)) {
      return `(() => { const _value = (${attr.code}); if (_value == null || _value === false) return ""; const _checked = ${currentOxcServerStringUrlSafeHelperName}(${JSON.stringify(htmlName)}, _value === true ? "" : _value); return _checked === undefined ? "" : ${JSON.stringify(` ${htmlName}="`)} + _escapeHtml(_checked) + ${JSON.stringify('"')}; })()`;
    }

    return `${JSON.stringify(` ${htmlName}="`)} + _escapeHtml(${attr.code}) + ${JSON.stringify('"')}`;
  }

  return '""';
}

function htmlAttributeNameForElement(tagName: string, name: string): string {
  if (tagName === "input") {
    if (name === "defaultValue") {
      return "value";
    }

    if (name === "defaultChecked") {
      return "checked";
    }
  }

  return htmlAttributeName(name);
}

function emitOxcCompatObjectNode(node: JsxNodeIr): string {
  if (node.kind === "text") {
    return JSON.stringify(node.value);
  }

  if (node.kind === "expr") {
    return `(${node.code})`;
  }

  if (node.kind === "conditional") {
    const whenTrue = emitOxcCompatObjectChildren(node.whenTrue);
    const whenFalse = emitOxcCompatObjectChildren(node.whenFalse);

    return node.conditionValueName === undefined
      ? `(${node.conditionCode}) ? ${whenTrue} : ${whenFalse}`
      : `(() => { const ${node.conditionValueName} = (${node.conditionCode}); return ${node.conditionTestCode ?? node.conditionValueName} ? ${whenTrue} : ${whenFalse}; })()`;
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
  if (node.parameterPatterns !== undefined) {
    return node.parameterPatterns.join(", ");
  }

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
