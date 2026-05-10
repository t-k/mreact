import type { ComponentIr, JsxNodeIr, ModuleIr } from "./ir.js";
import type { RuntimeImport } from "./types.js";

export interface EmitServerStreamResult {
  code: string;
  imports: RuntimeImport[];
}

export function emitServerStream(ir: ModuleIr): EmitServerStreamResult {
  const escapeHelperName = allocateHelperName(ir, "_escapeHtml");
  const asyncBoundaryHelperName = allocateHelperName(ir, "_renderAsyncBoundary");
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
      emitComponent(component, escapeHelperName, asyncBoundaryHelperName),
    )
    .join("\n\n");
  const imports = hasAsyncBoundary(ir)
    ? [
        {
          source: "@modular-react/server",
          specifiers: ["renderAsyncBoundary"],
        },
      ]
    : [];
  const importLine = hasAsyncBoundary(ir)
    ? `import { renderAsyncBoundary as ${asyncBoundaryHelperName} } from "@modular-react/server";\n\n`
    : "";

  return {
    code: `${importLine}${helper}\n\n${components}\n`,
    imports,
  };
}

function emitComponent(
  component: ComponentIr,
  escapeHelperName: string,
  asyncBoundaryHelperName: string,
): string {
  const sinkName = allocateComponentSinkName(component);
  const parameters = [sinkName, ...component.parameters].join(", ");
  const body = component.bodyStatements.map((statement) => `  ${statement}`);
  const appendStatements = emitAppendStatements(
    component.root,
    sinkName,
    escapeHelperName,
    asyncBoundaryHelperName,
  );
  const functionKeyword = containsAsyncBoundary(component.root)
    ? "export async function"
    : "export function";

  return [
    `${functionKeyword} ${component.name}(${parameters}) {`,
    ...body,
    ...appendStatements,
    `}`,
  ].join("\n");
}

function emitAppendStatements(
  node: JsxNodeIr,
  sinkName: string,
  escapeHelperName: string,
  asyncBoundaryHelperName: string,
): string[] {
  return collectHtmlParts(node, escapeHelperName, asyncBoundaryHelperName).map(
    (part) => {
      if (part.kind === "async-boundary") {
        return emitAsyncBoundary(part, sinkName, asyncBoundaryHelperName);
      }

      const expression =
        part.kind === "static"
          ? stringLiteral(part.value)
          : `${escapeHelperName}(${part.code})`;

      return `  ${sinkName}.append(${expression});`;
    },
  );
}

function emitAsyncBoundary(
  part: Extract<HtmlPart, { kind: "async-boundary" }>,
  sinkName: string,
  asyncBoundaryHelperName: string,
): string {
  const catchOption =
    part.catchName === undefined || part.catchParts === undefined
      ? ""
      : `, { catch: (${sinkName}, ${part.catchName}) => {\n${emitNestedAppendStatements(part.catchParts, sinkName)}\n  } }`;

  return [
    `  await ${asyncBoundaryHelperName}(${sinkName}, (${part.valueCode}), (${sinkName}, ${part.valueName}) => {`,
    emitNestedAppendStatements(part.parts, sinkName),
    `  }${catchOption});`,
  ].join("\n");
}

function emitNestedAppendStatements(
  parts: Exclude<HtmlPart, { kind: "async-boundary" }>[],
  sinkName: string,
): string {
  return parts
    .map((part) => {
      const expression =
        part.kind === "static"
          ? stringLiteral(part.value)
          : `${part.escapeHelperName}(${part.code})`;

      return `    ${sinkName}.append(${expression});`;
    })
    .join("\n");
}

type HtmlPart =
  | {
      kind: "static";
      value: string;
    }
  | {
      kind: "dynamic";
      code: string;
      escapeHelperName: string;
    }
  | {
      kind: "async-boundary";
      valueCode: string;
      valueName: string;
      parts: Exclude<HtmlPart, { kind: "async-boundary" }>[];
      catchName?: string;
      catchParts?: Exclude<HtmlPart, { kind: "async-boundary" }>[];
    };

function collectHtmlParts(
  node: JsxNodeIr,
  escapeHelperName: string,
  asyncBoundaryHelperName: string,
): HtmlPart[] {
  void asyncBoundaryHelperName;

  if (node.kind === "text") {
    return [{ kind: "static", value: escapeHtml(node.value) }];
  }

  if (node.kind === "expr") {
    return [{ kind: "dynamic", code: node.code, escapeHelperName }];
  }

  if (node.kind === "async-boundary") {
    return [
      {
        kind: "async-boundary",
        valueCode: node.valueCode,
        valueName: node.valueName,
        parts: node.children.flatMap((child) =>
          collectHtmlParts(child, escapeHelperName, asyncBoundaryHelperName),
        ) as Exclude<HtmlPart, { kind: "async-boundary" }>[],
        ...(node.catchName === undefined || node.catchChildren === undefined
          ? {}
          : {
              catchName: node.catchName,
              catchParts: node.catchChildren.flatMap((child) =>
                collectHtmlParts(child, escapeHelperName, asyncBoundaryHelperName),
              ) as Exclude<HtmlPart, { kind: "async-boundary" }>[],
            }),
      },
    ];
  }

  if (node.kind === "fragment") {
    return node.children.flatMap((child) =>
      collectHtmlParts(child, escapeHelperName, asyncBoundaryHelperName),
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
      collectHtmlParts(child, escapeHelperName, asyncBoundaryHelperName),
    ),
    { kind: "static", value: closeTag },
  ];
}

function hasAsyncBoundary(ir: ModuleIr): boolean {
  return ir.components.some((component) => containsAsyncBoundary(component.root));
}

function containsAsyncBoundary(node: JsxNodeIr): boolean {
  if (node.kind === "async-boundary") {
    return true;
  }

  if (node.kind === "element" || node.kind === "fragment") {
    return node.children.some(containsAsyncBoundary);
  }

  return false;
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
