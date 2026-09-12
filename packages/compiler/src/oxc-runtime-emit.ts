import type { AttributeIr, ComponentPropIr, JsxNodeIr } from "./ir.js";
import {
  emitOptionSelectedAttributeCode,
  htmlAttributeNameForElement,
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

export function emitOxcServerStringChildren(
  children: readonly JsxNodeIr[],
  escapeHelperName = "_escapeHtml",
): string {
  if (children.length === 0) {
    return '""';
  }

  return children.map((child) => emitOxcServerStringNode(child, escapeHelperName)).join(" + ");
}

export interface OxcServerStreamEmitterNames {
  sink: string;
  selectedValue: string;
  selectedMultiple: string;
  renderValue: string;
  renderAsyncBoundary: string;
  registerThunk: string;
  compatRenderToString: string;
  escapeHtml: string;
  localBase: string;
}

/** Emits a compiler-owned stream renderer for JSX nested inside a JavaScript value. */
export function emitOxcServerStreamRenderer(
  children: readonly JsxNodeIr[],
  names: OxcServerStreamEmitterNames,
): string {
  const state = { nextLocal: 0 };
  return `async (${names.sink}, ${names.selectedValue}, ${names.selectedMultiple}) => {\n${emitOxcServerStreamStatements(children, names, state, "  ")}\n}`;
}

function emitOxcServerStreamStatements(
  children: readonly JsxNodeIr[],
  names: OxcServerStreamEmitterNames,
  state: { nextLocal: number },
  indent: string,
): string {
  return children
    .map((node) => emitOxcServerStreamNode(node, names, state, indent))
    .filter(Boolean)
    .join("\n");
}

function emitOxcServerStreamNode(
  node: JsxNodeIr,
  names: OxcServerStreamEmitterNames,
  state: { nextLocal: number },
  indent: string,
): string {
  if (node.kind === "text") {
    return `${indent}${names.sink}.append(${JSON.stringify(node.value)});`;
  }

  if (node.kind === "expr") {
    return `${indent}await ${names.renderValue}(${names.sink}, (${node.code}), ${names.escapeHtml}, 0, ${names.selectedValue}, ${names.selectedMultiple});`;
  }

  if (node.kind === "conditional") {
    const whenTrue = emitOxcServerStreamStatements(node.whenTrue, names, state, `${indent}  `);
    const whenFalse = emitOxcServerStreamStatements(node.whenFalse, names, state, `${indent}  `);
    const condition = node.conditionTestCode ?? node.conditionValueName ?? node.conditionCode;
    const declaration =
      node.conditionValueName === undefined
        ? ""
        : `${indent}  const ${node.conditionValueName} = (${node.conditionCode});\n`;
    return `${indent}{\n${declaration}${indent}  if (${condition}) {\n${whenTrue}\n${indent}  } else {\n${whenFalse}\n${indent}  }\n${indent}}`;
  }

  if (node.kind === "list") {
    const id = state.nextLocal++;
    const renderers = `${names.localBase}$renderers${id}`;
    const renderer = `${names.localBase}$renderer${id}`;
    const parameters = emitOxcListParameters(node);
    const body = emitOxcServerStreamStatements(node.children, names, state, `${indent}    `);
    const statements = (node.bodyStatements ?? [])
      .map((statement) => `${indent}    ${statement}`)
      .join("\n");
    return `${indent}{\n${indent}  const ${renderers} = (${node.itemsCode}).map((${parameters}) => async () => {\n${statements}${statements === "" ? "" : "\n"}${body}\n${indent}  });\n${indent}  for (const ${renderer} of ${renderers}) { if (${renderer} !== undefined) await ${renderer}(); }\n${indent}}`;
  }

  if (node.kind === "fragment") {
    const statements = (node.bodyStatements ?? [])
      .map((statement) => `${indent}${statement}`)
      .join("\n");
    const body = emitOxcServerStreamStatements(node.children, names, state, indent);
    return [statements, body].filter(Boolean).join("\n");
  }

  if (node.kind === "component") {
    if (node.clientReference !== undefined) return "";
    const props = emitOxcServerStreamComponentProps(node.props, node.children, names, state);
    if (node.runtime === "compat") {
      return `${indent}${names.sink}.append(${names.compatRenderToString}(${node.name}, ${props}));`;
    }
    return `${indent}await ${node.name}(${names.sink}, ${emitOxcServerSelectionProps(props, names)});`;
  }

  if (node.kind === "async-boundary") {
    const body = emitOxcServerStreamStatements(node.children, names, state, `${indent}    `);
    const catchOption =
      node.catchName === undefined || node.catchChildren === undefined
        ? undefined
        : `catch: async (${names.sink}, ${node.catchName}) => {\n${emitOxcServerStreamStatements(node.catchChildren, names, state, `${indent}      `)}\n${indent}    }`;
    if (node.placeholderChildren !== undefined) return "";
    const hydrationAwaitId = node.awaitId === undefined
      ? undefined
      : `hydrationAwaitId: ${JSON.stringify(node.awaitId)}`;
    const optionFields = [catchOption, hydrationAwaitId].filter(
      (field): field is string => field !== undefined,
    );
    const options = optionFields.length === 0 ? "" : `, { ${optionFields.join(", ")} }`;
    return `${indent}await ${names.renderAsyncBoundary}(${names.sink}, (${node.valueCode}), async (${names.sink}, ${node.valueName}) => {\n${body}\n${indent}  }${options});`;
  }

  const establishesSelection = node.tagName === "select";
  const selectionId = establishesSelection ? state.nextLocal++ : undefined;
  const attributeBindings =
    selectionId === undefined
      ? []
      : node.attributes.flatMap((attribute, index) => {
          if (attribute.kind !== "dynamic-attr" && attribute.kind !== "static-attr") {
            return [];
          }
          const isSelectionAttribute = ["value", "defaultValue", "multiple"].includes(
            attribute.name,
          );
          if (!isSelectionAttribute && attribute.kind !== "dynamic-attr") return [];
          const code = isSelectionAttribute
            ? emitOxcSelectionAttributeValue([attribute], attribute.name)
            : attribute.kind === "dynamic-attr"
              ? `(${attribute.code})`
              : undefined;
          return code === undefined
            ? []
            : [
                {
                  attribute,
                  name: attribute.name,
                  local: `${names.localBase}$selectAttr${attribute.name[0]?.toUpperCase()}${attribute.name.slice(1)}${selectionId}_${index}`,
                  code,
                },
              ];
        });
  const selectionBindings = attributeBindings.filter((binding) =>
    ["value", "defaultValue", "multiple"].includes(binding.name),
  );
  const explicitSelectionValue = selectionBindings.find((binding) => binding.name === "value")
    ?.local;
  const defaultSelectionValue = selectionBindings.find(
    (binding) => binding.name === "defaultValue",
  )?.local;
  const selectionValue =
    explicitSelectionValue === undefined
      ? defaultSelectionValue
      : defaultSelectionValue === undefined
        ? explicitSelectionValue
        : `((${explicitSelectionValue}) ?? (${defaultSelectionValue}))`;
  const selectionMultipleName = selectionBindings.find((binding) => binding.name === "multiple")
    ?.local;
  const childNames = establishesSelection
    ? {
        ...names,
        selectedValue: selectionValue ?? "undefined",
        selectedMultiple: selectionMultipleName ?? "undefined",
      }
    : names;
  const optionSelected =
    node.tagName === "option" && names.selectedValue !== "undefined"
      ? emitOxcOptionSelectedAttribute(node, names, state)
      : undefined;
  const attrs = node.attributes
    .filter(
      (attr) =>
        !(
          node.tagName === "select" &&
          attr.kind !== "spread-attr" &&
          (attr.name === "value" || attr.name === "defaultValue")
        ) &&
        !(optionSelected !== undefined && attr.kind !== "spread-attr" && attr.name === "selected"),
    )
    .map((attr) => {
      const binding = attributeBindings.find((candidate) => candidate.attribute === attr)?.local;
      if (
        attr.kind === "dynamic-attr" &&
        (attr.name === "multiple" || attr.name === "selected")
      ) {
        return `((${binding ?? `(${attr.code})`}) ? ${JSON.stringify(` ${htmlAttributeNameForElement(node.tagName, attr.name)}=""`)} : "")`;
      }
      return emitOxcServerAttribute(
        node.tagName,
        binding !== undefined && attr.kind === "dynamic-attr" ? { ...attr, code: binding } : attr,
        names.escapeHtml,
      );
    })
    .join(" + ");
  const open =
    attrs === "" && optionSelected === undefined
      ? JSON.stringify(`<${node.tagName}>`)
      : `${JSON.stringify(`<${node.tagName}`)}${attrs === "" ? "" : ` + ${attrs}`}${optionSelected === undefined ? "" : ` + ${optionSelected}`} + ">"`;
  if (isVoidHtmlElement(node.tagName)) {
    return `${indent}${names.sink}.append(${open});`;
  }
  const body = emitOxcServerStreamStatements(node.children, childNames, state, indent);
  const element = `${indent}${names.sink}.append(${open});\n${body}${body === "" ? "" : "\n"}${indent}${names.sink}.append(${JSON.stringify(`</${node.tagName}>`)});`;
  if (!establishesSelection) return element;
  const declarations = attributeBindings.map(
    (binding) => `${indent}  const ${binding.local} = ${binding.code};`,
  );
  return `${indent}{\n${declarations.join("\n")}${declarations.length === 0 ? "" : "\n"}${element
    .split("\n")
    .map((line) => `  ${line}`)
    .join("\n")}\n${indent}}`;
}

function emitOxcSelectionAttributeValue(
  attributes: readonly AttributeIr[],
  ...names: readonly string[]
): string | undefined {
  const attribute = attributes.find(
    (candidate) => candidate.kind !== "spread-attr" && names.includes(candidate.name),
  );
  if (attribute?.kind === "static-attr") {
    return names.includes("multiple") ? "true" : JSON.stringify(attribute.value);
  }
  if (attribute?.kind === "dynamic-attr") return `(${attribute.code})`;
  return undefined;
}

function emitOxcOptionSelectedAttribute(
  node: Extract<JsxNodeIr, { kind: "element" }>,
  names: OxcServerStreamEmitterNames,
  state: { nextLocal: number },
): string {
  const optionValue =
    emitOxcSelectionAttributeValue(node.attributes, "value") ??
    emitOxcOptionTextValue(node.children);
  const selectedAttribute = node.attributes.find(
    (attribute) => attribute.kind !== "spread-attr" && attribute.name === "selected",
  );
  const ownSelected =
    selectedAttribute?.kind === "dynamic-attr"
      ? `((${selectedAttribute.code}) ? ${JSON.stringify(' selected=""')} : "")`
      : selectedAttribute === undefined
        ? '""'
        : JSON.stringify(' selected=""');
  const id = state.nextLocal++;
  return emitOptionSelectedAttributeCode(
    names.selectedValue,
    optionValue,
    ownSelected,
    {
      selected: `${names.localBase}$selected${id}`,
      optionValue: `${names.localBase}$option${id}`,
      boundOptionValue: `${names.localBase}$boundOption${id}`,
      textValue: `${names.localBase}$text${id}`,
      textParts: `${names.localBase}$textParts${id}`,
      textBody: `${names.localBase}$textBody${id}`,
      textHasValue: `${names.localBase}$textHasValue${id}`,
      selectValue: `${names.localBase}$selectValue${id}`,
      selectValueAttribute: `${names.localBase}$selectValueAttribute${id}`,
      selectDefaultValue: `${names.localBase}$selectDefaultValue${id}`,
      selectMultiple: `${names.localBase}$selectMultiple${id}`,
      attributes: `${names.localBase}$attributes${id}`,
      index: `${names.localBase}$index${id}`,
      candidate: `${names.localBase}$candidate${id}`,
    },
    names.selectedMultiple,
  );
}

function emitOxcOptionTextValue(children: readonly JsxNodeIr[]): string | undefined {
  if (!children.every((child) => child.kind === "text" || child.kind === "expr")) return undefined;
  const parts = children.map((child) =>
    child.kind === "text" ? JSON.stringify(child.value) : `String((${child.code}) ?? "")`,
  );
  return parts.length === 0 ? '""' : parts.join(" + ");
}

function emitOxcServerStreamComponentProps(
  props: readonly ComponentPropIr[],
  children: readonly JsxNodeIr[],
  names: OxcServerStreamEmitterNames,
  state: { nextLocal: number },
): string {
  const entries = props.map((prop) => {
    if (prop.kind === "spread-prop") return `...(${prop.code})`;
    if (prop.kind === "render-prop") {
      const renderer = emitOxcServerStreamRenderer(prop.children, names);
      return `${emitOxcCompatObjectPropName(prop.name)}: ${names.registerThunk}(${renderer})`;
    }
    return `${emitOxcCompatObjectPropName(prop.name)}: (${prop.code})`;
  });
  if (children.length > 0) {
    const renderer = emitOxcServerStreamRenderer(children, {
      ...names,
      localBase: `${names.localBase}$children${state.nextLocal++}`,
    });
    entries.push(`children: ${names.registerThunk}(${renderer})`);
  }
  return `{ ${entries.join(", ")} }`;
}

function emitOxcServerSelectionProps(
  props: string,
  names: Pick<OxcServerStreamEmitterNames, "selectedValue" | "selectedMultiple">,
): string {
  return `Object.defineProperty(Object.defineProperty(${props}, Symbol.for("mreact.server.selected-value"), { value: ${names.selectedValue} }), Symbol.for("mreact.server.select-multiple"), { value: ${names.selectedMultiple} })`;
}

function emitOxcServerStringNode(node: JsxNodeIr, escapeHelperName: string): string {
  if (node.kind === "text") {
    return JSON.stringify(node.value);
  }

  if (node.kind === "expr") {
    return `${escapeHelperName}(${node.code})`;
  }

  if (node.kind === "conditional") {
    const whenTrue = emitOxcServerStringChildren(node.whenTrue, escapeHelperName);
    const whenFalse = emitOxcServerStringChildren(node.whenFalse, escapeHelperName);

    return node.conditionValueName === undefined
      ? `((${node.conditionCode}) ? ${whenTrue} : ${whenFalse})`
      : `(() => { const ${node.conditionValueName} = (${node.conditionCode}); return ${node.conditionTestCode ?? node.conditionValueName} ? ${whenTrue} : ${whenFalse}; })()`;
  }

  if (node.kind === "list") {
    const parameters = emitOxcListParameters(node);
    const valueExpression = emitOxcServerStringChildren(node.children, escapeHelperName);
    if (node.bodyStatements === undefined || node.bodyStatements.length === 0) {
      return `(${node.itemsCode}).map((${parameters}) => ${valueExpression}).join("")`;
    }

    return `(${node.itemsCode}).map((${parameters}) => {\n${node.bodyStatements.map((statement) => `  ${statement}`).join("\n")}\n  return ${valueExpression};\n}).join("")`;
  }

  if (node.kind === "fragment") {
    return emitOxcServerStringChildren(node.children, escapeHelperName);
  }

  if (node.kind === "component") {
    if (node.clientReference !== undefined) return '""';
    const props = emitOxcServerComponentProps(node.props, node.children, escapeHelperName);
    if (node.runtime === "compat") {
      return `${oxcServerStringReactNodeRenderHelperPlaceholder}(${node.name}, ${props})`;
    }
    return `${node.name}(${props})`;
  }

  if (node.kind === "async-boundary") {
    return '""';
  }

  const attrs = node.attributes
    .map((attr) => emitOxcServerAttribute(node.tagName, attr, escapeHelperName))
    .join(" + ");
  const open =
    attrs === ""
      ? JSON.stringify(`<${node.tagName}>`)
      : `${JSON.stringify(`<${node.tagName}`)} + ${attrs} + ">"`;
  if (isVoidHtmlElement(node.tagName)) {
    return open;
  }

  return `${open} + ${emitOxcServerStringChildren(node.children, escapeHelperName)} + ${JSON.stringify(`</${node.tagName}>`)}`;
}

function emitOxcServerComponentProps(
  props: readonly ComponentPropIr[],
  children: readonly JsxNodeIr[],
  escapeHelperName: string,
): string {
  const entries = props.map((prop) => {
    if (prop.kind === "spread-prop") {
      return `...(${prop.code})`;
    }

    if (prop.kind === "render-prop") {
      return `${emitOxcCompatObjectPropName(prop.name)}: ${emitOxcServerStringChildren(prop.children, escapeHelperName)}`;
    }

    return `${emitOxcCompatObjectPropName(prop.name)}: (${prop.code})`;
  });

  if (children.length > 0) {
    entries.push(`children: ${emitOxcServerStringChildren(children, escapeHelperName)}`);
  }

  return `{ ${entries.join(", ")} }`;
}

function emitOxcServerAttribute(
  tagName: string,
  attr: AttributeIr,
  escapeHelperName = "_escapeHtml",
): string {
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
      return `(() => { const _value = (${attr.code}); if (typeof _value !== "object" || _value === null) return ""; try { const _descriptor = Object.getOwnPropertyDescriptor(_value, "__html"); if (_descriptor !== undefined && "value" in _descriptor && typeof _descriptor.value === "string") return ${JSON.stringify(` ${htmlName}="`)} + ${escapeHelperName}(_descriptor.value) + ${JSON.stringify('"')}; return ""; } catch { return ""; } })()`;
    }

    if (isUrlAttribute(htmlName)) {
      return `(() => { const _value = (${attr.code}); if (_value == null || _value === false) return ""; const _checked = ${currentOxcServerStringUrlSafeHelperName}(${JSON.stringify(htmlName)}, _value === true ? "" : _value); return _checked === undefined ? "" : ${JSON.stringify(` ${htmlName}="`)} + ${escapeHelperName}(_checked) + ${JSON.stringify('"')}; })()`;
    }

    return `${JSON.stringify(` ${htmlName}="`)} + ${escapeHelperName}(${attr.code}) + ${JSON.stringify('"')}`;
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
