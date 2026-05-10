import type {
  ComponentPropIr,
  ComponentIr,
  JsxNodeIr,
  ModuleIr,
} from "./ir.js";
import type { RuntimeImport, ServerBootstrapMode } from "./types.js";

export interface EmitServerStreamResult {
  code: string;
  imports: RuntimeImport[];
}

export interface EmitServerStreamOptions {
  serverBootstrap?: ServerBootstrapMode;
  serverBootstrapNonce?: string;
  serverBootstrapSrc?: string;
}

export function emitServerStream(
  ir: ModuleIr,
  options: EmitServerStreamOptions = {},
): EmitServerStreamResult {
  const serverBootstrap = options.serverBootstrap ?? "none";
  const escapeHelperName = allocateHelperName(ir, "_escapeHtml");
  const asyncBoundaryHelperName = allocateHelperName(ir, "_renderAsyncBoundary");
  const outOfOrderBoundaryHelperName = allocateHelperName(
    ir,
    "_renderOutOfOrderBoundary",
  );
  const reorderScriptHelperName = allocateHelperName(
    ir,
    "_renderOutOfOrderReorderScript",
  );
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
        asyncBoundaryHelperName,
        outOfOrderBoundaryHelperName,
        reorderScriptHelperName,
        {
          serverBootstrap,
          ...(options.serverBootstrapNonce === undefined
            ? {}
            : { serverBootstrapNonce: options.serverBootstrapNonce }),
          ...(options.serverBootstrapSrc === undefined
            ? {}
            : { serverBootstrapSrc: options.serverBootstrapSrc }),
        },
      ),
    )
    .join("\n\n");
  const imports = collectImports(ir, serverBootstrap);
  const importAliases: Record<string, string> = {
    renderAsyncBoundary: asyncBoundaryHelperName,
    renderOutOfOrderBoundary: outOfOrderBoundaryHelperName,
    renderOutOfOrderReorderScript: reorderScriptHelperName,
  };
  const importLine =
    imports.length === 0
      ? ""
      : `import { ${imports[0]?.specifiers
          .map((specifier) => `${specifier} as ${importAliases[specifier]}`)
          .join(", ")} } from "@modular-react/server";\n\n`;
  const userImports = emitUserImports(ir);
  const moduleStatements = emitModuleStatements(ir);
  const importsBlock = [importLine.trimEnd(), userImports, moduleStatements]
    .filter(Boolean)
    .join("\n");

  return {
    code: `${importsBlock === "" ? "" : `${importsBlock}\n\n`}${helper}\n\n${components}\n`,
    imports,
  };
}

function emitUserImports(ir: ModuleIr): string {
  return ir.components.length === 0 ? "" : ir.userImports.join("\n");
}

function emitModuleStatements(ir: ModuleIr): string {
  return ir.components.length === 0 ? "" : ir.moduleStatements.join("\n");
}

function collectImports(
  ir: ModuleIr,
  serverBootstrap: ServerBootstrapMode,
): RuntimeImport[] {
  const specifiers = [
    ...(hasInOrderAsyncBoundary(ir) ? ["renderAsyncBoundary"] : []),
    ...(hasOutOfOrderAsyncBoundary(ir) ? ["renderOutOfOrderBoundary"] : []),
    ...(serverBootstrap === "out-of-order-reorder" &&
    hasOutOfOrderAsyncBoundary(ir)
      ? ["renderOutOfOrderReorderScript"]
      : []),
  ];

  return specifiers.length === 0
    ? []
    : [
        {
          source: "@modular-react/server",
          specifiers,
        },
      ];
}

function hasInOrderAsyncBoundary(ir: ModuleIr): boolean {
  return ir.components.some((component) =>
    containsAsyncBoundary(component.root, false),
  );
}

function hasOutOfOrderAsyncBoundary(ir: ModuleIr): boolean {
  return ir.components.some((component) =>
    containsAsyncBoundary(component.root, true),
  );
}

function emitComponent(
  component: ComponentIr,
  escapeHelperName: string,
  asyncBoundaryHelperName: string,
  outOfOrderBoundaryHelperName: string,
  reorderScriptHelperName: string,
  options: Required<Pick<EmitServerStreamOptions, "serverBootstrap">> &
    Omit<EmitServerStreamOptions, "serverBootstrap">,
): string {
  const { serverBootstrap, serverBootstrapNonce, serverBootstrapSrc } = options;
  const sinkName = allocateComponentSinkName(component);
  const parameters = [sinkName, ...component.parameters].join(", ");
  const body = component.bodyStatements.map((statement) => `  ${statement}`);
  const appendStatements = emitAppendStatements(
    component.root,
    sinkName,
    escapeHelperName,
    asyncBoundaryHelperName,
    outOfOrderBoundaryHelperName,
  );
  const bootstrapStatements =
    serverBootstrap === "out-of-order-reorder" &&
    containsAsyncBoundary(component.root, true)
      ? [
          `  ${reorderScriptHelperName}(${sinkName}${emitBootstrapOptions(serverBootstrapNonce, serverBootstrapSrc)});`,
        ]
      : [];
  const functionKeyword = `${component.exported === false ? "" : "export "}${
    containsAnyAsyncBoundary(component.root) ? "async " : ""
  }function`;

  return [
    `${functionKeyword} ${component.name}(${parameters}) {`,
    ...body,
    ...appendStatements,
    ...bootstrapStatements,
    `}`,
  ].join("\n");
}

function emitBootstrapOptions(nonce?: string, src?: string): string {
  const entries = [
    ...(nonce === undefined ? [] : [`nonce: ${stringLiteral(nonce)}`]),
    ...(src === undefined ? [] : [`src: ${stringLiteral(src)}`]),
  ];

  return entries.length === 0 ? "" : `, { ${entries.join(", ")} }`;
}

function emitAppendStatements(
  node: JsxNodeIr,
  sinkName: string,
  escapeHelperName: string,
  asyncBoundaryHelperName: string,
  outOfOrderBoundaryHelperName: string,
): string[] {
  return collectHtmlParts(
    node,
    escapeHelperName,
    asyncBoundaryHelperName,
    outOfOrderBoundaryHelperName,
    { nextFragmentId: 0 },
  ).map((part) => {
      if (part.kind === "async-boundary") {
        return emitAsyncBoundary(part, sinkName, asyncBoundaryHelperName);
      }

      if (part.kind === "out-of-order-boundary") {
        return emitOutOfOrderBoundary(part, sinkName, outOfOrderBoundaryHelperName);
      }

      if (part.kind === "component") {
        return `  await ${part.name}(${sinkName}, ${emitPropsObject(part.props, part.children, part.escapeHelperName)});`;
      }

      const expression =
        part.kind === "static"
          ? stringLiteral(part.value)
          : part.kind === "dynamic"
            ? `${escapeHelperName}(${part.code})`
            : part.code;

      return `  ${sinkName}.append(${expression});`;
    });
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

function emitOutOfOrderBoundary(
  part: Extract<HtmlPart, { kind: "out-of-order-boundary" }>,
  sinkName: string,
  outOfOrderBoundaryHelperName: string,
): string {
  const catchOption =
    part.catchName === undefined || part.catchParts === undefined
      ? ""
      : `,\n  catch: (${sinkName}, ${part.catchName}) => {\n${emitNestedAppendStatements(part.catchParts, sinkName)}\n  }`;

  return [
    `  ${outOfOrderBoundaryHelperName}(${sinkName}, ${JSON.stringify(part.id)}, (${part.valueCode}), (${sinkName}, ${part.valueName}) => {`,
    emitNestedAppendStatements(part.parts, sinkName),
    `  }, {`,
    `  placeholder: (${sinkName}) => {`,
    emitNestedAppendStatements(part.placeholderParts, sinkName),
    `  }${catchOption}`,
    `  });`,
  ].join("\n");
}

function emitNestedAppendStatements(
  parts: HtmlSyncPart[],
  sinkName: string,
): string {
  return parts
    .map((part) => {
      if (part.kind === "component") {
        return `    ${part.name}(${sinkName}, ${emitPropsObject(part.props, part.children, part.escapeHelperName)});`;
      }

      const expression =
        part.kind === "static"
          ? stringLiteral(part.value)
          : part.kind === "dynamic"
            ? `${part.escapeHelperName}(${part.code})`
            : part.code;

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
      kind: "raw-dynamic";
      code: string;
    }
  | {
      kind: "async-boundary";
      valueCode: string;
      valueName: string;
      parts: HtmlSyncPart[];
      catchName?: string;
      catchParts?: HtmlSyncPart[];
    }
  | {
      kind: "out-of-order-boundary";
      id: string;
      valueCode: string;
      valueName: string;
      parts: HtmlSyncPart[];
      placeholderParts: HtmlSyncPart[];
      catchName?: string;
      catchParts?: HtmlSyncPart[];
    }
    | {
      kind: "component";
      name: string;
      props: ComponentPropIr[];
      children: JsxNodeIr[];
      escapeHelperName: string;
    };

type HtmlSyncPart = Exclude<
  HtmlPart,
  { kind: "async-boundary" | "out-of-order-boundary" }
>;

interface CollectHtmlState {
  nextFragmentId: number;
}

function collectHtmlParts(
  node: JsxNodeIr,
  escapeHelperName: string,
  asyncBoundaryHelperName: string,
  outOfOrderBoundaryHelperName: string,
  state: CollectHtmlState,
): HtmlPart[] {
  void asyncBoundaryHelperName;
  void outOfOrderBoundaryHelperName;

  if (node.kind === "text") {
    return [{ kind: "static", value: escapeHtml(node.value) }];
  }

  if (node.kind === "expr") {
    return [{ kind: "dynamic", code: node.code, escapeHelperName }];
  }

  if (node.kind === "conditional") {
    return [
      {
        kind: "raw-dynamic",
        code: `((${node.conditionCode}) ? ${emitHtmlExpressionFromChildren(node.whenTrue, escapeHelperName)} : ${emitHtmlExpressionFromChildren(node.whenFalse, escapeHelperName)})`,
      },
    ];
  }

  if (node.kind === "list") {
    const parameters =
      node.indexName === undefined
        ? node.itemName
        : `${node.itemName}, ${node.indexName}`;
    return [
      {
        kind: "raw-dynamic",
        code: `(${node.itemsCode}).map((${parameters}) => ${emitHtmlExpressionFromChildren(node.children, escapeHelperName)}).join("")`,
      },
    ];
  }

  if (node.kind === "async-boundary") {
    if (node.placeholderChildren !== undefined) {
      const id = `mreact-${state.nextFragmentId}`;
      state.nextFragmentId += 1;

      return [
        {
          kind: "out-of-order-boundary",
          id,
          valueCode: node.valueCode,
          valueName: node.valueName,
          parts: node.children.flatMap((child) =>
            collectHtmlParts(
              child,
              escapeHelperName,
              asyncBoundaryHelperName,
              outOfOrderBoundaryHelperName,
              state,
            ),
          ) as Exclude<
            HtmlPart,
            { kind: "async-boundary" | "out-of-order-boundary" }
          >[],
          placeholderParts: node.placeholderChildren.flatMap((child) =>
            collectHtmlParts(
              child,
              escapeHelperName,
              asyncBoundaryHelperName,
              outOfOrderBoundaryHelperName,
              state,
            ),
          ) as Exclude<
            HtmlPart,
            { kind: "async-boundary" | "out-of-order-boundary" }
          >[],
          ...(node.catchName === undefined || node.catchChildren === undefined
            ? {}
            : {
                catchName: node.catchName,
                catchParts: node.catchChildren.flatMap((child) =>
                  collectHtmlParts(
                    child,
                    escapeHelperName,
                    asyncBoundaryHelperName,
                    outOfOrderBoundaryHelperName,
                    state,
                  ),
                ) as Exclude<
                  HtmlPart,
                  { kind: "async-boundary" | "out-of-order-boundary" }
                >[],
              }),
        },
      ];
    }

    return [
      {
        kind: "async-boundary",
        valueCode: node.valueCode,
        valueName: node.valueName,
        parts: node.children.flatMap((child) =>
          collectHtmlParts(
            child,
            escapeHelperName,
            asyncBoundaryHelperName,
            outOfOrderBoundaryHelperName,
            state,
          ),
        ) as HtmlSyncPart[],
        ...(node.catchName === undefined || node.catchChildren === undefined
          ? {}
          : {
              catchName: node.catchName,
              catchParts: node.catchChildren.flatMap((child) =>
                collectHtmlParts(
                  child,
                  escapeHelperName,
                  asyncBoundaryHelperName,
                  outOfOrderBoundaryHelperName,
                  state,
                ),
              ) as HtmlSyncPart[],
            }),
      },
    ];
  }

  if (node.kind === "fragment") {
    return node.children.flatMap((child) =>
      collectHtmlParts(
        child,
        escapeHelperName,
        asyncBoundaryHelperName,
        outOfOrderBoundaryHelperName,
        state,
      ),
    );
  }

  if (node.kind === "component") {
    return [
      {
        kind: "component",
        name: node.name,
        props: node.props,
        children: node.children,
        escapeHelperName,
      },
    ];
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
      collectHtmlParts(
        child,
        escapeHelperName,
        asyncBoundaryHelperName,
        outOfOrderBoundaryHelperName,
        state,
      ),
    ),
    { kind: "static", value: closeTag },
  ];
}

function emitHtmlExpressionFromChildren(
  children: JsxNodeIr[],
  escapeHelperName: string,
): string {
  if (children.length === 0) {
    return "\"\"";
  }

  const parts = children.flatMap((child) =>
    collectHtmlParts(
      child,
      escapeHelperName,
      "_renderAsyncBoundary",
      "_renderOutOfOrderBoundary",
      { nextFragmentId: 0 },
    ),
  );
  const expressions = parts.map((part) => {
    if (part.kind === "static") {
      return stringLiteral(part.value);
    }

    if (part.kind === "dynamic") {
      return `${part.escapeHelperName}(${part.code})`;
    }

    if (part.kind === "raw-dynamic") {
      return part.code;
    }

    if (part.kind === "component") {
      return "\"\"";
    }

    return "\"\"";
  });

  return expressions.length === 0 ? "\"\"" : expressions.join(" + ");
}

function containsAsyncBoundary(
  node: JsxNodeIr,
  outOfOrder: boolean,
): boolean {
  if (node.kind === "async-boundary") {
    return outOfOrder
      ? node.placeholderChildren !== undefined
      : node.placeholderChildren === undefined;
  }

  if (node.kind === "conditional") {
    return [...node.whenTrue, ...node.whenFalse].some((child) =>
      containsAsyncBoundary(child, outOfOrder),
    );
  }

  if (node.kind === "list") {
    return node.children.some((child) =>
      containsAsyncBoundary(child, outOfOrder),
    );
  }

  if (node.kind === "element" || node.kind === "fragment") {
    return node.children.some((child) => containsAsyncBoundary(child, outOfOrder));
  }

  if (node.kind === "component") {
    return true;
  }

  return false;
}

function containsAnyAsyncBoundary(node: JsxNodeIr): boolean {
  if (node.kind === "async-boundary") {
    return true;
  }

  if (node.kind === "conditional") {
    return [...node.whenTrue, ...node.whenFalse].some(containsAnyAsyncBoundary);
  }

  if (node.kind === "list") {
    return node.children.some(containsAnyAsyncBoundary);
  }

  if (node.kind === "element" || node.kind === "fragment") {
    return node.children.some(containsAnyAsyncBoundary);
  }

  if (node.kind === "component") {
    return true;
  }

  return false;
}

function emitPropsObject(
  props: ComponentPropIr[],
  children: JsxNodeIr[] = [],
  escapeHelperName = "_escapeHtml",
): string {
  const entries = props.map((prop) =>
    prop.kind === "spread-prop"
      ? `...(${prop.code})`
      : `${emitPropName(prop.name)}: (${prop.code})`,
  );

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
  const reservedNames = new Set<string>(ir.moduleBindingNames);

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
