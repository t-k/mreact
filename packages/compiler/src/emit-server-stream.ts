import type { ComponentIr, JsxNodeIr, ModuleIr } from "./ir.js";
import type { RuntimeImport } from "./types.js";

export interface EmitServerStreamResult {
  code: string;
  imports: RuntimeImport[];
}

export function emitServerStream(ir: ModuleIr): EmitServerStreamResult {
  const escapeHelperName = allocateHelperName(ir, "_escapeHtml");
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
  const sinkName = allocateComponentSinkName(component);
  const parameters = [sinkName, ...component.parameters].join(", ");
  const body = component.bodyStatements.map((statement) => `  ${statement}`);
  const appendStatements = emitAppendStatements(
    component.root,
    sinkName,
    escapeHelperName,
  );

  return [
    `export function ${component.name}(${parameters}) {`,
    ...body,
    ...appendStatements,
    `}`,
  ].join("\n");
}

function emitAppendStatements(
  node: JsxNodeIr,
  sinkName: string,
  escapeHelperName: string,
): string[] {
  return collectHtmlParts(node, escapeHelperName).map((part) => {
    const expression =
      part.kind === "static"
        ? stringLiteral(part.value)
        : `${escapeHelperName}(${part.code})`;

    return `  ${sinkName}.append(${expression});`;
  });
}

type HtmlPart =
  | {
      kind: "static";
      value: string;
    }
  | {
      kind: "dynamic";
      code: string;
    };

function collectHtmlParts(
  node: JsxNodeIr,
  escapeHelperName: string,
): HtmlPart[] {
  void escapeHelperName;

  if (node.kind === "text") {
    return [{ kind: "static", value: escapeHtml(node.value) }];
  }

  if (node.kind === "expr") {
    return [{ kind: "dynamic", code: node.code }];
  }

  if (node.kind === "fragment") {
    return node.children.flatMap((child) =>
      collectHtmlParts(child, escapeHelperName),
    );
  }

  const attrs = node.attributes
    .filter((attr) => attr.kind === "static-attr")
    .map((attr) => ` ${attr.name}="${escapeHtml(attr.value)}"`)
    .join("");
  const openTag = `<${node.tagName}${attrs}>`;
  const closeTag = `</${node.tagName}>`;

  return [
    { kind: "static", value: openTag },
    ...node.children.flatMap((child) =>
      collectHtmlParts(child, escapeHelperName),
    ),
    { kind: "static", value: closeTag },
  ];
}

function allocateComponentSinkName(component: ComponentIr): string {
  const reservedNames = new Set([
    component.name,
    component.exportName,
    ...component.bindingNames,
  ]);
  let name = "$sink";
  let index = 1;

  while (reservedNames.has(name)) {
    name = `$sink$${index}`;
    index += 1;
  }

  return name;
}

function allocateHelperName(ir: ModuleIr, baseName: string): string {
  const reservedNames = new Set<string>();

  for (const component of ir.components) {
    reservedNames.add(component.name);
    reservedNames.add(component.exportName);

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
