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
    .map((component) => emitComponent(component, escapeHelperName, options))
    .join("\n\n");
  const userImports = emitUserImports(ir);
  const moduleStatements = emitModuleStatements(ir);

  return {
    code: `${[userImports, moduleStatements, helper].filter(Boolean).join("\n\n")}\n\n${components}\n`,
    imports: [],
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
): string {
  const body = component.bodyStatements.map((statement) => `  ${statement}`);
  const parameters = component.parameters.join(", ");
  const htmlExpression = emitHtmlExpression(component.root, escapeHelperName);
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

function emitHtmlExpression(node: JsxNodeIr, escapeHelperName: string): string {
  const parts = collectHtmlParts(node, escapeHelperName);

  if (parts.length === 0) {
    return "\"\"";
  }

  return parts.join(" + ");
}

function collectHtmlParts(
  node: JsxNodeIr,
  escapeHelperName: string,
): string[] {
  if (node.kind === "text") {
    return [stringLiteral(escapeHtml(node.value))];
  }

  if (node.kind === "expr") {
    return [`${escapeHelperName}(${node.code})`];
  }

  if (node.kind === "conditional") {
    return [
      `((${node.conditionCode}) ? ${emitHtmlExpressionFromChildren(node.whenTrue, escapeHelperName)} : ${emitHtmlExpressionFromChildren(node.whenFalse, escapeHelperName)})`,
    ];
  }

  if (node.kind === "list") {
    const parameters =
      node.indexName === undefined
        ? node.itemName
        : `${node.itemName}, ${node.indexName}`;
    return [
      `(${node.itemsCode}).map((${parameters}) => ${emitHtmlExpressionFromChildren(node.children, escapeHelperName)}).join("")`,
    ];
  }

  if (node.kind === "fragment") {
    return node.children.flatMap((child) =>
      collectHtmlParts(child, escapeHelperName),
    );
  }

  if (node.kind === "component") {
    return [`${node.name}(${emitPropsObject(node.props, node.children, escapeHelperName)})`];
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
      collectHtmlParts(child, escapeHelperName),
    ),
    stringLiteral(closeTag),
  ];
}

function emitHtmlExpressionFromChildren(
  children: JsxNodeIr[],
  escapeHelperName: string,
): string {
  if (children.length === 0) {
    return "\"\"";
  }

  return emitHtmlExpression(
    { kind: "fragment", children },
    escapeHelperName,
  );
}

function emitPropsObject(
  props: ComponentPropIr[],
  children: JsxNodeIr[] = [],
  escapeHelperName = "_escapeHtml",
): string {
  const entries = props.map((prop) => {
    if (prop.kind === "spread-prop") {
      return `...(${prop.code})`;
    }

    if (prop.kind === "render-prop") {
      return `${emitPropName(prop.name)}: ${emitHtmlExpressionFromChildren(prop.children, escapeHelperName)}`;
    }

    return `${emitPropName(prop.name)}: (${prop.code})`;
  });

  if (children.length > 0) {
    entries.push(
      `children: ${emitHtmlExpressionFromChildren(children, escapeHelperName)}`,
    );
  }

  return `{ ${entries.join(", ")} }`;
}

function emitPropName(name: string): string {
  return /^[A-Za-z_$][\w$]*$/.test(name) ? name : JSON.stringify(name);
}

function allocateEscapeHelperName(ir: ModuleIr): string {
  const reservedNames = new Set<string>(ir.moduleBindingNames);

  for (const component of ir.components) {
    reservedNames.add(component.name);

    for (const bindingName of component.bindingNames) {
      reservedNames.add(bindingName);
    }
  }

  let name = "_escapeHtml";
  let index = 1;

  while (reservedNames.has(name)) {
    name = `_escapeHtml$${index}`;
    index += 1;
  }

  return name;
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
