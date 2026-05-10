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
      emitComponent(component, escapeHelperName, options, contextProviderHelperName),
    )
    .join("\n\n");
  const userImports = emitUserImports(ir);
  const contextImport =
    contextProviderHelperName === undefined
      ? ""
      : `import { renderContextProviderToString as ${contextProviderHelperName} } from "@modular-react/react-compat";`;
  const moduleStatements = emitModuleStatements(ir);

  return {
    code: `${[userImports, contextImport, moduleStatements, helper].filter(Boolean).join("\n\n")}\n\n${components}\n`,
    imports:
      contextProviderHelperName === undefined
        ? []
        : [
            {
              source: "@modular-react/react-compat",
              specifiers: ["renderContextProviderToString"],
            },
          ],
  };
}

function emitUserImports(ir: ModuleIr): string {
  return ir.components.length === 0 ? "" : ir.userImports.join("\n");
}

function emitModuleStatements(ir: ModuleIr): string {
  return ir.components.length === 0 ? "" : ir.moduleStatements.join("\n");
}

function emitComponent(
  component: ComponentIr,
  escapeHelperName: string,
  options: EmitServerOptions,
  contextProviderHelperName?: string,
): string {
  const body = component.bodyStatements.map((statement) => `  ${statement}`);
  const parameters = component.parameters.join(", ");
  const htmlExpression = emitHtmlExpression(
    component.root,
    escapeHelperName,
    contextProviderHelperName,
  );
  const returnExpression =
    options.serverHydration === true
      ? `${stringLiteral(`<!--mreact-h:start:${encodeURIComponent(component.name)}-->`)} + ${htmlExpression} + ${stringLiteral(`<!--mreact-h:end:${encodeURIComponent(component.name)}-->`)}`
      : htmlExpression;

  return [
    `${component.exported === false ? "" : "export "}function ${component.name}(${parameters}) {`,
    ...body,
    `  return ${returnExpression};`,
    `}`,
  ].join("\n");
}

function emitHtmlExpression(
  node: JsxNodeIr,
  escapeHelperName: string,
  contextProviderHelperName?: string,
): string {
  const parts = collectHtmlParts(node, escapeHelperName, contextProviderHelperName);

  if (parts.length === 0) {
    return "\"\"";
  }

  return parts.join(" + ");
}

function collectHtmlParts(
  node: JsxNodeIr,
  escapeHelperName: string,
  contextProviderHelperName?: string,
): string[] {
  if (node.kind === "text") {
    return [stringLiteral(escapeHtml(node.value))];
  }

  if (node.kind === "expr") {
    return [`${escapeHelperName}(${node.code})`];
  }

  if (node.kind === "conditional") {
    return [
      `((${node.conditionCode}) ? ${emitHtmlExpressionFromChildren(node.whenTrue, escapeHelperName, contextProviderHelperName)} : ${emitHtmlExpressionFromChildren(node.whenFalse, escapeHelperName, contextProviderHelperName)})`,
    ];
  }

  if (node.kind === "list") {
    const parameters =
      node.indexName === undefined
        ? node.itemName
        : `${node.itemName}, ${node.indexName}`;
    return [
      `(${node.itemsCode}).map((${parameters}) => ${emitHtmlExpressionFromChildren(node.children, escapeHelperName, contextProviderHelperName)}).join("")`,
    ];
  }

  if (node.kind === "fragment") {
    return node.children.flatMap((child) =>
      collectHtmlParts(child, escapeHelperName, contextProviderHelperName),
    );
  }

  if (node.kind === "component") {
    if (contextProviderHelperName !== undefined && node.name.endsWith(".Provider")) {
      const valueCode = findComponentPropCode(node.props, "value") ?? "undefined";
      return [
        `${contextProviderHelperName}(${node.name}, ${valueCode}, () => ${emitHtmlExpressionFromChildren(node.children, escapeHelperName, contextProviderHelperName)})`,
      ];
    }

    return [
      `${node.name}(${emitPropsObject(node.props, node.children, escapeHelperName, contextProviderHelperName)})`,
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
      collectHtmlParts(child, escapeHelperName, contextProviderHelperName),
    ),
    stringLiteral(closeTag),
  ];
}

function emitHtmlExpressionFromChildren(
  children: JsxNodeIr[],
  escapeHelperName: string,
  contextProviderHelperName?: string,
): string {
  if (children.length === 0) {
    return "\"\"";
  }

  return emitHtmlExpression(
    { kind: "fragment", children },
    escapeHelperName,
    contextProviderHelperName,
  );
}

function emitPropsObject(
  props: ComponentPropIr[],
  children: JsxNodeIr[] = [],
  escapeHelperName = "_escapeHtml",
  contextProviderHelperName?: string,
): string {
  const entries = props.map((prop) => {
    if (prop.kind === "spread-prop") {
      return `...(${prop.code})`;
    }

    if (prop.kind === "render-prop") {
      return `${emitPropName(prop.name)}: ${emitHtmlExpressionFromChildren(prop.children, escapeHelperName, contextProviderHelperName)}`;
    }

    return `${emitPropName(prop.name)}: (${prop.code})`;
  });

  if (children.length > 0) {
    entries.push(
      `children: ${emitHtmlExpressionFromChildren(children, escapeHelperName, contextProviderHelperName)}`,
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
