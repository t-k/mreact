import type {
  ComponentPropIr,
  ComponentIr,
  JsxNodeIr,
  ModuleIr,
} from "./ir.js";
import type { RuntimeImport } from "./types.js";

export interface EmitResult {
  code: string;
  imports: RuntimeImport[];
}

export interface EmitServerOptions {
  serverHydration?: boolean;
}

export function emitServer(
  ir: ModuleIr,
  options: EmitServerOptions = {},
): EmitResult {
  const escapeHelperName = allocateEscapeHelperName(ir);
  const contextProviderHelperName = usesContextProvider(ir)
    ? allocateHelperName(ir, "_renderContextProviderToString")
    : undefined;
  const contextConsumerHelperName = usesContextConsumer(ir)
    ? allocateHelperName(ir, "_renderContextConsumerToString")
    : undefined;
  const helper = [
    `function ${escapeHelperName}(value) {`,
    `  return String(value ?? "")`,
    `    .replaceAll("&", "&amp;")`,
    `    .replaceAll("<", "&lt;")`,
    `    .replaceAll(">", "&gt;")`,
    `    .replaceAll("\\"", "&quot;");`,
    `}`,
  ].join("\n");
  const components = ir.components
    .map((component) =>
      emitComponent(
        component,
        escapeHelperName,
        options,
        contextProviderHelperName,
        contextConsumerHelperName,
      ),
    )
    .join("\n\n");
  const userImports = emitUserImports(ir);
  const contextImport = emitContextImport(
    contextProviderHelperName,
    contextConsumerHelperName,
  );
  const moduleStatements = emitModuleStatements(ir);

  return {
    code: `${[userImports, contextImport, moduleStatements, helper].filter(Boolean).join("\n\n")}\n\n${components}\n`,
    imports: collectContextImports(
      contextProviderHelperName,
      contextConsumerHelperName,
    ),
  };
}

function emitContextImport(
  contextProviderHelperName: string | undefined,
  contextConsumerHelperName: string | undefined,
): string {
  const specifiers = [
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
): RuntimeImport[] {
  const specifiers = [
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
  options: EmitServerOptions,
  contextProviderHelperName?: string,
  contextConsumerHelperName?: string,
): string {
  const body = component.bodyStatements.map((statement) => `  ${statement}`);
  const parameters = component.parameters.join(", ");
  const htmlExpression = emitHtmlExpression(
    component.root,
    escapeHelperName,
    contextProviderHelperName,
    contextConsumerHelperName,
  );
  const returnExpression =
    options.serverHydration === true
      ? `${stringLiteral(`<!--mreact-h:start:${encodeURIComponent(component.name)}-->`)} + ${htmlExpression} + ${stringLiteral(`<!--mreact-h:end:${encodeURIComponent(component.name)}-->`)}`
      : htmlExpression;

  return [
    `${component.exportDefault === true ? "export default " : component.exported === false ? "" : "export "}function ${component.name}(${parameters}) {`,
    ...body,
    `  return ${returnExpression};`,
    `}`,
  ].join("\n");
}

function emitHtmlExpression(
  node: JsxNodeIr,
  escapeHelperName: string,
  contextProviderHelperName?: string,
  contextConsumerHelperName?: string,
): string {
  const parts = collectHtmlParts(
    node,
    escapeHelperName,
    contextProviderHelperName,
    contextConsumerHelperName,
  );

  if (parts.length === 0) {
    return "\"\"";
  }

  return parts.join(" + ");
}

function collectHtmlParts(
  node: JsxNodeIr,
  escapeHelperName: string,
  contextProviderHelperName?: string,
  contextConsumerHelperName?: string,
): string[] {
  if (node.kind === "text") {
    return [stringLiteral(escapeHtml(node.value))];
  }

  if (node.kind === "expr") {
    if (node.renderMode === "html") {
      return [rawHtmlExpression(node.code)];
    }

    return [`${escapeHelperName}(${node.code})`];
  }

  if (node.kind === "conditional") {
    return [
      `((${node.conditionCode}) ? ${emitHtmlExpressionFromChildren(node.whenTrue, escapeHelperName, contextProviderHelperName, contextConsumerHelperName)} : ${emitHtmlExpressionFromChildren(node.whenFalse, escapeHelperName, contextProviderHelperName, contextConsumerHelperName)})`,
    ];
  }

  if (node.kind === "list") {
    const parameters =
      node.indexName === undefined
        ? node.itemName
        : `${node.itemName}, ${node.indexName}`;
    return [
      `(${node.itemsCode}).map(${emitListRenderer(node, parameters, escapeHelperName, contextProviderHelperName, contextConsumerHelperName)}).join("")`,
    ];
  }

  if (node.kind === "fragment") {
    return node.children.flatMap((child) =>
      collectHtmlParts(
        child,
        escapeHelperName,
        contextProviderHelperName,
        contextConsumerHelperName,
      ),
    );
  }

  if (node.kind === "component") {
    if (contextProviderHelperName !== undefined && node.name.endsWith(".Provider")) {
      const valueCode = findComponentPropCode(node.props, "value") ?? "undefined";
      return [
        `${contextProviderHelperName}(${node.name}, ${valueCode}, () => ${emitHtmlExpressionFromChildren(node.children, escapeHelperName, contextProviderHelperName, contextConsumerHelperName)})`,
      ];
    }

    if (contextConsumerHelperName !== undefined && node.name.endsWith(".Consumer")) {
      const renderProp = findComponentRenderProp(node.props, "children");

      if (renderProp !== undefined) {
        const valueName = renderProp.valueName ?? "_value";
        return [
          `${contextConsumerHelperName}(${node.name}, (${valueName}) => ${emitHtmlExpressionFromChildren(renderProp.children, escapeHelperName, contextProviderHelperName, contextConsumerHelperName)})`,
        ];
      }
    }

    return [
      `${node.name}(${emitPropsObject(node.props, node.children, escapeHelperName, contextProviderHelperName, contextConsumerHelperName)})`,
    ];
  }

  if (node.kind === "async-boundary") {
    return [];
  }

  const attrs = node.attributes
    .filter((attr) => attr.kind === "static-attr")
    .map((attr) => ` ${attr.name}="${escapeHtml(attr.value)}"`)
    .join("");
  const openTag = `<${node.tagName}${attrs}>`;
  const closeTag = `</${node.tagName}>`;

  return [
    stringLiteral(openTag),
    ...node.children.flatMap((child) =>
      collectHtmlParts(
        child,
        escapeHelperName,
        contextProviderHelperName,
        contextConsumerHelperName,
      ),
    ),
    stringLiteral(closeTag),
  ];
}

function rawHtmlExpression(code: string): string {
  return `(() => { const _value = (${code}); return Array.isArray(_value) ? _value.join("") : String(_value ?? ""); })()`;
}

function emitHtmlExpressionFromChildren(
  children: JsxNodeIr[],
  escapeHelperName: string,
  contextProviderHelperName?: string,
  contextConsumerHelperName?: string,
): string {
  if (children.length === 0) {
    return "\"\"";
  }

  return emitHtmlExpression(
    { kind: "fragment", children },
    escapeHelperName,
    contextProviderHelperName,
    contextConsumerHelperName,
  );
}

function emitListRenderer(
  node: Extract<JsxNodeIr, { kind: "list" }>,
  parameters: string,
  escapeHelperName: string,
  contextProviderHelperName?: string,
  contextConsumerHelperName?: string,
): string {
  const valueExpression = emitHtmlExpressionFromChildren(
    node.children,
    escapeHelperName,
    contextProviderHelperName,
    contextConsumerHelperName,
  );

  if (node.bodyStatements === undefined || node.bodyStatements.length === 0) {
    return `(${parameters}) => ${valueExpression}`;
  }

  return `(${parameters}) => {\n${node.bodyStatements.map((statement) => `    ${statement}`).join("\n")}\n    return ${valueExpression};\n  }`;
}

function emitPropsObject(
  props: ComponentPropIr[],
  children: JsxNodeIr[] = [],
  escapeHelperName = "_escapeHtml",
  contextProviderHelperName?: string,
  contextConsumerHelperName?: string,
): string {
  const entries = props.map((prop) => {
    if (prop.kind === "spread-prop") {
      return `...(${prop.code})`;
    }

    if (prop.kind === "render-prop") {
      return `${emitPropName(prop.name)}: ${emitHtmlExpressionFromChildren(prop.children, escapeHelperName, contextProviderHelperName, contextConsumerHelperName)}`;
    }

    return `${emitPropName(prop.name)}: (${prop.code})`;
  });

  if (children.length > 0) {
    entries.push(
      `children: ${emitHtmlExpressionFromChildren(children, escapeHelperName, contextProviderHelperName, contextConsumerHelperName)}`,
    );
  }

  return `{ ${entries.join(", ")} }`;
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
