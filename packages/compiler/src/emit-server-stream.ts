import type { AsyncBoundaryIr, ComponentPropIr, ComponentIr, JsxNodeIr, ModuleIr } from "./ir.js";
import type { RuntimeImport, ServerBootstrapMode } from "./types.js";

export interface EmitServerStreamResult {
  code: string;
  imports: RuntimeImport[];
}

export interface EmitServerStreamOptions {
  serverBootstrap?: ServerBootstrapMode;
  serverBootstrapNonce?: string;
  serverBootstrapSrc?: string;
  serverHydration?: boolean;
  reactSuspenseRevealScriptSrc?: string;
}

export function emitServerStream(
  ir: ModuleIr,
  options: EmitServerStreamOptions = {},
): EmitServerStreamResult {
  const serverBootstrap = options.serverBootstrap ?? "none";
  const escapeHelperName = allocateHelperName(ir, "_escapeHtml");
  const asyncBoundaryHelperName = allocateHelperName(ir, "_renderAsyncBoundary");
  const outOfOrderBoundaryHelperName = allocateHelperName(ir, "_renderOutOfOrderBoundary");
  const reorderScriptHelperName = allocateHelperName(ir, "_renderOutOfOrderReorderScript");
  const reactSuspenseBoundaryHelperName = allocateHelperName(ir, "_renderReactSuspenseBoundary");
  const reactSuspenseOutOfOrderBoundaryHelperName = allocateHelperName(
    ir,
    "_renderReactSuspenseOutOfOrderBoundary",
  );
  const compatRenderToStringHelperName = allocateHelperName(ir, "_renderCompatToString");
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
          ...(options.reactSuspenseRevealScriptSrc === undefined
            ? {}
            : { reactSuspenseRevealScriptSrc: options.reactSuspenseRevealScriptSrc }),
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
  const importsBlock = [importLine, userImports, moduleStatements].filter(Boolean).join("\n");

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

  if (hasCompatComponentReference(ir)) {
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
    Omit<EmitServerStreamOptions, "serverBootstrap">,
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
  const functionKeyword = `${component.exported === false ? "" : "export "}${
    component.async === true || containsAnyAsyncBoundary(component.root) ? "async " : ""
  }function`;

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
): string[] {
  return collectHtmlParts(
    node,
    escapeHelperName,
    asyncBoundaryHelperName,
    outOfOrderBoundaryHelperName,
    reactSuspenseBoundaryHelperName,
    reactSuspenseOutOfOrderBoundaryHelperName,
    {
      hydration,
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
  const catchOption =
    part.catchName === undefined || part.catchParts === undefined
      ? ""
      : `, { catch: (${sinkName}, ${part.catchName}) => {\n${emitNestedAppendStatements(part.catchParts, sinkName, compatRenderToStringHelperName)}\n  } }`;

  return [
    `  await ${asyncBoundaryHelperName}(${sinkName}, (${part.valueCode}), async (${sinkName}, ${part.valueName}) => {`,
    emitNestedAppendStatements(part.parts, sinkName, compatRenderToStringHelperName),
    `  }${catchOption});`,
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

  return [
    `  ${outOfOrderBoundaryHelperName}(${sinkName}, ${JSON.stringify(part.id)}, (${part.valueCode}), async (${sinkName}, ${part.valueName}) => {`,
    emitNestedAppendStatements(part.parts, sinkName, compatRenderToStringHelperName),
    `  }, {`,
    ...(part.hydration ? [`  hydration: true,`] : []),
    `  placeholder: (${sinkName}) => {`,
    emitNestedAppendStatements(part.placeholderParts, sinkName, compatRenderToStringHelperName),
    `  }${catchOption}`,
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
      hydration: boolean;
      valueCode: string;
      valueName: string;
      parts: HtmlSyncPart[];
      placeholderParts: HtmlSyncPart[];
      catchName?: string;
      catchParts?: HtmlSyncPart[];
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
  hydration: boolean;
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
        reactSuspenseBoundaryHelperName,
        reactSuspenseOutOfOrderBoundaryHelperName,
        state,
      ),
    ),
    { kind: "static", value: closeTag },
  ];
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
      { hydration: false, nextFragmentId: 0 },
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
