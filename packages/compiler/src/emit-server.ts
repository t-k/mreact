import type { ComponentIr, JsxNodeIr, ModuleIr } from "./ir.js";
import type { RuntimeImport } from "./types.js";

export interface EmitResult {
  code: string;
  imports: RuntimeImport[];
}

export function emitServer(ir: ModuleIr): EmitResult {
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
    .map((component) => emitComponent(component, escapeHelperName))
    .join("\n\n");

  return {
    code: `${helper}\n\n${components}\n`,
    imports: [],
  };
}

function emitComponent(
  component: ComponentIr,
  escapeHelperName: string,
): string {
  const body = component.bodyStatements.map((statement) => `  ${statement}`);
  const parameters = component.parameters.join(", ");

  return [
    `export function ${component.name}(${parameters}) {`,
    ...body,
    `  return ${emitHtmlExpression(component.root, escapeHelperName)};`,
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

  if (node.kind === "fragment") {
    return node.children.flatMap((child) =>
      collectHtmlParts(child, escapeHelperName),
    );
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

function allocateEscapeHelperName(ir: ModuleIr): string {
  const reservedNames = new Set<string>();

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
