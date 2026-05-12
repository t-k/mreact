import type {
  AttributeIr,
  ComponentPropIr,
  ComponentIr,
  JsxNodeIr,
  ModuleIr,
} from "./ir.js";
import type { RuntimeImport, ServerEscapeOptions } from "./types.js";

export interface EmitResult {
  code: string;
  imports: RuntimeImport[];
}

export interface EmitServerOptions {
  dynamicAttributes?: "drop" | "emit";
  escape?: ServerEscapeOptions | undefined;
  serverHydration?: boolean;
}

export function emitServer(
  ir: ModuleIr,
  options: EmitServerOptions = {},
): EmitResult {
  const escapeHelperName = allocateEscapeHelperName(ir);
  const escapeBatchHelperName = options.escape === undefined
    ? undefined
    : allocateHelperName(ir, "_escapeHtmlBatch");
  const contextProviderHelperName = usesContextProvider(ir)
    ? allocateHelperName(ir, "_renderContextProviderToString")
    : undefined;
  const contextConsumerHelperName = usesContextConsumer(ir)
    ? allocateHelperName(ir, "_renderContextConsumerToString")
    : undefined;
  const reactNodeRenderHelperName = usesReactNodeRender(ir)
    ? allocateHelperName(ir, "_renderReactNodeToString")
    : undefined;
  const escapeImport = options.escape === undefined || escapeBatchHelperName === undefined
    ? ""
    : `import { ${options.escape.batchImportName} as ${escapeBatchHelperName} } from ${stringLiteral(options.escape.batchImportSource)};`;
  const helper = [
    `function ${escapeHelperName}(value) {`,
    ...(escapeBatchHelperName === undefined
      ? [
          `  return String(value ?? "")`,
          `    .replaceAll("&", "&amp;")`,
          `    .replaceAll("<", "&lt;")`,
          `    .replaceAll(">", "&gt;")`,
          `    .replaceAll("\\"", "&quot;");`,
        ]
      : [`  return ${escapeBatchHelperName}([value])[0] ?? "";`]),
    `}`,
  ].join("\n");
  const asyncComponentNames = collectAsyncServerComponentNames(ir.components);
  const components = ir.components
    .map((component) =>
      emitComponent(
        component,
        escapeHelperName,
        escapeBatchHelperName,
        options,
        asyncComponentNames,
        options.dynamicAttributes ?? "emit",
        contextProviderHelperName,
        contextConsumerHelperName,
        reactNodeRenderHelperName,
      ),
    )
    .join("\n\n");
  const userImports = emitUserImports(ir);
  const contextImport = emitContextImport(
    contextProviderHelperName,
    contextConsumerHelperName,
    reactNodeRenderHelperName,
  );
  const moduleStatements = emitModuleStatements(ir);

  return {
    code: `${[userImports, escapeImport, contextImport, moduleStatements, helper].filter(Boolean).join("\n\n")}\n\n${components}\n`,
    imports: collectContextImports(
      contextProviderHelperName,
      contextConsumerHelperName,
      reactNodeRenderHelperName,
    ),
  };
}

function emitContextImport(
  contextProviderHelperName: string | undefined,
  contextConsumerHelperName: string | undefined,
  reactNodeRenderHelperName: string | undefined,
): string {
  const specifiers = [
    reactNodeRenderHelperName === undefined
      ? undefined
      : `renderToString as ${reactNodeRenderHelperName}`,
    contextProviderHelperName === undefined
      ? undefined
      : `renderContextProviderToString as ${contextProviderHelperName}`,
    contextConsumerHelperName === undefined
      ? undefined
      : `renderContextConsumerToString as ${contextConsumerHelperName}`,
  ].filter((specifier): specifier is string => specifier !== undefined);

  return specifiers.length === 0
    ? ""
    : `import { ${specifiers.join(", ")} } from "@modular-react/react-compat";`;
}

function collectContextImports(
  contextProviderHelperName: string | undefined,
  contextConsumerHelperName: string | undefined,
  reactNodeRenderHelperName?: string,
): RuntimeImport[] {
  const specifiers = [
    reactNodeRenderHelperName === undefined ? undefined : "renderToString",
    contextProviderHelperName === undefined
      ? undefined
      : "renderContextProviderToString",
    contextConsumerHelperName === undefined
      ? undefined
      : "renderContextConsumerToString",
  ].filter((specifier): specifier is string => specifier !== undefined);

  return specifiers.length === 0
    ? []
    : [{ source: "@modular-react/react-compat", specifiers }];
}

function emitUserImports(ir: ModuleIr): string {
  return ir.userImports.join("\n");
}

function emitModuleStatements(ir: ModuleIr): string {
  return ir.moduleStatements.join("\n");
}

function emitComponent(
  component: ComponentIr,
  escapeHelperName: string,
  escapeBatchHelperName: string | undefined,
  options: EmitServerOptions,
  asyncComponentNames: ReadonlySet<string>,
  dynamicAttributes: "drop" | "emit",
  contextProviderHelperName?: string,
  contextConsumerHelperName?: string,
  reactNodeRenderHelperName?: string,
): string {
  const body = component.bodyStatements.map((statement) => `  ${statement}`);
  const parameters = component.parameters.join(", ");
  const htmlExpression = emitHtmlExpression(
    component.root,
    escapeHelperName,
    escapeBatchHelperName,
    asyncComponentNames,
    dynamicAttributes,
    contextProviderHelperName,
    contextConsumerHelperName,
    reactNodeRenderHelperName,
  );
  const returnExpression =
    options.serverHydration === true
      ? `${stringLiteral(`<!--mreact-h:start:${encodeURIComponent(component.name)}-->`)} + ${htmlExpression} + ${stringLiteral(`<!--mreact-h:end:${encodeURIComponent(component.name)}-->`)}`
      : htmlExpression;

  const functionKeyword = `${component.exportDefault === true ? "export default " : component.exported === false ? "" : "export "}${
    asyncComponentNames.has(component.name) ? "async " : ""
  }function`;

  return [
    `${functionKeyword} ${component.name}(${parameters}) {`,
    ...body,
    `  return ${returnExpression};`,
    `}`,
  ].join("\n");
}

function emitHtmlExpression(
  node: JsxNodeIr,
  escapeHelperName: string,
  escapeBatchHelperName: string | undefined,
  asyncComponentNames: ReadonlySet<string>,
  dynamicAttributes: "drop" | "emit",
  contextProviderHelperName?: string,
  contextConsumerHelperName?: string,
  reactNodeRenderHelperName?: string,
): string {
  const parts = collectHtmlParts(
    node,
    escapeHelperName,
    escapeBatchHelperName,
    asyncComponentNames,
    dynamicAttributes,
    contextProviderHelperName,
    contextConsumerHelperName,
    reactNodeRenderHelperName,
  );

  if (parts.length === 0) {
    return "\"\"";
  }

  return parts.join(" + ");
}

function collectHtmlParts(
  node: JsxNodeIr,
  escapeHelperName: string,
  escapeBatchHelperName: string | undefined,
  asyncComponentNames: ReadonlySet<string>,
  dynamicAttributes: "drop" | "emit",
  contextProviderHelperName?: string,
  contextConsumerHelperName?: string,
  reactNodeRenderHelperName?: string,
): string[] {
  if (node.kind === "text") {
    return [stringLiteral(escapeHtml(node.value))];
  }

  if (node.kind === "expr") {
    if (node.renderMode === "html") {
      return [rawHtmlExpression(node.code)];
    }

    if (node.renderMode === "react-node" && reactNodeRenderHelperName !== undefined) {
      return [`${reactNodeRenderHelperName}(() => (${node.code}))`];
    }

    return [`${escapeHelperName}(${node.code})`];
  }

  if (node.kind === "conditional") {
    return [
      `((${node.conditionCode}) ? ${emitHtmlExpressionFromChildren(node.whenTrue, escapeHelperName, escapeBatchHelperName, asyncComponentNames, dynamicAttributes, contextProviderHelperName, contextConsumerHelperName, reactNodeRenderHelperName)} : ${emitHtmlExpressionFromChildren(node.whenFalse, escapeHelperName, escapeBatchHelperName, asyncComponentNames, dynamicAttributes, contextProviderHelperName, contextConsumerHelperName, reactNodeRenderHelperName)})`,
    ];
  }

  if (node.kind === "list") {
    const parameters =
      node.indexName === undefined
        ? node.itemName
        : `${node.itemName}, ${node.indexName}`;
    const renderer = emitListRenderer(
      node,
      parameters,
      escapeHelperName,
      escapeBatchHelperName,
      asyncComponentNames,
      dynamicAttributes,
      contextProviderHelperName,
      contextConsumerHelperName,
      reactNodeRenderHelperName,
    );
    const mapped = `(${node.itemsCode}).map(${renderer})`;
    return [
      containsAsyncServerOperationInChildren(node.children, asyncComponentNames)
        ? `(await Promise.all(${mapped})).join("")`
        : `${mapped}.join("")`,
    ];
  }

  if (node.kind === "fragment") {
    return node.children.flatMap((child) =>
      collectHtmlParts(
        child,
        escapeHelperName,
        escapeBatchHelperName,
        asyncComponentNames,
        dynamicAttributes,
        contextProviderHelperName,
        contextConsumerHelperName,
        reactNodeRenderHelperName,
      ),
    );
  }

  if (node.kind === "component") {
    if (node.name === "Suspense") {
      return [
        stringLiteral("<!--$-->"),
        ...node.children.flatMap((child) =>
          collectHtmlParts(
            child,
            escapeHelperName,
            escapeBatchHelperName,
            asyncComponentNames,
            dynamicAttributes,
            contextProviderHelperName,
            contextConsumerHelperName,
            reactNodeRenderHelperName,
          ),
        ),
        stringLiteral("<!--/$-->"),
      ];
    }

    if (contextProviderHelperName !== undefined && node.name.endsWith(".Provider")) {
      const valueCode = findComponentPropCode(node.props, "value") ?? "undefined";
      return [
        `${contextProviderHelperName}(${node.name}, ${valueCode}, () => ${emitHtmlExpressionFromChildren(node.children, escapeHelperName, escapeBatchHelperName, asyncComponentNames, dynamicAttributes, contextProviderHelperName, contextConsumerHelperName, reactNodeRenderHelperName)})`,
      ];
    }

    if (contextConsumerHelperName !== undefined && node.name.endsWith(".Consumer")) {
      const renderProp = findComponentRenderProp(node.props, "children");

      if (renderProp !== undefined) {
        const valueName = renderProp.valueName ?? "_value";
        return [
          `${contextConsumerHelperName}(${node.name}, (${valueName}) => ${emitHtmlExpressionFromChildren(renderProp.children, escapeHelperName, escapeBatchHelperName, asyncComponentNames, dynamicAttributes, contextProviderHelperName, contextConsumerHelperName, reactNodeRenderHelperName)})`,
        ];
      }
    }

    return [
      emitComponentCallExpression(
        node.name,
        emitPropsObject(
          node.props,
          node.children,
          escapeHelperName,
          escapeBatchHelperName,
          asyncComponentNames,
          dynamicAttributes,
          contextProviderHelperName,
          contextConsumerHelperName,
          reactNodeRenderHelperName,
        ),
        asyncComponentNames,
      ),
    ];
  }

  if (node.kind === "async-boundary") {
    return [];
  }

  const closeTag = `</${node.tagName}>`;

  const childrenExpression = emitBatchedSimpleChildrenExpression(
    node.children,
    escapeBatchHelperName,
  );

  return [
    stringLiteral(`<${node.tagName}`),
    ...collectElementAttributeParts(
      node.attributes,
      escapeHelperName,
      escapeBatchHelperName,
      dynamicAttributes,
    ),
    stringLiteral(">"),
    ...(childrenExpression === undefined
      ? node.children.flatMap((child) =>
          collectHtmlParts(
            child,
            escapeHelperName,
            escapeBatchHelperName,
            asyncComponentNames,
            dynamicAttributes,
            contextProviderHelperName,
            contextConsumerHelperName,
            reactNodeRenderHelperName,
          ),
        )
      : [childrenExpression]),
    stringLiteral(closeTag),
  ];
}

function collectHtmlAttributeParts(
  attr: AttributeIr,
  escapeHelperName: string,
  escapeBatchHelperName: string | undefined,
  dynamicAttributes: "drop" | "emit",
): string[] {
  if (attr.kind === "event" || attr.kind === "spread-attr" || attr.name === "key") {
    return [];
  }

  if (attr.kind === "static-attr") {
    return [`${stringLiteral(` ${htmlAttributeName(attr.name)}="${escapeHtml(attr.value)}"`)}`];
  }

  if (dynamicAttributes === "drop") {
    return [];
  }

  if (attr.name === "style") {
    return [emitDynamicStyleAttributeExpression(attr.code, escapeHelperName, escapeBatchHelperName)];
  }

  return [emitDynamicAttributeExpression(htmlAttributeName(attr.name), attr.code, escapeHelperName)];
}

function collectElementAttributeParts(
  attrs: readonly AttributeIr[],
  escapeHelperName: string,
  escapeBatchHelperName: string | undefined,
  dynamicAttributes: "drop" | "emit",
): string[] {
  if (escapeBatchHelperName === undefined || dynamicAttributes === "drop") {
    return attrs.flatMap((attr) =>
      collectHtmlAttributeParts(attr, escapeHelperName, escapeBatchHelperName, dynamicAttributes),
    );
  }

  const dynamicAttrs = attrs.filter(
    (attr) => attr.kind === "dynamic-attr" && attr.name !== "style",
  ) as Array<Extract<AttributeIr, { kind: "dynamic-attr" }>>;

  if (dynamicAttrs.length < 2) {
    return attrs.flatMap((attr) =>
      collectHtmlAttributeParts(attr, escapeHelperName, escapeBatchHelperName, dynamicAttributes),
    );
  }

  const parts: string[] = [];
  let dynamicIndex = 0;

  for (const attr of attrs) {
    if (attr.kind === "dynamic-attr" && attr.name !== "style") {
      if (dynamicIndex === 0) {
        parts.push(emitBatchedDynamicAttributeExpression(dynamicAttrs, escapeBatchHelperName));
      }
      dynamicIndex += 1;
      continue;
    }

    parts.push(...collectHtmlAttributeParts(attr, escapeHelperName, escapeBatchHelperName, dynamicAttributes));
  }

  return parts;
}

function emitBatchedDynamicAttributeExpression(
  attrs: Array<Extract<AttributeIr, { kind: "dynamic-attr" }>>,
  escapeBatchHelperName: string,
): string {
  const declarations = attrs
    .map((attr, index) => `const _value${index} = (${attr.code});`)
    .join(" ");
  const values = attrs
    .map((_, index) => `_value${index} === true ? "" : _value${index}`)
    .join(", ");
  const rendered = attrs
    .map((attr, index) => {
      const name = htmlAttributeName(attr.name);

      return `(_value${index} == null || _value${index} === false ? "" : ${stringLiteral(` ${name}="`)} + _escaped[${index}] + ${stringLiteral("\"")})`;
    })
    .join(" + ");

  return `(() => { ${declarations} const _escaped = ${escapeBatchHelperName}([${values}]); return ${rendered}; })()`;
}

function emitDynamicAttributeExpression(
  name: string,
  code: string,
  escapeHelperName: string,
): string {
  return `(() => { const _value = (${code}); return _value == null || _value === false ? "" : ${stringLiteral(` ${name}="`)} + ${escapeHelperName}(_value === true ? "" : _value) + ${stringLiteral("\"")}; })()`;
}

function emitDynamicStyleAttributeExpression(
  code: string,
  escapeHelperName: string,
  escapeBatchHelperName: string | undefined,
): string {
  const escapedPair = escapeBatchHelperName === undefined
    ? `${escapeHelperName}(_cssName) + ":" + ${escapeHelperName}(_styleValue === true ? "" : _styleValue)`
    : `(() => { const _escaped = ${escapeBatchHelperName}([_cssName, _styleValue === true ? "" : _styleValue]); return _escaped[0] + ":" + _escaped[1]; })()`;

  return `(() => { const _value = (${code}); if (_value == null || _value === false) return ""; if (typeof _value === "string") { const _style = ${escapeHelperName}(_value); return _style === "" ? "" : ${stringLiteral(" style=\"")} + _style + ${stringLiteral("\"")}; } const _style = Object.entries(_value).filter(([, _styleValue]) => _styleValue != null && _styleValue !== false).map(([_styleName, _styleValue]) => { const _cssName = String(_styleName).startsWith("--") ? String(_styleName) : String(_styleName).replace(/[A-Z]/g, (_char) => "-" + _char.toLowerCase()); return ${escapedPair}; }).join(";"); return _style === "" ? "" : ${stringLiteral(" style=\"")} + _style + ${stringLiteral("\"")}; })()`;
}

function htmlAttributeName(name: string): string {
  if (name === "className") {
    return "class";
  }

  if (name === "htmlFor") {
    return "for";
  }

  return name;
}

function rawHtmlExpression(code: string): string {
  return `(() => { const _value = (${code}); return Array.isArray(_value) ? _value.join("") : String(_value ?? ""); })()`;
}

function emitBatchedSimpleChildrenExpression(
  children: readonly JsxNodeIr[],
  escapeBatchHelperName: string | undefined,
): string | undefined {
  if (escapeBatchHelperName === undefined) {
    return undefined;
  }

  const dynamicChildren = children.filter(
    (child) => child.kind === "expr" && child.renderMode !== "html" && child.renderMode !== "react-node",
  ) as Array<Extract<JsxNodeIr, { kind: "expr" }>>;

  if (dynamicChildren.length < 2) {
    return undefined;
  }

  if (
    children.some(
      (child) =>
        child.kind !== "text" &&
        !(child.kind === "expr" && child.renderMode !== "html" && child.renderMode !== "react-node"),
    )
  ) {
    return undefined;
  }

  const values = dynamicChildren.map((child) => child.code);
  let dynamicIndex = 0;
  const pieces = children.map((child) => {
    if (child.kind === "text") {
      return stringLiteral(escapeHtml(child.value));
    }

    const index = dynamicIndex;
    dynamicIndex += 1;

    return `_escaped[${index}]`;
  });

  return `(() => { const _escaped = ${escapeBatchHelperName}([${values.join(", ")}]); return ${pieces.join(" + ")}; })()`;
}

function emitHtmlExpressionFromChildren(
  children: JsxNodeIr[],
  escapeHelperName: string,
  escapeBatchHelperName: string | undefined,
  asyncComponentNames: ReadonlySet<string>,
  dynamicAttributes: "drop" | "emit",
  contextProviderHelperName?: string,
  contextConsumerHelperName?: string,
  reactNodeRenderHelperName?: string,
): string {
  if (children.length === 0) {
    return "\"\"";
  }

  return emitHtmlExpression(
    { kind: "fragment", children },
    escapeHelperName,
    escapeBatchHelperName,
    asyncComponentNames,
    dynamicAttributes,
    contextProviderHelperName,
    contextConsumerHelperName,
    reactNodeRenderHelperName,
  );
}

function emitListRenderer(
  node: Extract<JsxNodeIr, { kind: "list" }>,
  parameters: string,
  escapeHelperName: string,
  escapeBatchHelperName: string | undefined,
  asyncComponentNames: ReadonlySet<string>,
  dynamicAttributes: "drop" | "emit",
  contextProviderHelperName?: string,
  contextConsumerHelperName?: string,
  reactNodeRenderHelperName?: string,
): string {
  const valueExpression = emitHtmlExpressionFromChildren(
    node.children,
    escapeHelperName,
    escapeBatchHelperName,
    asyncComponentNames,
    dynamicAttributes,
    contextProviderHelperName,
    contextConsumerHelperName,
    reactNodeRenderHelperName,
  );
  const asyncKeyword = containsAsyncServerOperationInChildren(
    node.children,
    asyncComponentNames,
  )
    ? "async "
    : "";

  if (node.bodyStatements === undefined || node.bodyStatements.length === 0) {
    return `${asyncKeyword}(${parameters}) => ${valueExpression}`;
  }

  return `${asyncKeyword}(${parameters}) => {\n${node.bodyStatements.map((statement) => `    ${statement}`).join("\n")}\n    return ${valueExpression};\n  }`;
}

function emitPropsObject(
  props: ComponentPropIr[],
  children: JsxNodeIr[] = [],
  escapeHelperName: string,
  escapeBatchHelperName: string | undefined,
  asyncComponentNames: ReadonlySet<string>,
  dynamicAttributes: "drop" | "emit",
  contextProviderHelperName?: string,
  contextConsumerHelperName?: string,
  reactNodeRenderHelperName?: string,
): string {
  const entries = props.map((prop) => {
    if (prop.kind === "spread-prop") {
      return `...(${prop.code})`;
    }

    if (prop.kind === "render-prop") {
      return `${emitPropName(prop.name)}: ${emitHtmlExpressionFromChildren(prop.children, escapeHelperName, escapeBatchHelperName, asyncComponentNames, dynamicAttributes, contextProviderHelperName, contextConsumerHelperName, reactNodeRenderHelperName)}`;
    }

    return `${emitPropName(prop.name)}: (${prop.code})`;
  });

  if (children.length > 0) {
    entries.push(
      `children: ${emitHtmlExpressionFromChildren(children, escapeHelperName, escapeBatchHelperName, asyncComponentNames, dynamicAttributes, contextProviderHelperName, contextConsumerHelperName, reactNodeRenderHelperName)}`,
    );
  }

  return `{ ${entries.join(", ")} }`;
}

function emitComponentCallExpression(
  name: string,
  propsCode: string,
  asyncComponentNames: ReadonlySet<string>,
): string {
  const call = `${name}(${propsCode})`;
  return asyncComponentNames.has(name) ? `(await ${call})` : call;
}

function collectAsyncServerComponentNames(components: readonly ComponentIr[]): Set<string> {
  const names = new Set(
    components
      .filter((component) => component.async === true)
      .map((component) => component.name),
  );

  let changed = true;

  while (changed) {
    changed = false;

    for (const component of components) {
      if (
        !names.has(component.name) &&
        containsAsyncServerOperation(component.root, names)
      ) {
        names.add(component.name);
        changed = true;
      }
    }
  }

  return names;
}

function containsAsyncServerOperationInChildren(
  children: readonly JsxNodeIr[],
  asyncComponentNames: ReadonlySet<string>,
): boolean {
  return children.some((child) => containsAsyncServerOperation(child, asyncComponentNames));
}

function containsAsyncServerOperation(
  node: JsxNodeIr,
  asyncComponentNames: ReadonlySet<string>,
): boolean {
  if (node.kind === "async-boundary") {
    return true;
  }

  if (node.kind === "component") {
    return (
      asyncComponentNames.has(node.name) ||
      containsAsyncServerOperationInChildren(node.children, asyncComponentNames) ||
      node.props.some(
        (prop) =>
          prop.kind === "render-prop" &&
          containsAsyncServerOperationInChildren(prop.children, asyncComponentNames),
      )
    );
  }

  if (node.kind === "conditional") {
    return containsAsyncServerOperationInChildren(
      [...node.whenTrue, ...node.whenFalse],
      asyncComponentNames,
    );
  }

  if (node.kind === "list") {
    return containsAsyncServerOperationInChildren(node.children, asyncComponentNames);
  }

  if (node.kind === "element" || node.kind === "fragment") {
    return containsAsyncServerOperationInChildren(node.children, asyncComponentNames);
  }

  return false;
}

function emitPropName(name: string): string {
  return /^[A-Za-z_$][\w$]*$/.test(name) ? name : JSON.stringify(name);
}

function allocateEscapeHelperName(ir: ModuleIr): string {
  return allocateHelperName(ir, "_escapeHtml");
}

function allocateHelperName(ir: ModuleIr, baseName: string): string {
  const reservedNames = new Set<string>(ir.moduleBindingNames);

  for (const component of ir.components) {
    reservedNames.add(component.name);

    for (const bindingName of component.bindingNames) {
      reservedNames.add(bindingName);
    }
  }

  let name = baseName;
  let index = 1;

  while (reservedNames.has(name)) {
    name = `${baseName}$${index}`;
    index += 1;
  }

  return name;
}

function usesContextProvider(ir: ModuleIr): boolean {
  return ir.components.some((component) => containsContextProvider(component.root));
}

function usesContextConsumer(ir: ModuleIr): boolean {
  return ir.components.some((component) => containsContextConsumer(component.root));
}

function usesReactNodeRender(ir: ModuleIr): boolean {
  return ir.components.some((component) => containsReactNodeRender(component.root));
}

function containsReactNodeRender(node: JsxNodeIr): boolean {
  if (node.kind === "expr") {
    return node.renderMode === "react-node";
  }

  if (node.kind === "conditional") {
    return [...node.whenTrue, ...node.whenFalse].some(containsReactNodeRender);
  }

  if (node.kind === "list") {
    return node.children.some(containsReactNodeRender);
  }

  if (node.kind === "fragment" || node.kind === "element") {
    return node.children.some(containsReactNodeRender);
  }

  if (node.kind === "component") {
    return (
      node.children.some(containsReactNodeRender) ||
      node.props.some(
        (prop) => prop.kind === "render-prop" && prop.children.some(containsReactNodeRender),
      )
    );
  }

  if (node.kind === "async-boundary") {
    return (
      node.children.some(containsReactNodeRender) ||
      node.placeholderChildren?.some(containsReactNodeRender) === true ||
      node.catchChildren?.some(containsReactNodeRender) === true
    );
  }

  return false;
}

function containsContextProvider(node: JsxNodeIr): boolean {
  if (node.kind === "component" && node.name.endsWith(".Provider")) {
    return true;
  }

  if (node.kind === "conditional") {
    return [...node.whenTrue, ...node.whenFalse].some(containsContextProvider);
  }

  if (node.kind === "list") {
    return node.children.some(containsContextProvider);
  }

  if (node.kind === "fragment" || node.kind === "element") {
    return node.children.some(containsContextProvider);
  }

  if (node.kind === "component") {
    return (
      node.children.some(containsContextProvider) ||
      node.props.some(
        (prop) => prop.kind === "render-prop" && prop.children.some(containsContextProvider),
      )
    );
  }

  return false;
}

function containsContextConsumer(node: JsxNodeIr): boolean {
  if (node.kind === "component" && node.name.endsWith(".Consumer")) {
    return true;
  }

  if (node.kind === "conditional") {
    return [...node.whenTrue, ...node.whenFalse].some(containsContextConsumer);
  }

  if (node.kind === "list") {
    return node.children.some(containsContextConsumer);
  }

  if (node.kind === "fragment" || node.kind === "element") {
    return node.children.some(containsContextConsumer);
  }

  if (node.kind === "component") {
    return (
      node.children.some(containsContextConsumer) ||
      node.props.some(
        (prop) => prop.kind === "render-prop" && prop.children.some(containsContextConsumer),
      )
    );
  }

  return false;
}

function findComponentPropCode(
  props: readonly ComponentPropIr[],
  name: string,
): string | undefined {
  for (const prop of props) {
    if (prop.kind === "prop" && prop.name === name) {
      return prop.code;
    }
  }

  return undefined;
}

function findComponentRenderProp(
  props: readonly ComponentPropIr[],
  name: string,
): Extract<ComponentPropIr, { kind: "render-prop" }> | undefined {
  for (const prop of props) {
    if (prop.kind === "render-prop" && prop.name === name) {
      return prop;
    }
  }

  return undefined;
}

function stringLiteral(value: string): string {
  return JSON.stringify(value);
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;");
}
