import type {
  AsyncBoundaryIr,
  AttributeIr,
  ComponentPropIr,
  ComponentIr,
  JsxNodeIr,
  ModuleIr,
} from "./ir.js";
import type { RuntimeImport, ServerBootstrapMode, ServerEscapeOptions } from "./types.js";

export interface EmitServerStreamResult {
  code: string;
  imports: RuntimeImport[];
}

export interface EmitServerStreamOptions {
  dynamicAttributes?: "drop" | "emit";
  serverBootstrap?: ServerBootstrapMode;
  serverBootstrapNonce?: string;
  serverBootstrapSrc?: string;
  serverHydration?: boolean;
  serverAwaitHydration?: boolean;
  escape?: ServerEscapeOptions | undefined;
  reactSuspenseRevealScriptSrc?: string;
}

export function emitServerStream(
  ir: ModuleIr,
  options: EmitServerStreamOptions = {},
): EmitServerStreamResult {
  const serverBootstrap = options.serverBootstrap ?? "none";
  const escapeHelperName = allocateHelperName(ir, "_escapeHtml");
  const escapeBatchHelperName = options.escape === undefined
    ? undefined
    : allocateHelperName(ir, "_escapeHtmlBatch");
  const asyncBoundaryHelperName = allocateHelperName(ir, "_renderAsyncBoundary");
  const outOfOrderBoundaryHelperName = allocateHelperName(ir, "_renderOutOfOrderBoundary");
  const reorderScriptHelperName = allocateHelperName(ir, "_renderOutOfOrderReorderScript");
  const reactSuspenseBoundaryHelperName = allocateHelperName(ir, "_renderReactSuspenseBoundary");
  const reactSuspenseOutOfOrderBoundaryHelperName = allocateHelperName(
    ir,
    "_renderReactSuspenseOutOfOrderBoundary",
  );
  const compatRenderToStringHelperName = allocateHelperName(ir, "_renderCompatToString");
  const escapeImport = options.escape === undefined || escapeBatchHelperName === undefined
    ? ""
    : `import { ${options.escape.batchImportName} as ${escapeBatchHelperName} } from ${stringLiteral(options.escape.batchImportSource)};`;
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
        reactSuspenseBoundaryHelperName,
        reactSuspenseOutOfOrderBoundaryHelperName,
        compatRenderToStringHelperName,
        {
          serverBootstrap,
          ...(options.serverBootstrapNonce === undefined
            ? {}
            : { serverBootstrapNonce: options.serverBootstrapNonce }),
          ...(options.serverBootstrapSrc === undefined
            ? {}
            : { serverBootstrapSrc: options.serverBootstrapSrc }),
          ...(options.serverHydration === undefined
            ? {}
            : { serverHydration: options.serverHydration }),
          ...(options.serverAwaitHydration === undefined
            ? {}
            : { serverAwaitHydration: options.serverAwaitHydration }),
          ...(options.reactSuspenseRevealScriptSrc === undefined
            ? {}
            : { reactSuspenseRevealScriptSrc: options.reactSuspenseRevealScriptSrc }),
          dynamicAttributes: options.dynamicAttributes ?? "emit",
          ...(escapeBatchHelperName === undefined ? {} : { escapeBatchHelperName }),
        },
      ),
    )
    .join("\n\n");
  const imports = collectImports(ir, serverBootstrap);
  const importAliases: Record<string, string> = {
    renderAsyncBoundary: asyncBoundaryHelperName,
    renderOutOfOrderBoundary: outOfOrderBoundaryHelperName,
    renderOutOfOrderReorderScript: reorderScriptHelperName,
    renderReactSuspenseBoundary: reactSuspenseBoundaryHelperName,
    renderReactSuspenseOutOfOrderBoundary: reactSuspenseOutOfOrderBoundaryHelperName,
    renderToString: compatRenderToStringHelperName,
  };
  const importLine = imports
    .map(
      (runtimeImport) =>
        `import { ${runtimeImport.specifiers
          .map((specifier) => `${specifier} as ${importAliases[specifier]}`)
          .join(", ")} } from "${runtimeImport.source}";`,
    )
    .join("\n");
  const userImports = emitUserImports(ir);
  const moduleStatements = emitModuleStatements(ir);
  const importsBlock = [importLine, escapeImport, userImports, moduleStatements].filter(Boolean).join("\n");

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

function collectImports(ir: ModuleIr, serverBootstrap: ServerBootstrapMode): RuntimeImport[] {
  const serverSpecifiers = [
    ...(hasInOrderAsyncBoundary(ir) ? ["renderAsyncBoundary"] : []),
    ...(hasOutOfOrderAsyncBoundary(ir) ? ["renderOutOfOrderBoundary"] : []),
    ...(serverBootstrap === "out-of-order-reorder" && hasOutOfOrderAsyncBoundary(ir)
      ? ["renderOutOfOrderReorderScript"]
      : []),
    ...(hasReactSuspenseBoundary(ir) ? ["renderReactSuspenseBoundary"] : []),
    ...(hasReactSuspenseOutOfOrderBoundary(ir) ? ["renderReactSuspenseOutOfOrderBoundary"] : []),
  ];
  const imports: RuntimeImport[] = [];

  if (serverSpecifiers.length > 0) {
    imports.push({
      source: "@modular-react/server",
      specifiers: serverSpecifiers,
    });
  }

  if (hasCompatComponentReference(ir) || hasReactNodeRender(ir)) {
    imports.push({
      source: "@modular-react/react-compat",
      specifiers: ["renderToString"],
    });
  }

  return imports;
}

function hasInOrderAsyncBoundary(ir: ModuleIr): boolean {
  return ir.components.some((component) => containsAsyncBoundary(component.root, false));
}

function hasOutOfOrderAsyncBoundary(ir: ModuleIr): boolean {
  return ir.components.some((component) => containsAsyncBoundary(component.root, true));
}

function hasReactSuspenseBoundary(ir: ModuleIr): boolean {
  return ir.components.some((component) => containsReactSuspense(component.root, false));
}

function hasReactSuspenseOutOfOrderBoundary(ir: ModuleIr): boolean {
  return ir.components.some((component) => containsReactSuspense(component.root, true));
}

function hasCompatComponentReference(ir: ModuleIr): boolean {
  return ir.components.some((component) => containsCompatComponent(component.root));
}

function hasReactNodeRender(ir: ModuleIr): boolean {
  return ir.components.some((component) => containsReactNodeRender(component.root));
}

function emitComponent(
  component: ComponentIr,
  escapeHelperName: string,
  asyncBoundaryHelperName: string,
  outOfOrderBoundaryHelperName: string,
  reorderScriptHelperName: string,
  reactSuspenseBoundaryHelperName: string,
  reactSuspenseOutOfOrderBoundaryHelperName: string,
  compatRenderToStringHelperName: string,
  options: Required<Pick<EmitServerStreamOptions, "serverBootstrap">> &
    Omit<EmitServerStreamOptions, "serverBootstrap"> & {
      dynamicAttributes: "drop" | "emit";
      escapeBatchHelperName?: string;
    },
): string {
  const { serverBootstrap, serverBootstrapNonce, serverBootstrapSrc } = options;
  const sinkName = allocateComponentSinkName(component);
  const parameters = [sinkName, ...component.parameters].join(", ");
  const body = component.bodyStatements.map((statement) => `  ${statement}`);
  const markerId = encodeURIComponent(component.name);
  const hydrationStartStatements =
    options.serverHydration === true
      ? [`  ${sinkName}.append(${stringLiteral(`<!--mreact-h:start:${markerId}-->`)});`]
      : [];
  const appendStatements = emitAppendStatements(
    component.root,
    sinkName,
    escapeHelperName,
    asyncBoundaryHelperName,
    outOfOrderBoundaryHelperName,
    reactSuspenseBoundaryHelperName,
    reactSuspenseOutOfOrderBoundaryHelperName,
    compatRenderToStringHelperName,
    options.serverBootstrapNonce,
    options.reactSuspenseRevealScriptSrc,
    options.serverHydration === true,
    options.serverAwaitHydration === true,
    options.dynamicAttributes,
    options.escapeBatchHelperName,
  );
  const bootstrapStatements =
    serverBootstrap === "out-of-order-reorder" && containsAsyncBoundary(component.root, true)
      ? [
          `  ${reorderScriptHelperName}(${sinkName}${emitBootstrapOptions(serverBootstrapNonce, serverBootstrapSrc)});`,
        ]
      : [];
  const hydrationEndStatements =
    options.serverHydration === true
      ? [`  ${sinkName}.append(${stringLiteral(`<!--mreact-h:end:${markerId}-->`)});`]
      : [];
  const exportPrefix =
    component.exportDefault === true ? "export default " : component.exported === false ? "" : "export ";
  const asyncPrefix = component.async === true || containsAnyAsyncBoundary(component.root) ? "async " : "";
  const functionKeyword = `${exportPrefix}${asyncPrefix}function`;

  return [
    `${functionKeyword} ${component.name}(${parameters}) {`,
    ...body,
    ...hydrationStartStatements,
    ...appendStatements,
    ...hydrationEndStatements,
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
  reactSuspenseBoundaryHelperName: string,
  reactSuspenseOutOfOrderBoundaryHelperName: string,
  compatRenderToStringHelperName: string,
  reactSuspenseRevealScriptNonce: string | undefined,
  reactSuspenseRevealScriptSrc: string | undefined,
  hydration: boolean,
  awaitHydration: boolean,
  dynamicAttributes: "drop" | "emit",
  escapeBatchHelperName: string | undefined,
): string[] {
  return collectHtmlParts(
    node,
    escapeHelperName,
    asyncBoundaryHelperName,
    outOfOrderBoundaryHelperName,
    reactSuspenseBoundaryHelperName,
    reactSuspenseOutOfOrderBoundaryHelperName,
    {
      dynamicAttributes,
      ...(escapeBatchHelperName === undefined ? {} : { escapeBatchHelperName }),
      hydration,
      awaitHydration,
      nextFragmentId: 0,
      ...(reactSuspenseRevealScriptNonce === undefined ? {} : { reactSuspenseRevealScriptNonce }),
      ...(reactSuspenseRevealScriptSrc === undefined ? {} : { reactSuspenseRevealScriptSrc }),
    },
  ).map((part) => {
    if (part.kind === "async-boundary") {
      return emitAsyncBoundary(
        part,
        sinkName,
        asyncBoundaryHelperName,
        compatRenderToStringHelperName,
      );
    }

    if (part.kind === "out-of-order-boundary") {
      return emitOutOfOrderBoundary(
        part,
        sinkName,
        outOfOrderBoundaryHelperName,
        compatRenderToStringHelperName,
      );
    }

    if (part.kind === "react-suspense-boundary") {
      return emitReactSuspenseBoundary(
        part,
        sinkName,
        reactSuspenseBoundaryHelperName,
        compatRenderToStringHelperName,
      );
    }

    if (part.kind === "react-suspense-out-of-order-boundary") {
      return emitReactSuspenseOutOfOrderBoundary(
        part,
        sinkName,
        reactSuspenseOutOfOrderBoundaryHelperName,
        compatRenderToStringHelperName,
      );
    }

    if (part.kind === "component") {
      if (part.runtime === "compat") {
        return emitCompatComponentAppendStatements(
          part,
          sinkName,
          compatRenderToStringHelperName,
          "  ",
        );
      }

      return `  await ${part.name}(${sinkName}, ${emitPropsObject(part.props, part.children, part.escapeHelperName)});`;
    }

    if (part.kind === "react-node") {
      return `  ${sinkName}.append(${compatRenderToStringHelperName}(() => (${part.code})));`;
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
  compatRenderToStringHelperName: string,
): string {
  const optionFields: string[] = [];

  if (part.catchName !== undefined && part.catchParts !== undefined) {
    optionFields.push(
      `catch: (${sinkName}, ${part.catchName}) => {\n${emitNestedAppendStatements(part.catchParts, sinkName, compatRenderToStringHelperName)}\n  }`,
    );
  }

  if (part.awaitId !== undefined) {
    optionFields.push(`hydrationAwaitId: ${JSON.stringify(part.awaitId)}`);
  }

  const optionsExpression = optionFields.length === 0
    ? ""
    : `, { ${optionFields.join(", ")} }`;

  return [
    `  await ${asyncBoundaryHelperName}(${sinkName}, (${part.valueCode}), async (${sinkName}, ${part.valueName}) => {`,
    emitNestedAppendStatements(part.parts, sinkName, compatRenderToStringHelperName),
    `  }${optionsExpression});`,
  ].join("\n");
}

function emitOutOfOrderBoundary(
  part: Extract<HtmlPart, { kind: "out-of-order-boundary" }>,
  sinkName: string,
  outOfOrderBoundaryHelperName: string,
  compatRenderToStringHelperName: string,
): string {
  const catchOption =
    part.catchName === undefined || part.catchParts === undefined
      ? ""
      : `,\n  catch: (${sinkName}, ${part.catchName}) => {\n${emitNestedAppendStatements(part.catchParts, sinkName, compatRenderToStringHelperName)}\n  }`;

  const hydrationAwaitIdOption =
    part.awaitId === undefined
      ? ""
      : `,\n  hydrationAwaitId: ${JSON.stringify(part.awaitId)}`;

  return [
    `  ${outOfOrderBoundaryHelperName}(${sinkName}, ${JSON.stringify(part.id)}, (${part.valueCode}), async (${sinkName}, ${part.valueName}) => {`,
    emitNestedAppendStatements(part.parts, sinkName, compatRenderToStringHelperName),
    `  }, {`,
    ...(part.hydration ? [`  hydration: true,`] : []),
    `  placeholder: (${sinkName}) => {`,
    emitNestedAppendStatements(part.placeholderParts, sinkName, compatRenderToStringHelperName),
    `  }${catchOption}${hydrationAwaitIdOption}`,
    `  });`,
  ].join("\n");
}

function emitReactSuspenseBoundary(
  part: Extract<HtmlPart, { kind: "react-suspense-boundary" }>,
  sinkName: string,
  reactSuspenseBoundaryHelperName: string,
  compatRenderToStringHelperName: string,
): string {
  return [
    `  await ${reactSuspenseBoundaryHelperName}(${sinkName}, async (${sinkName}) => {`,
    emitNestedAppendStatements(part.parts, sinkName, compatRenderToStringHelperName),
    `  });`,
  ].join("\n");
}

function emitReactSuspenseOutOfOrderBoundary(
  part: Extract<HtmlPart, { kind: "react-suspense-out-of-order-boundary" }>,
  sinkName: string,
  reactSuspenseOutOfOrderBoundaryHelperName: string,
  compatRenderToStringHelperName: string,
): string {
  const options = [
    `  fallback: (${sinkName}) => {`,
    emitNestedAppendStatements(part.fallbackParts, sinkName, compatRenderToStringHelperName),
    `  },`,
    ...(part.catchName === undefined || part.catchParts === undefined
      ? []
      : [
          `  catch: (${sinkName}, ${part.catchName}) => {`,
          emitNestedAppendStatements(part.catchParts, sinkName, compatRenderToStringHelperName),
          `  },`,
        ]),
    ...(part.nonce === undefined ? [] : [`  nonce: ${stringLiteral(part.nonce)},`]),
    ...(part.scriptSrc === undefined ? [] : [`  src: ${stringLiteral(part.scriptSrc)},`]),
  ];

  return [
    `  ${reactSuspenseOutOfOrderBoundaryHelperName}(${sinkName}, ${JSON.stringify(part.boundaryId)}, ${JSON.stringify(part.segmentId)}, (${part.valueCode}), async (${sinkName}, ${part.valueName}) => {`,
    emitNestedAppendStatements(part.parts, sinkName, compatRenderToStringHelperName),
    `  }, {`,
    ...options,
    `  });`,
  ].join("\n");
}

function emitNestedAppendStatements(
  parts: HtmlSyncPart[],
  sinkName: string,
  compatRenderToStringHelperName: string,
): string {
  return parts
    .map((part) => {
      if (part.kind === "component") {
        if (part.runtime === "compat") {
          return emitCompatComponentAppendStatements(
            part,
            sinkName,
            compatRenderToStringHelperName,
            "    ",
          );
        }

        return `    await ${part.name}(${sinkName}, ${emitPropsObject(part.props, part.children, part.escapeHelperName)});`;
      }

      if (part.kind === "react-node") {
        return `    ${sinkName}.append(${compatRenderToStringHelperName}(() => (${part.code})));`;
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

function emitCompatComponentAppendStatements(
  part: Extract<HtmlPart, { kind: "component" }>,
  sinkName: string,
  compatRenderToStringHelperName: string,
  indent: string,
): string {
  const rendered = `${compatRenderToStringHelperName}(${part.name}, ${emitPropsObject(part.props, part.children, part.escapeHelperName)})`;
  const statements =
    part.hydrationId === undefined
      ? [`${sinkName}.append(${rendered});`]
      : [
          `${sinkName}.append(${stringLiteral(`<!--mreact-h:start:${encodeURIComponent(part.hydrationId)}-->`)});`,
          `${sinkName}.append(${rendered});`,
          `${sinkName}.append(${stringLiteral(`<!--mreact-h:end:${encodeURIComponent(part.hydrationId)}-->`)});`,
        ];

  return statements.map((statement) => `${indent}${statement}`).join("\n");
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
      kind: "react-node";
      code: string;
    }
  | {
      kind: "async-boundary";
      valueCode: string;
      valueName: string;
      parts: HtmlSyncPart[];
      catchName?: string;
      catchParts?: HtmlSyncPart[];
      awaitId?: string;
    }
  | {
      kind: "out-of-order-boundary";
      id: string;
      hydration: boolean;
      valueCode: string;
      valueName: string;
      parts: HtmlSyncPart[];
      placeholderParts: HtmlSyncPart[];
      catchName?: string;
      catchParts?: HtmlSyncPart[];
      awaitId?: string;
    }
  | {
      kind: "react-suspense-boundary";
      parts: HtmlSyncPart[];
    }
  | {
      kind: "react-suspense-out-of-order-boundary";
      boundaryId: string;
      segmentId: string;
      valueCode: string;
      valueName: string;
      parts: HtmlSyncPart[];
      fallbackParts: HtmlSyncPart[];
      catchName?: string;
      catchParts?: HtmlSyncPart[];
      nonce?: string;
      scriptSrc?: string;
    }
  | {
      kind: "component";
      name: string;
      runtime?: "compat";
      async?: boolean;
      hydrationId?: string;
      props: ComponentPropIr[];
      children: JsxNodeIr[];
      escapeHelperName: string;
    };

type HtmlSyncPart = Exclude<
  HtmlPart,
  {
    kind:
      | "async-boundary"
      | "out-of-order-boundary"
      | "react-suspense-boundary"
      | "react-suspense-out-of-order-boundary";
  }
>;

interface CollectHtmlState {
  dynamicAttributes: "drop" | "emit";
  escapeBatchHelperName?: string;
  hydration: boolean;
  awaitHydration: boolean;
  nextFragmentId: number;
  reactSuspenseRevealScriptNonce?: string;
  reactSuspenseRevealScriptSrc?: string;
}

function collectHtmlParts(
  node: JsxNodeIr,
  escapeHelperName: string,
  asyncBoundaryHelperName: string,
  outOfOrderBoundaryHelperName: string,
  reactSuspenseBoundaryHelperName: string,
  reactSuspenseOutOfOrderBoundaryHelperName: string,
  state: CollectHtmlState,
): HtmlPart[] {
  void asyncBoundaryHelperName;
  void outOfOrderBoundaryHelperName;
  void reactSuspenseBoundaryHelperName;
  void reactSuspenseOutOfOrderBoundaryHelperName;

  if (node.kind === "text") {
    return [{ kind: "static", value: escapeHtml(node.value) }];
  }

  if (node.kind === "expr") {
    if (node.renderMode === "html") {
      return [{ kind: "raw-dynamic", code: rawHtmlExpression(node.code) }];
    }

    if (node.renderMode === "react-node") {
      return [{ kind: "react-node", code: node.code }];
    }

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
      node.indexName === undefined ? node.itemName : `${node.itemName}, ${node.indexName}`;
    return [
      {
        kind: "raw-dynamic",
        code: `(${node.itemsCode}).map(${emitListRenderer(node, parameters, escapeHelperName)}).join("")`,
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
          hydration: state.hydration,
          valueCode: node.valueCode,
          valueName: node.valueName,
          parts: node.children.flatMap((child) =>
            collectHtmlParts(
              child,
              escapeHelperName,
              asyncBoundaryHelperName,
              outOfOrderBoundaryHelperName,
              reactSuspenseBoundaryHelperName,
              reactSuspenseOutOfOrderBoundaryHelperName,
              state,
            ),
          ) as HtmlSyncPart[],
          placeholderParts: node.placeholderChildren.flatMap((child) =>
            collectHtmlParts(
              child,
              escapeHelperName,
              asyncBoundaryHelperName,
              outOfOrderBoundaryHelperName,
              reactSuspenseBoundaryHelperName,
              reactSuspenseOutOfOrderBoundaryHelperName,
              state,
            ),
          ) as HtmlSyncPart[],
          ...(state.awaitHydration && node.awaitId !== undefined
            ? { awaitId: node.awaitId }
            : {}),
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
                    reactSuspenseBoundaryHelperName,
                    reactSuspenseOutOfOrderBoundaryHelperName,
                    state,
                  ),
                ) as HtmlSyncPart[],
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
            reactSuspenseBoundaryHelperName,
            reactSuspenseOutOfOrderBoundaryHelperName,
            state,
          ),
        ) as HtmlSyncPart[],
        ...(state.awaitHydration && node.awaitId !== undefined
          ? { awaitId: node.awaitId }
          : {}),
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
                  reactSuspenseBoundaryHelperName,
                  reactSuspenseOutOfOrderBoundaryHelperName,
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
        reactSuspenseBoundaryHelperName,
        reactSuspenseOutOfOrderBoundaryHelperName,
        state,
      ),
    );
  }

  if (node.kind === "component") {
    if (node.name === "Suspense") {
      const asyncBoundary = findSuspenseAsyncBoundary(node.children);

      if (asyncBoundary !== undefined) {
        const id = state.nextFragmentId;
        state.nextFragmentId += 1;

        return [
          {
            kind: "react-suspense-out-of-order-boundary",
            boundaryId: `B:${id}`,
            segmentId: `S:${id}`,
            valueCode: asyncBoundary.valueCode,
            valueName: asyncBoundary.valueName,
            parts: replaceSuspenseAsyncBoundary(
              node.children,
              asyncBoundary,
              asyncBoundary.children,
            ).flatMap((child) =>
              collectHtmlParts(
                child,
                escapeHelperName,
                asyncBoundaryHelperName,
                outOfOrderBoundaryHelperName,
                reactSuspenseBoundaryHelperName,
                reactSuspenseOutOfOrderBoundaryHelperName,
                state,
              ),
            ) as HtmlSyncPart[],
            fallbackParts: collectSuspenseFallbackParts(
              node.props,
              escapeHelperName,
              asyncBoundaryHelperName,
              outOfOrderBoundaryHelperName,
              reactSuspenseBoundaryHelperName,
              reactSuspenseOutOfOrderBoundaryHelperName,
              state,
            ),
            ...(state.reactSuspenseRevealScriptNonce === undefined
              ? {}
              : { nonce: state.reactSuspenseRevealScriptNonce }),
            ...(state.reactSuspenseRevealScriptSrc === undefined
              ? {}
              : { scriptSrc: state.reactSuspenseRevealScriptSrc }),
            ...(asyncBoundary.catchName === undefined || asyncBoundary.catchChildren === undefined
              ? {}
              : {
                  catchName: asyncBoundary.catchName,
                  catchParts: replaceSuspenseAsyncBoundary(
                    node.children,
                    asyncBoundary,
                    asyncBoundary.catchChildren,
                  ).flatMap((child) =>
                    collectHtmlParts(
                      child,
                      escapeHelperName,
                      asyncBoundaryHelperName,
                      outOfOrderBoundaryHelperName,
                      reactSuspenseBoundaryHelperName,
                      reactSuspenseOutOfOrderBoundaryHelperName,
                      state,
                    ),
                  ) as HtmlSyncPart[],
                }),
          },
        ];
      }

      if (containsAsyncComponent(node.children)) {
        const id = state.nextFragmentId;
        state.nextFragmentId += 1;

        return [
          {
            kind: "react-suspense-out-of-order-boundary",
            boundaryId: `B:${id}`,
            segmentId: `S:${id}`,
            valueCode: "undefined",
            valueName: "_",
            parts: node.children.flatMap((child) =>
              collectHtmlParts(
                child,
                escapeHelperName,
                asyncBoundaryHelperName,
                outOfOrderBoundaryHelperName,
                reactSuspenseBoundaryHelperName,
                reactSuspenseOutOfOrderBoundaryHelperName,
                state,
              ),
            ) as HtmlSyncPart[],
            fallbackParts: collectSuspenseFallbackParts(
              node.props,
              escapeHelperName,
              asyncBoundaryHelperName,
              outOfOrderBoundaryHelperName,
              reactSuspenseBoundaryHelperName,
              reactSuspenseOutOfOrderBoundaryHelperName,
              state,
            ),
            ...(state.reactSuspenseRevealScriptNonce === undefined
              ? {}
              : { nonce: state.reactSuspenseRevealScriptNonce }),
            ...(state.reactSuspenseRevealScriptSrc === undefined
              ? {}
              : { scriptSrc: state.reactSuspenseRevealScriptSrc }),
          },
        ];
      }

      return [
        {
          kind: "react-suspense-boundary",
          parts: node.children.flatMap((child) =>
            collectHtmlParts(
              child,
              escapeHelperName,
              asyncBoundaryHelperName,
              outOfOrderBoundaryHelperName,
              reactSuspenseBoundaryHelperName,
              reactSuspenseOutOfOrderBoundaryHelperName,
              state,
            ),
          ) as HtmlSyncPart[],
        },
      ];
    }

    return [
      {
        kind: "component",
        name: node.name,
        ...(node.runtime === undefined ? {} : { runtime: node.runtime }),
        ...(node.async === undefined ? {} : { async: node.async }),
        ...(node.runtime === "compat" && state.hydration
          ? { hydrationId: `mreact-${state.nextFragmentId++}` }
          : {}),
        props: node.props,
        children: node.children,
        escapeHelperName,
      },
    ];
  }

  const closeTag = `</${node.tagName}>`;

  return [
    { kind: "static", value: `<${node.tagName}` },
    ...collectElementAttributeParts(node.attributes, escapeHelperName, state),
    { kind: "static", value: ">" },
    ...(collectBatchedSimpleChildrenParts(node.children, state.escapeBatchHelperName) ??
      node.children.flatMap((child) =>
        collectHtmlParts(
          child,
          escapeHelperName,
          asyncBoundaryHelperName,
          outOfOrderBoundaryHelperName,
          reactSuspenseBoundaryHelperName,
          reactSuspenseOutOfOrderBoundaryHelperName,
          state,
        ),
      )),
    { kind: "static", value: closeTag },
  ];
}

function collectHtmlAttributeParts(
  attr: AttributeIr,
  escapeHelperName: string,
  escapeBatchHelperName: string | undefined,
  dynamicAttributes: "drop" | "emit",
): HtmlSyncPart[] {
  if (attr.kind === "event" || attr.kind === "spread-attr" || attr.name === "key") {
    return [];
  }

  if (attr.kind === "static-attr") {
    return [
      {
        kind: "static",
        value: ` ${htmlAttributeName(attr.name)}="${escapeHtml(attr.value)}"`,
      },
    ];
  }

  if (dynamicAttributes === "drop") {
    return [];
  }

  if (attr.name === "style") {
    return [{ kind: "raw-dynamic", code: emitDynamicStyleAttributeExpression(attr.code, escapeHelperName, escapeBatchHelperName) }];
  }

  return [
    {
      kind: "raw-dynamic",
      code: emitDynamicAttributeExpression(htmlAttributeName(attr.name), attr.code, escapeHelperName),
    },
  ];
}

function collectElementAttributeParts(
  attrs: readonly AttributeIr[],
  escapeHelperName: string,
  state: CollectHtmlState,
): HtmlSyncPart[] {
  const escapeBatchHelperName = state.escapeBatchHelperName;

  return attrs.flatMap((attr) =>
    collectHtmlAttributeParts(attr, escapeHelperName, escapeBatchHelperName, state.dynamicAttributes),
  );
}

function emitDynamicAttributeExpression(
  name: string,
  code: string,
  escapeHelperName: string,
): string {
  const inlineExpr = simpleSideEffectFreeExpression(code);

  if (inlineExpr !== undefined) {
    // Inline 3 evaluations to avoid per-attribute IIFE closure allocation.
    return `(${inlineExpr} == null || ${inlineExpr} === false ? "" : ${stringLiteral(` ${name}="`)} + ${escapeHelperName}(${inlineExpr} === true ? "" : ${inlineExpr}) + ${stringLiteral("\"")})`;
  }

  return `(() => { const _value = (${code}); return _value == null || _value === false ? "" : ${stringLiteral(` ${name}="`)} + ${escapeHelperName}(_value === true ? "" : _value) + ${stringLiteral("\"")}; })()`;
}

function emitDynamicStyleAttributeExpression(
  code: string,
  escapeHelperName: string,
  escapeBatchHelperName: string | undefined,
): string {
  const staticStyleExpression = emitStaticStyleObjectAttributeExpression(code, escapeHelperName);

  if (staticStyleExpression !== undefined) {
    return staticStyleExpression;
  }

  const escapedPair = escapeBatchHelperName === undefined
    ? `${escapeHelperName}(_cssName) + ":" + ${escapeHelperName}(_styleValue === true ? "" : _styleValue)`
    : `(() => { const _escaped = ${escapeBatchHelperName}([_cssName, _styleValue === true ? "" : _styleValue]); return _escaped[0] + ":" + _escaped[1]; })()`;

  return `(() => { const _value = (${code}); if (_value == null || _value === false) return ""; if (typeof _value === "string") { const _style = ${escapeHelperName}(_value); return _style === "" ? "" : ${stringLiteral(" style=\"")} + _style + ${stringLiteral("\"")}; } const _style = Object.entries(_value).filter(([, _styleValue]) => _styleValue != null && _styleValue !== false).map(([_styleName, _styleValue]) => { const _cssName = String(_styleName).startsWith("--") ? String(_styleName) : String(_styleName).replace(/[A-Z]/g, (_char) => "-" + _char.toLowerCase()); return ${escapedPair}; }).join(";"); return _style === "" ? "" : ${stringLiteral(" style=\"")} + _style + ${stringLiteral("\"")}; })()`;
}

function emitStaticStyleObjectAttributeExpression(
  code: string,
  escapeHelperName: string,
): string | undefined {
  const entries = parseStaticStyleObjectLiteral(code);

  if (entries === undefined) {
    return undefined;
  }

  const statements = entries.map((entry, index) =>
    `{ const _styleValue${index} = (${entry.valueCode}); if (_styleValue${index} != null && _styleValue${index} !== false) _styleParts.push(${stringLiteral(`${entry.cssName}:`)} + ${escapeHelperName}(_styleValue${index} === true ? "" : _styleValue${index})); }`
  );

  return `(() => { const _styleParts = []; ${statements.join(" ")} const _style = _styleParts.join(";"); return _style === "" ? "" : ${stringLiteral(" style=\"")} + _style + ${stringLiteral("\"")}; })()`;
}

function parseStaticStyleObjectLiteral(
  code: string,
): Array<{ cssName: string; valueCode: string }> | undefined {
  const objectCode = unwrapParenthesized(code.trim());

  if (!objectCode.startsWith("{") || !objectCode.endsWith("}")) {
    return undefined;
  }

  const body = objectCode.slice(1, -1).trim();

  if (body === "") {
    return [];
  }

  const entries: Array<{ cssName: string; valueCode: string }> = [];

  for (const property of splitTopLevel(body, ",")) {
    const trimmed = property.trim();

    if (trimmed === "" || trimmed.startsWith("...") || trimmed.startsWith("[")) {
      return undefined;
    }

    const colonIndex = findTopLevelColon(trimmed);

    if (colonIndex < 0) {
      return undefined;
    }

    const rawKey = trimmed.slice(0, colonIndex).trim();
    const valueCode = trimmed.slice(colonIndex + 1).trim();
    const key = parseStaticObjectKey(rawKey);

    if (key === undefined || valueCode === "") {
      return undefined;
    }

    entries.push({ cssName: cssPropertyName(key), valueCode });
  }

  return entries;
}

// Side-effect-free expression detection — see emit-server.ts for rationale.
const SIMPLE_IDENT_CHAIN_RE = /^(this|[A-Za-z_$][\w$]*)(\.[A-Za-z_$][\w$]*)*$/;
const NUMERIC_LITERAL_RE = /^-?(?:\d+(?:\.\d+)?|\.\d+)$/;
const SIMPLE_STRING_LITERAL_RE = /^"(?:[^"\\]|\\.)*"$/;
const SIMPLE_SINGLE_QUOTE_RE = /^'(?:[^'\\]|\\.)*'$/;

function simpleSideEffectFreeExpression(code: string): string | undefined {
  const trimmed = unwrapParenthesized(code.trim());

  if (trimmed === "") {
    return undefined;
  }

  if (
    trimmed === "true" ||
    trimmed === "false" ||
    trimmed === "null" ||
    trimmed === "undefined"
  ) {
    return trimmed;
  }

  if (
    NUMERIC_LITERAL_RE.test(trimmed) ||
    SIMPLE_STRING_LITERAL_RE.test(trimmed) ||
    SIMPLE_SINGLE_QUOTE_RE.test(trimmed) ||
    SIMPLE_IDENT_CHAIN_RE.test(trimmed)
  ) {
    return trimmed;
  }

  return undefined;
}

function unwrapParenthesized(code: string): string {
  let current = code;

  while (current.startsWith("(") && current.endsWith(")") && findMatchingClose(current, 0) === current.length - 1) {
    current = current.slice(1, -1).trim();
  }

  return current;
}

function splitTopLevel(code: string, separator: string): string[] {
  const parts: string[] = [];
  let start = 0;
  let depth = 0;
  let quote: string | undefined;

  for (let index = 0; index < code.length; index += 1) {
    const char = code[index];

    if (quote !== undefined) {
      if (char === "\\") {
        index += 1;
      } else if (char === quote) {
        quote = undefined;
      }
      continue;
    }

    if (char === "\"" || char === "'" || char === "`") {
      quote = char;
      continue;
    }

    if (char === "{" || char === "[" || char === "(") {
      depth += 1;
      continue;
    }

    if (char === "}" || char === "]" || char === ")") {
      depth -= 1;
      continue;
    }

    if (depth === 0 && char === separator) {
      parts.push(code.slice(start, index));
      start = index + 1;
    }
  }

  parts.push(code.slice(start));
  return parts;
}

function findTopLevelColon(code: string): number {
  return splitTopLevel(code, ":")[0]?.length ?? -1;
}

function findMatchingClose(code: string, openIndex: number): number {
  let depth = 0;
  let quote: string | undefined;

  for (let index = openIndex; index < code.length; index += 1) {
    const char = code[index];

    if (quote !== undefined) {
      if (char === "\\") {
        index += 1;
      } else if (char === quote) {
        quote = undefined;
      }
      continue;
    }

    if (char === "\"" || char === "'" || char === "`") {
      quote = char;
      continue;
    }

    if (char === "(") {
      depth += 1;
    } else if (char === ")") {
      depth -= 1;

      if (depth === 0) {
        return index;
      }
    }
  }

  return -1;
}

function parseStaticObjectKey(rawKey: string): string | undefined {
  if (/^[A-Za-z_$][\w$-]*$/.test(rawKey)) {
    return rawKey;
  }

  if (
    (rawKey.startsWith("\"") && rawKey.endsWith("\"")) ||
    (rawKey.startsWith("'") && rawKey.endsWith("'"))
  ) {
    return rawKey.slice(1, -1);
  }

  return undefined;
}

function cssPropertyName(name: string): string {
  return name.startsWith("--")
    ? name
    : name.replace(/[A-Z]/g, (char) => `-${char.toLowerCase()}`);
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

function findSuspenseAsyncBoundary(children: readonly JsxNodeIr[]): AsyncBoundaryIr | undefined {
  for (const child of children) {
    if (child.kind === "async-boundary" && child.placeholderChildren === undefined) {
      return child;
    }

    const nested =
      child.kind === "element" || child.kind === "fragment" || child.kind === "component"
        ? findSuspenseAsyncBoundary(child.children)
        : child.kind === "conditional"
          ? findSuspenseAsyncBoundary([...child.whenTrue, ...child.whenFalse])
          : child.kind === "list"
            ? findSuspenseAsyncBoundary(child.children)
            : undefined;

    if (nested !== undefined) {
      return nested;
    }
  }

  return undefined;
}

function replaceSuspenseAsyncBoundary(
  children: readonly JsxNodeIr[],
  target: AsyncBoundaryIr,
  replacement: readonly JsxNodeIr[],
): JsxNodeIr[] {
  return children.flatMap((child): JsxNodeIr[] => {
    if (child === target) {
      return [...replacement];
    }

    if (child.kind === "element") {
      return [
        {
          ...child,
          children: replaceSuspenseAsyncBoundary(child.children, target, replacement),
        },
      ];
    }

    if (child.kind === "fragment") {
      return [
        {
          ...child,
          children: replaceSuspenseAsyncBoundary(child.children, target, replacement),
        },
      ];
    }

    if (child.kind === "component") {
      return [
        {
          ...child,
          children: replaceSuspenseAsyncBoundary(child.children, target, replacement),
        },
      ];
    }

    if (child.kind === "conditional") {
      return [
        {
          ...child,
          whenTrue: replaceSuspenseAsyncBoundary(child.whenTrue, target, replacement),
          whenFalse: replaceSuspenseAsyncBoundary(child.whenFalse, target, replacement),
        },
      ];
    }

    if (child.kind === "list") {
      return [
        {
          ...child,
          children: replaceSuspenseAsyncBoundary(child.children, target, replacement),
        },
      ];
    }

    return [child];
  });
}

function collectSuspenseFallbackParts(
  props: readonly ComponentPropIr[],
  escapeHelperName: string,
  asyncBoundaryHelperName: string,
  outOfOrderBoundaryHelperName: string,
  reactSuspenseBoundaryHelperName: string,
  reactSuspenseOutOfOrderBoundaryHelperName: string,
  state: CollectHtmlState,
): HtmlSyncPart[] {
  for (const prop of props) {
    if (prop.kind === "render-prop" && prop.name === "fallback") {
      return prop.children.flatMap((child) =>
        collectHtmlParts(
          child,
          escapeHelperName,
          asyncBoundaryHelperName,
          outOfOrderBoundaryHelperName,
          reactSuspenseBoundaryHelperName,
          reactSuspenseOutOfOrderBoundaryHelperName,
          state,
        ),
      ) as HtmlSyncPart[];
    }

    if (prop.kind === "prop" && prop.name === "fallback") {
      return [
        {
          kind: "dynamic",
          code: prop.code,
          escapeHelperName,
        },
      ];
    }
  }

  return [];
}

function rawHtmlExpression(code: string): string {
  return `(() => { const _value = (${code}); return Array.isArray(_value) ? _value.join("") : String(_value ?? ""); })()`;
}

function collectBatchedSimpleChildrenParts(
  children: readonly JsxNodeIr[],
  escapeBatchHelperName: string | undefined,
): HtmlSyncPart[] | undefined {
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

  return [
    {
      kind: "raw-dynamic",
      code: `(() => { const _escaped = ${escapeBatchHelperName}([${values.join(", ")}]); return ${pieces.join(" + ")}; })()`,
    },
  ];
}

function emitHtmlExpressionFromChildren(children: JsxNodeIr[], escapeHelperName: string): string {
  if (children.length === 0) {
    return '""';
  }

  const parts = children.flatMap((child) =>
    collectHtmlParts(
      child,
      escapeHelperName,
      "_renderAsyncBoundary",
      "_renderOutOfOrderBoundary",
      "_renderReactSuspenseBoundary",
      "_renderReactSuspenseOutOfOrderBoundary",
      {
        dynamicAttributes: "emit",
        hydration: false,
        awaitHydration: false,
        nextFragmentId: 0,
      },
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
      return '""';
    }

    return '""';
  });

  return expressions.length === 0 ? '""' : expressions.join(" + ");
}

function emitListRenderer(
  node: Extract<JsxNodeIr, { kind: "list" }>,
  parameters: string,
  escapeHelperName: string,
): string {
  const valueExpression = emitHtmlExpressionFromChildren(node.children, escapeHelperName);

  if (node.bodyStatements === undefined || node.bodyStatements.length === 0) {
    return `(${parameters}) => ${valueExpression}`;
  }

  return `(${parameters}) => {\n${node.bodyStatements.map((statement) => `    ${statement}`).join("\n")}\n    return ${valueExpression};\n  }`;
}

function containsAsyncBoundary(node: JsxNodeIr, outOfOrder: boolean): boolean {
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
    return node.children.some((child) => containsAsyncBoundary(child, outOfOrder));
  }

  if (node.kind === "element" || node.kind === "fragment") {
    return node.children.some((child) => containsAsyncBoundary(child, outOfOrder));
  }

  if (node.kind === "component") {
    return node.name === "Suspense" ? false : true;
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
    return node.name === "Suspense" ? true : true;
  }

  return false;
}

function containsReactSuspense(node: JsxNodeIr, outOfOrder: boolean): boolean {
  if (node.kind === "component" && node.name === "Suspense") {
    return outOfOrder
      ? findSuspenseAsyncBoundary(node.children) !== undefined ||
          containsAsyncComponent(node.children)
      : findSuspenseAsyncBoundary(node.children) === undefined &&
          !containsAsyncComponent(node.children);
  }

  if (node.kind === "conditional") {
    return [...node.whenTrue, ...node.whenFalse].some((child) =>
      containsReactSuspense(child, outOfOrder),
    );
  }

  if (node.kind === "list") {
    return node.children.some((child) => containsReactSuspense(child, outOfOrder));
  }

  if (node.kind === "element" || node.kind === "fragment") {
    return node.children.some((child) => containsReactSuspense(child, outOfOrder));
  }

  if (node.kind === "async-boundary") {
    return [
      ...node.children,
      ...(node.placeholderChildren ?? []),
      ...(node.catchChildren ?? []),
    ].some((child) => containsReactSuspense(child, outOfOrder));
  }

  return false;
}

function containsAsyncComponent(children: readonly JsxNodeIr[]): boolean {
  return children.some((child) => {
    if (child.kind === "component") {
      return (
        child.async === true ||
        containsAsyncComponent(child.children) ||
        child.props.some(
          (prop) =>
            prop.kind === "render-prop" && containsAsyncComponent(prop.children),
        )
      );
    }

    if (child.kind === "conditional") {
      return containsAsyncComponent([...child.whenTrue, ...child.whenFalse]);
    }

    if (child.kind === "list") {
      return containsAsyncComponent(child.children);
    }

    if (child.kind === "element" || child.kind === "fragment") {
      return containsAsyncComponent(child.children);
    }

    if (child.kind === "async-boundary") {
      return containsAsyncComponent([
        ...child.children,
        ...(child.placeholderChildren ?? []),
        ...(child.catchChildren ?? []),
      ]);
    }

    return false;
  });
}

function containsCompatComponent(node: JsxNodeIr): boolean {
  if (node.kind === "component") {
    return (
      node.runtime === "compat" ||
      node.children.some(containsCompatComponent) ||
      node.props.some(
        (prop) => prop.kind === "render-prop" && prop.children.some(containsCompatComponent),
      )
    );
  }

  if (node.kind === "conditional") {
    return [...node.whenTrue, ...node.whenFalse].some(containsCompatComponent);
  }

  if (node.kind === "list") {
    return node.children.some(containsCompatComponent);
  }

  if (node.kind === "element" || node.kind === "fragment") {
    return node.children.some(containsCompatComponent);
  }

  if (node.kind === "async-boundary") {
    return [
      ...node.children,
      ...(node.placeholderChildren ?? []),
      ...(node.catchChildren ?? []),
    ].some(containsCompatComponent);
  }

  return false;
}

function containsReactNodeRender(node: JsxNodeIr): boolean {
  if (node.kind === "expr") {
    return node.renderMode === "react-node";
  }

  if (node.kind === "component") {
    return (
      node.children.some(containsReactNodeRender) ||
      node.props.some(
        (prop) => prop.kind === "render-prop" && prop.children.some(containsReactNodeRender),
      )
    );
  }

  if (node.kind === "conditional") {
    return [...node.whenTrue, ...node.whenFalse].some(containsReactNodeRender);
  }

  if (node.kind === "list") {
    return node.children.some(containsReactNodeRender);
  }

  if (node.kind === "element" || node.kind === "fragment") {
    return node.children.some(containsReactNodeRender);
  }

  if (node.kind === "async-boundary") {
    return [
      ...node.children,
      ...(node.placeholderChildren ?? []),
      ...(node.catchChildren ?? []),
    ].some(containsReactNodeRender);
  }

  return false;
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
    entries.push(`children: ${emitHtmlExpressionFromChildren(children, escapeHelperName)}`);
  }

  return `{ ${entries.join(", ")} }`;
}

function emitPropName(name: string): string {
  return /^[A-Za-z_$][\w$]*$/.test(name) ? name : JSON.stringify(name);
}

function allocateComponentSinkName(component: ComponentIr): string {
  const reservedNames = new Set([component.name, component.exportName, ...component.bindingNames]);
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
    .replaceAll('"', "&quot;");
}
