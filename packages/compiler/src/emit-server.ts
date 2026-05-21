import type {
  AttributeIr,
  ComponentPropIr,
  ComponentIr,
  JsxNodeIr,
  ModuleIr,
} from "./ir.js";
import type { RuntimeImport, ServerEscapeOptions } from "./types.js";
import { emitEscapeHtmlHelper } from "./emit-escape-helper.js";
import { escapeHtmlAttribute as escapeHtml } from "@reckona/mreact-shared/html-escape";
import {
  htmlAttributeName,
  isDangerousHtmlAttribute,
  isStaticUrlValueUnsafe,
  isUrlAttribute,
  parseStaticStyleObjectLiteral,
  parseStyleLiteralValue,
  simpleSideEffectFreeExpression,
} from "./emit-server-shared.js";

export interface EmitResult {
  code: string;
  imports: RuntimeImport[];
}

export interface EmitServerOptions {
  dynamicAttributes?: "drop" | "emit";
  escape?: ServerEscapeOptions | undefined;
  serverHydration?: boolean;
}

// Module-local handle to the URL-safety helper name for the current emit
// call. Used by deeply-nested attribute emitters to avoid threading the
// name through every signature. Reset at the top of `emitServer`.
let currentUrlSafeHelperName: string = "_urlAttrSafe";
let currentClientBoundaryHelperName: string | undefined;

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
  const clientBoundaryHelperName = usesClientBoundary(ir)
    ? allocateHelperName(ir, "_renderClientBoundary")
    : undefined;
  const outAccumulatorName = allocateHelperName(ir, "_out");
  const urlSafeHelperName = allocateHelperName(ir, "_urlAttrSafe");
  currentUrlSafeHelperName = urlSafeHelperName;
  currentClientBoundaryHelperName = clientBoundaryHelperName;
  const helper = emitEscapeHtmlHelper(escapeHelperName);
  // Inline URL-scheme guard mirroring packages/server/src/url-safety.ts.
  // Returns the original value when safe to emit and undefined when the
  // attribute should be dropped. Inlined so compiler output stays free
  // of cross-package runtime imports.
  // Mirrors packages/server/src/url-safety.ts. Issue 078: in-scheme
  // tab/CR/LF must be stripped anywhere in the value, not just at the
  // start, to match the browser's URL parser.
  const urlSafeHelper = [
    `function ${urlSafeHelperName}(name, value) {`,
    `  if (typeof value !== "string") return value;`,
    `  const _canonical = value`,
    `    .replace(/^[\\x00-\\x20]+/u, "")`,
    `    .replace(/[\\t\\r\\n]/g, "");`,
    `  const _match = /^([a-zA-Z][a-zA-Z0-9+.-]*):/.exec(_canonical);`,
    `  if (_match === null) return value;`,
    `  const _scheme = _match[1].toLowerCase();`,
    `  if (_scheme !== "javascript" && _scheme !== "vbscript" && _scheme !== "livescript" && _scheme !== "mhtml" && _scheme !== "file" && _scheme !== "data") return value;`,
    `  if (_scheme === "data" && (name === "src" || name === "poster") && /^data:image\\/(?!svg\\+xml(?:[;,]|$))/i.test(_canonical)) return value;`,
    `  return undefined;`,
    `}`,
  ].join("\n");
  const asyncComponentNames = collectAsyncServerComponentNames(ir.components);
  const components = ir.components
    .map((component) =>
      emitComponent(
        component,
        escapeHelperName,
        escapeBatchHelperName,
        outAccumulatorName,
        options,
        asyncComponentNames,
        options.dynamicAttributes ?? "emit",
        contextProviderHelperName,
        contextConsumerHelperName,
        reactNodeRenderHelperName,
      ),
    )
    .join("\n\n");
  // Tree-shake the URL-safety helper when it is not referenced by any
  // component output. Same shape as the existing escapeImport check.
  const urlSafeBlock = components.includes(urlSafeHelperName) ? urlSafeHelper : "";
  const clientBoundaryBlock =
    clientBoundaryHelperName === undefined || !components.includes(clientBoundaryHelperName)
      ? ""
      : emitClientBoundaryHelper(clientBoundaryHelperName);
  // Emit batch escape import only when the helper is actually referenced
  // by the generated component code (issue 048: dead-import elimination).
  // Helper names are uniquely allocated, so a literal substring check is
  // both correct and inexpensive.
  const escapeImport =
    options.escape === undefined ||
    escapeBatchHelperName === undefined ||
    !components.includes(escapeBatchHelperName)
      ? ""
      : `import { ${options.escape.batchImportName} as ${escapeBatchHelperName} } from ${stringLiteral(options.escape.batchImportSource)};`;
  const userImports = emitUserImports(ir);
  const contextImport = emitContextImport(
    contextProviderHelperName,
    contextConsumerHelperName,
    reactNodeRenderHelperName,
  );
  const moduleStatements = emitModuleStatements(ir);

  return {
    code: `${[userImports, escapeImport, contextImport, moduleStatements, helper, urlSafeBlock, clientBoundaryBlock].filter(Boolean).join("\n\n")}\n\n${components}\n`,
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
    : `import { ${specifiers.join(", ")} } from "@reckona/mreact-compat";`;
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
    : [{ source: "@reckona/mreact-compat", specifiers }];
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
  outAccumulatorName: string,
  options: EmitServerOptions,
  asyncComponentNames: ReadonlySet<string>,
  dynamicAttributes: "drop" | "emit",
  contextProviderHelperName?: string,
  contextConsumerHelperName?: string,
  reactNodeRenderHelperName?: string,
): string {
  const body = component.bodyStatements.map((statement) => `  ${statement}`);
  const parameters = component.parameters.join(", ");
  const htmlStatements = collectHtmlStatements(
    component.root,
    outAccumulatorName,
    escapeHelperName,
    escapeBatchHelperName,
    asyncComponentNames,
    dynamicAttributes,
    contextProviderHelperName,
    contextConsumerHelperName,
    reactNodeRenderHelperName,
  );

  const markerStart = stringLiteral(`<!--mreact-h:start:${encodeURIComponent(component.name)}-->`);
  const markerEnd = stringLiteral(`<!--mreact-h:end:${encodeURIComponent(component.name)}-->`);

  const hydrationOpenStatements =
    options.serverHydration === true ? [`  ${outAccumulatorName} += ${markerStart};`] : [];
  const hydrationCloseStatements =
    options.serverHydration === true ? [`  ${outAccumulatorName} += ${markerEnd};`] : [];

  const functionKeyword = `${component.exportDefault === true ? "export default " : component.exported === false ? "" : "export "}${
    asyncComponentNames.has(component.name) ? "async " : ""
  }function`;

  return [
    `${functionKeyword} ${component.name}(${parameters}) {`,
    ...body,
    `  let ${outAccumulatorName} = "";`,
    ...hydrationOpenStatements,
    ...htmlStatements.map((statement) => `  ${statement}`),
    ...hydrationCloseStatements,
    `  return ${outAccumulatorName};`,
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

/**
 * Statement-list IR walker (issue 046 followup). Produces a sequence of
 * statements that each append to a shared accumulator variable instead of
 * a single concat expression. Used at the top of component bodies; sub
 * callbacks (`renderContextProviderToString`, async list renderers, etc.)
 * still use the expression form via `emitHtmlExpression`.
 *
 * The benefits over expression mode:
 *   - intermediate string allocations from `+ +` chains disappear
 *   - conditional branches lower to `if/else` (no ternary expression spaghetti)
 *   - sync list rendering inlines the for-loop append without an IIFE wrapper
 *   - debugger / source maps step naturally over the generated statements
 */
function collectHtmlStatements(
  node: JsxNodeIr,
  outVar: string,
  escapeHelperName: string,
  escapeBatchHelperName: string | undefined,
  asyncComponentNames: ReadonlySet<string>,
  dynamicAttributes: "drop" | "emit",
  contextProviderHelperName?: string,
  contextConsumerHelperName?: string,
  reactNodeRenderHelperName?: string,
  selectedValueCode?: string,
): string[] {
  if (node.kind === "text") {
    const literal = escapeHtml(node.value);
    if (literal === "") {
      return [];
    }
    return [`${outVar} += ${stringLiteral(literal)};`];
  }

  if (node.kind === "expr") {
    if (node.renderMode === "html") {
      return [`${outVar} += ${rawHtmlExpression(node.code)};`];
    }

    if (node.renderMode === "react-node" && reactNodeRenderHelperName !== undefined) {
      return [`${outVar} += ${reactNodeRenderHelperName}(() => (${node.code}));`];
    }

    return [`${outVar} += ${escapeHelperName}(${node.code});`];
  }

  if (node.kind === "conditional") {
    const whenTrueStatements = node.whenTrue.flatMap((child) =>
      collectHtmlStatements(
        child,
        outVar,
        escapeHelperName,
        escapeBatchHelperName,
        asyncComponentNames,
        dynamicAttributes,
        contextProviderHelperName,
        contextConsumerHelperName,
        reactNodeRenderHelperName,
      ),
    );
    const whenFalseStatements = node.whenFalse.flatMap((child) =>
      collectHtmlStatements(
        child,
        outVar,
        escapeHelperName,
        escapeBatchHelperName,
        asyncComponentNames,
        dynamicAttributes,
        contextProviderHelperName,
        contextConsumerHelperName,
        reactNodeRenderHelperName,
      ),
    );

    if (whenTrueStatements.length === 0 && whenFalseStatements.length === 0) {
      return [];
    }

    if (whenFalseStatements.length === 0) {
      return [
        `if (${node.conditionCode}) {`,
        ...whenTrueStatements.map((statement) => `  ${statement}`),
        `}`,
      ];
    }

    if (whenTrueStatements.length === 0) {
      return [
        `if (!(${node.conditionCode})) {`,
        ...whenFalseStatements.map((statement) => `  ${statement}`),
        `}`,
      ];
    }

    return [
      `if (${node.conditionCode}) {`,
      ...whenTrueStatements.map((statement) => `  ${statement}`),
      `} else {`,
      ...whenFalseStatements.map((statement) => `  ${statement}`),
      `}`,
    ];
  }

  if (node.kind === "list") {
    const isAsync = containsAsyncServerOperationInChildren(
      node.children,
      asyncComponentNames,
    );

    if (isAsync) {
      // Parallel async path keeps the existing renderer + Promise.all + join
      // form to preserve concurrent resolution semantics.
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
      return [`${outVar} += (await Promise.all(${mapped})).join("");`];
    }

    // Sync list — inline for-loop appending to the caller's accumulator.
    // No inner IIFE wrapper and no intermediate string concat per iteration.
    const itemBinding = `const ${node.itemName} = _arr[_i];`;
    const indexBinding =
      node.indexName === undefined ? undefined : `const ${node.indexName} = _i;`;
    const bodyStatements = node.bodyStatements ?? [];
    const childStatements = node.children.flatMap((child) =>
      collectHtmlStatements(
        child,
        outVar,
        escapeHelperName,
        escapeBatchHelperName,
        asyncComponentNames,
        dynamicAttributes,
        contextProviderHelperName,
        contextConsumerHelperName,
        reactNodeRenderHelperName,
      ),
    );

    return [
      `{`,
      `  const _arr = (${node.itemsCode});`,
      `  for (let _i = 0, _len = _arr.length; _i < _len; _i++) {`,
      `    ${itemBinding}`,
      ...(indexBinding === undefined ? [] : [`    ${indexBinding}`]),
      ...bodyStatements.map((statement) => `    ${statement}`),
      ...childStatements.map((statement) => `    ${statement}`),
      `  }`,
      `}`,
    ];
  }

  if (node.kind === "fragment") {
    return node.children.flatMap((child) =>
      collectHtmlStatements(
        child,
        outVar,
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
        `${outVar} += "<!--$-->";`,
        ...node.children.flatMap((child) =>
          collectHtmlStatements(
            child,
            outVar,
            escapeHelperName,
            escapeBatchHelperName,
            asyncComponentNames,
            dynamicAttributes,
            contextProviderHelperName,
            contextConsumerHelperName,
            reactNodeRenderHelperName,
          ),
        ),
        `${outVar} += "<!--/$-->";`,
      ];
    }

    if (contextProviderHelperName !== undefined && node.name.endsWith(".Provider")) {
      // Provider helper takes a string-returning callback. Use the
      // expression form inside the callback to preserve the existing
      // helper contract.
      const valueCode = findComponentPropCode(node.props, "value") ?? "undefined";
      return [
        `${outVar} += ${contextProviderHelperName}(${node.name}, ${valueCode}, () => ${emitHtmlExpressionFromChildren(node.children, escapeHelperName, escapeBatchHelperName, asyncComponentNames, dynamicAttributes, contextProviderHelperName, contextConsumerHelperName, reactNodeRenderHelperName)});`,
      ];
    }

    if (contextConsumerHelperName !== undefined && node.name.endsWith(".Consumer")) {
      const renderProp = findComponentRenderProp(node.props, "children");

      if (renderProp !== undefined) {
        const valueName = renderProp.valueName ?? "_value";
        return [
          `${outVar} += ${contextConsumerHelperName}(${node.name}, (${valueName}) => ${emitHtmlExpressionFromChildren(renderProp.children, escapeHelperName, escapeBatchHelperName, asyncComponentNames, dynamicAttributes, contextProviderHelperName, contextConsumerHelperName, reactNodeRenderHelperName)});`,
        ];
      }
    }

    if (isClientBoundaryPlaceholder(node)) {
      const helperName = currentClientBoundaryHelperName;
      if (helperName !== undefined) {
        return [
          `${outVar} += ${helperName}(${stringLiteral(node.name)}, ${emitPropsObject(
            node.props,
            node.children,
            escapeHelperName,
            escapeBatchHelperName,
            asyncComponentNames,
            dynamicAttributes,
            contextProviderHelperName,
            contextConsumerHelperName,
            reactNodeRenderHelperName,
          )});`,
        ];
      }

      return [`${outVar} += ${stringLiteral(clientBoundaryPlaceholder(node))};`];
    }

    if (node.runtime === "compat" && reactNodeRenderHelperName !== undefined) {
      return [
        `${outVar} += ${reactNodeRenderHelperName}(${node.name}, ${emitPropsObject(
          node.props,
          node.children,
          escapeHelperName,
          escapeBatchHelperName,
          asyncComponentNames,
          dynamicAttributes,
          contextProviderHelperName,
          contextConsumerHelperName,
          reactNodeRenderHelperName,
        )});`,
      ];
    }

    return [
      `${outVar} += ${emitComponentCallExpression(
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
      )};`,
    ];
  }

  if (node.kind === "async-boundary") {
    return [];
  }

  // element
  const statements: string[] = [];
  if (node.tagName === "textarea") {
    const attributeScan = scanElementAttributes(node.tagName, node.attributes);
    statements.push(`${outVar} += ${stringLiteral("<textarea")};`);
    for (const attributePart of collectElementAttributeParts(
      node.tagName,
      node.attributes,
      escapeHelperName,
      escapeBatchHelperName,
      dynamicAttributes,
      attributeScan,
    )) {
      statements.push(`${outVar} += ${attributePart};`);
    }
    statements.push(`${outVar} += ">";`);
    for (const valuePart of collectTextareaValueParts(
      node,
      escapeHelperName,
      escapeBatchHelperName,
      asyncComponentNames,
      dynamicAttributes,
      contextProviderHelperName,
      contextConsumerHelperName,
      reactNodeRenderHelperName,
      attributeScan,
    )) {
      statements.push(`${outVar} += ${valuePart};`);
    }
    statements.push(`${outVar} += "</textarea>";`);
    return statements;
  }

  statements.push(`${outVar} += ${stringLiteral(`<${node.tagName}`)};`);
  const attributeScan = scanElementAttributes(node.tagName, node.attributes);

  for (const attributePart of collectElementAttributeParts(
    node.tagName,
    node.attributes,
    escapeHelperName,
    escapeBatchHelperName,
    dynamicAttributes,
    attributeScan,
  )) {
    statements.push(`${outVar} += ${attributePart};`);
  }
  const selectedAttributePart = collectOptionSelectedAttributePart(node, selectedValueCode);
  if (selectedAttributePart !== undefined) {
    statements.push(`${outVar} += ${selectedAttributePart};`);
  }

  statements.push(`${outVar} += ">";`);

  const childrenExpression = emitBatchedSimpleChildrenExpression(
    node.children,
    escapeBatchHelperName,
  );
  const childSelectedValueCode = node.tagName === "select"
    ? attributeScan.formValueAttributeCode
    : undefined;

  if (childrenExpression !== undefined && childSelectedValueCode === undefined) {
    statements.push(`${outVar} += ${childrenExpression};`);
  } else {
    for (const child of node.children) {
      statements.push(
        ...collectHtmlStatements(
          child,
          outVar,
          escapeHelperName,
          escapeBatchHelperName,
          asyncComponentNames,
          dynamicAttributes,
          contextProviderHelperName,
          contextConsumerHelperName,
          reactNodeRenderHelperName,
          childSelectedValueCode,
        ),
      );
    }
  }

  statements.push(`${outVar} += ${stringLiteral(`</${node.tagName}>`)};`);

  return statements;
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
  selectedValueCode?: string,
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
    const isAsync = containsAsyncServerOperationInChildren(
      node.children,
      asyncComponentNames,
    );

    if (isAsync) {
      // Async lists rely on Promise.all() for parallel resolution; the
      // callback allocation is amortized across `await` latency, so we keep
      // the `.map().then(...).join("")` form.
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
      return [`(await Promise.all(${mapped})).join("")`];
    }

    // Synchronous list — imperative accumulator avoids the per-render
    // callback allocation, the intermediate `.map()` result array, and the
    // trailing `.join("")` call.
    return [emitSyncListIife(
      node,
      escapeHelperName,
      escapeBatchHelperName,
      asyncComponentNames,
      dynamicAttributes,
      contextProviderHelperName,
      contextConsumerHelperName,
      reactNodeRenderHelperName,
    )];
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

    if (isClientBoundaryPlaceholder(node)) {
      const helperName = currentClientBoundaryHelperName;
      if (helperName !== undefined) {
        return [
          `${helperName}(${stringLiteral(node.name)}, ${emitPropsObject(
            node.props,
            node.children,
            escapeHelperName,
            escapeBatchHelperName,
            asyncComponentNames,
            dynamicAttributes,
            contextProviderHelperName,
            contextConsumerHelperName,
            reactNodeRenderHelperName,
          )})`,
        ];
      }

      return [stringLiteral(clientBoundaryPlaceholder(node))];
    }

    if (node.runtime === "compat" && reactNodeRenderHelperName !== undefined) {
      return [
        `${reactNodeRenderHelperName}(${node.name}, ${emitPropsObject(
          node.props,
          node.children,
          escapeHelperName,
          escapeBatchHelperName,
          asyncComponentNames,
          dynamicAttributes,
          contextProviderHelperName,
          contextConsumerHelperName,
          reactNodeRenderHelperName,
        )})`,
      ];
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

  if (node.tagName === "textarea") {
    const attributeScan = scanElementAttributes(node.tagName, node.attributes);
    return [
      stringLiteral("<textarea"),
      ...collectElementAttributeParts(
        node.tagName,
        node.attributes,
        escapeHelperName,
        escapeBatchHelperName,
        dynamicAttributes,
        attributeScan,
      ),
      stringLiteral(">"),
      ...collectTextareaValueParts(
        node,
        escapeHelperName,
        escapeBatchHelperName,
        asyncComponentNames,
        dynamicAttributes,
        contextProviderHelperName,
        contextConsumerHelperName,
        reactNodeRenderHelperName,
        attributeScan,
      ),
      stringLiteral(closeTag),
    ];
  }

  const childrenExpression = emitBatchedSimpleChildrenExpression(
    node.children,
    escapeBatchHelperName,
  );
  const attributeScan = scanElementAttributes(node.tagName, node.attributes);
  const childSelectedValueCode = node.tagName === "select"
    ? attributeScan.formValueAttributeCode
    : undefined;
  const selectedAttributePart = collectOptionSelectedAttributePart(node, selectedValueCode);

  return [
    stringLiteral(`<${node.tagName}`),
    ...collectElementAttributeParts(
      node.tagName,
      node.attributes,
      escapeHelperName,
      escapeBatchHelperName,
      dynamicAttributes,
      attributeScan,
    ),
    ...(selectedAttributePart === undefined ? [] : [selectedAttributePart]),
    stringLiteral(">"),
    ...(childrenExpression === undefined || childSelectedValueCode !== undefined
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
            childSelectedValueCode,
          ),
        )
      : [childrenExpression]),
    stringLiteral(closeTag),
  ];
}

function collectHtmlAttributeParts(
  tagName: string,
  attr: AttributeIr,
  escapeHelperName: string,
  escapeBatchHelperName: string | undefined,
  dynamicAttributes: "drop" | "emit",
): string[] {
  if (attr.kind === "event" || attr.kind === "spread-attr" || attr.name === "key") {
    return [];
  }

  const htmlName = htmlAttributeNameForElement(tagName, attr.name);

  if (attr.kind === "static-attr") {
    // Reject literal `javascript:` / `data:` / etc. in JSX source. This
    // never produces a runtime branch because the value is known at
    // compile time -- we just drop the attribute (matching the dynamic
    // path) so a developer cannot statically introduce the same XSS.
    if (isUrlAttribute(htmlName) && isStaticUrlValueUnsafe(htmlName, attr.value)) {
      return [];
    }
    // Issue 077: a literal string value for `srcdoc` etc. can never be
    // the `{ __html: ... }` opt-in shape, so it is dropped at compile
    // time.
    if (isDangerousHtmlAttribute(htmlName)) {
      return [];
    }
    return [`${stringLiteral(` ${htmlName}="${escapeHtml(attr.value)}"`)}`];
  }

  if (dynamicAttributes === "drop") {
    return [];
  }

  if (attr.name === "style") {
    return [emitDynamicStyleAttributeExpression(attr.code, escapeHelperName, escapeBatchHelperName)];
  }

  if (isDangerousHtmlAttribute(htmlName)) {
    // Dynamic srcdoc must arrive as `{ __html: "..." }`. Drop anything
    // else at runtime so a value computed from a loader cannot inject
    // executable HTML into the iframe document.
    return [
      `(() => { const _value = (${attr.code}); if (_value == null || _value === false) return ""; if (typeof _value === "object" && _value !== null && typeof _value.__html === "string") return ${stringLiteral(` ${htmlName}="`)} + ${escapeHelperName}(_value.__html) + ${stringLiteral("\"")}; return ""; })()`,
    ];
  }

  return [emitDynamicAttributeExpression(htmlName, attr.code, escapeHelperName)];
}

function collectElementAttributeParts(
  tagName: string,
  attrs: readonly AttributeIr[],
  escapeHelperName: string,
  escapeBatchHelperName: string | undefined,
  dynamicAttributes: "drop" | "emit",
  attributeScan = scanElementAttributes(tagName, attrs),
): string[] {
  return attrs.flatMap((attr) =>
    attr.kind !== "spread-attr" &&
      ((tagName === "input" &&
        ((attr.name === "defaultValue" && attributeScan.hasExplicitInputValue) ||
          (attr.name === "defaultChecked" && attributeScan.hasExplicitInputChecked))) ||
        ((tagName === "textarea" || tagName === "select") &&
          (attr.name === "value" || attr.name === "defaultValue")))
      ? []
      : collectHtmlAttributeParts(
          tagName,
          attr,
          escapeHelperName,
          escapeBatchHelperName,
          dynamicAttributes,
        ),
  );
}

interface ElementAttributeScan {
  hasExplicitInputValue: boolean;
  hasExplicitInputChecked: boolean;
  formValueAttributeCode: string | undefined;
}

function scanElementAttributes(
  tagName: string,
  attrs: readonly AttributeIr[],
): ElementAttributeScan {
  let hasExplicitInputValue = false;
  let hasExplicitInputChecked = false;
  let valueAttributeCode: string | undefined;
  let defaultValueAttributeCode: string | undefined;

  for (const attr of attrs) {
    if (attr.kind === "spread-attr") {
      continue;
    }

    if (tagName === "input") {
      if (attr.name === "value") {
        hasExplicitInputValue = true;
      } else if (attr.name === "checked") {
        hasExplicitInputChecked = true;
      }
    }

    if ((tagName === "textarea" || tagName === "select") && attr.name === "value") {
      valueAttributeCode = readFormValueAttributeCode(attr);
    } else if (
      (tagName === "textarea" || tagName === "select") &&
      attr.name === "defaultValue"
    ) {
      defaultValueAttributeCode = readFormValueAttributeCode(attr);
    }
  }

  return {
    hasExplicitInputValue,
    hasExplicitInputChecked,
    formValueAttributeCode: valueAttributeCode ?? defaultValueAttributeCode,
  };
}

function readFormValueAttributeCode(
  attr: Exclude<AttributeIr, { kind: "spread-attr" }>,
): string | undefined {
  if (attr.kind === "event") {
    return undefined;
  }

  return attr.kind === "static-attr" ? stringLiteral(attr.value) : `(${attr.code})`;
}

function emitDynamicAttributeExpression(
  name: string,
  code: string,
  escapeHelperName: string,
): string {
  if (isUrlAttribute(name)) {
    // Run the value through the inline URL safety helper. The helper
    // returns the value when safe and `undefined` when the attribute
    // should be dropped. Using an IIFE here is necessary because we
    // need to capture the value once and branch on the helper output.
    return `(() => { const _value = (${code}); if (_value == null || _value === false) return ""; const _checked = ${currentUrlSafeHelperName}(${stringLiteral(name)}, _value === true ? "" : _value); return _checked === undefined ? "" : ${stringLiteral(` ${name}="`)} + ${escapeHelperName}(_checked) + ${stringLiteral("\"")}; })()`;
  }

  const inlineExpr = simpleSideEffectFreeExpression(code);

  if (inlineExpr !== undefined) {
    // Inline 3 evaluations to avoid per-attribute IIFE closure allocation.
    // Safe because `simpleSideEffectFreeExpression` only matches expressions
    // whose evaluation has no observable side effects (identifier read,
    // member chain, literal, this).
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

  if (entries.length === 0) {
    return `""`;
  }

  // Stage B — all values are compile-time literals: collapse to a single
  // constant string. null/false entries are dropped at build time.
  const literalEntries = entries.map((entry) => ({
    cssName: entry.cssName,
    literal: parseStyleLiteralValue(entry.valueCode),
  }));

  if (literalEntries.every((entry) => entry.literal !== undefined)) {
    const parts = literalEntries
      .filter((entry) => entry.literal !== null)
      .map((entry) => `${entry.cssName}:${escapeHtml(String(entry.literal))}`);

    if (parts.length === 0) {
      return `""`;
    }

    return stringLiteral(` style="${parts.join(";")}"`);
  }

  // Stage A — needSep tracking with inline string accumulator, no intermediate
  // array allocation and no `.join(";")` per render.
  const statements = entries.map((entry) =>
    `{ const _v = (${entry.valueCode}); if (_v != null && _v !== false) _style += (_style === "" ? "" : ";") + ${stringLiteral(`${entry.cssName}:`)} + ${escapeHelperName}(_v === true ? "" : _v); }`
  );

  return `(() => { let _style = ""; ${statements.join(" ")} return _style === "" ? "" : ${stringLiteral(" style=\"")} + _style + ${stringLiteral("\"")}; })()`;
}

function collectTextareaValueParts(
  node: Extract<JsxNodeIr, { kind: "element" }>,
  escapeHelperName: string,
  escapeBatchHelperName: string | undefined,
  asyncComponentNames: ReadonlySet<string>,
  dynamicAttributes: "drop" | "emit",
  contextProviderHelperName?: string,
  contextConsumerHelperName?: string,
  reactNodeRenderHelperName?: string,
  attributeScan = scanElementAttributes(node.tagName, node.attributes),
): string[] {
  const valueCode = attributeScan.formValueAttributeCode;
  if (valueCode !== undefined) {
    return [`${escapeHelperName}(${valueCode})`];
  }

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
    )
  );
}

function collectOptionSelectedAttributePart(
  node: Extract<JsxNodeIr, { kind: "element" }>,
  selectedValueCode: string | undefined,
): string | undefined {
  if (selectedValueCode === undefined || node.tagName !== "option") {
    return undefined;
  }

  const optionValueCode = findOptionValueCode(node);
  if (optionValueCode === undefined) {
    return undefined;
  }

  return `(() => { const _selected = (${selectedValueCode}); return _selected == null ? "" : String(_selected) === String(${optionValueCode}) ? ${stringLiteral(' selected=""')} : ""; })()`;
}

function findOptionValueCode(node: Extract<JsxNodeIr, { kind: "element" }>): string | undefined {
  const valueAttr = node.attributes.find((attr) => attr.kind !== "spread-attr" && attr.name === "value");
  if (valueAttr !== undefined && valueAttr.kind !== "event" && valueAttr.kind !== "spread-attr") {
    return valueAttr.kind === "static-attr" ? stringLiteral(valueAttr.value) : `(${valueAttr.code})`;
  }

  return node.children.every((child) => child.kind === "text")
    ? stringLiteral(node.children.map((child) => child.value).join(""))
    : undefined;
}

function htmlAttributeNameForElement(tagName: string, name: string): string {
  if (tagName === "input") {
    if (name === "defaultValue") {
      return "value";
    }

    if (name === "defaultChecked") {
      return "checked";
    }
  }

  return htmlAttributeName(name);
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

function emitSyncListIife(
  node: Extract<JsxNodeIr, { kind: "list" }>,
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
  const itemBinding = `const ${node.itemName} = _arr[_i];`;
  const indexBinding =
    node.indexName === undefined ? "" : ` const ${node.indexName} = _i;`;
  const bodyStatements =
    node.bodyStatements === undefined || node.bodyStatements.length === 0
      ? ""
      : ` ${node.bodyStatements.join(" ")}`;

  return `(() => { let _o = ""; const _arr = (${node.itemsCode}); for (let _i = 0, _len = _arr.length; _i < _len; _i++) { ${itemBinding}${indexBinding}${bodyStatements} _o += ${valueExpression}; } return _o; })()`;
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

function isClientBoundaryPlaceholder(node: Extract<JsxNodeIr, { kind: "component" }>): boolean {
  return node.clientReference !== undefined && !isCompatClientReference(node);
}

function isCompatClientReference(node: Extract<JsxNodeIr, { kind: "component" }>): boolean {
  return node.clientReference !== undefined && /\.(?:compat)\.[cm]?[jt]sx?$/.test(node.clientReference.moduleId);
}

function clientBoundaryPlaceholder(node: Extract<JsxNodeIr, { kind: "component" }>): string {
  return `<!--mreact-client-boundary:${escapeHtml(node.name)}-->`;
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

function usesClientBoundary(ir: ModuleIr): boolean {
  return ir.components.some((component) => containsClientBoundary(component.root));
}

function emitClientBoundaryHelper(name: string): string {
  const propsHelperName = `${name}$hasNonSerializableProps`;

  return [
    `function ${propsHelperName}(value) {`,
    `  if (typeof value === "function" || typeof value === "symbol") return true;`,
    `  if (value === null || typeof value !== "object") return false;`,
    `  if (Array.isArray(value)) return value.some(${propsHelperName});`,
    `  for (const key of Object.keys(value)) {`,
    `    if (${propsHelperName}(value[key])) return true;`,
    `  }`,
    `  return false;`,
    `}`,
    `function ${name}(name, props) {`,
    `  const _name = String(name);`,
    `  const _escapedName = _name.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");`,
    `  const _props = props ?? {};`,
    `  const _nonSerializable = ${propsHelperName}(_props);`,
    `  const _nonSerializableAttr = _nonSerializable ? ' data-mreact-client-boundary-nonserializable="true"' : "";`,
    `  const _json = (JSON.stringify(_props) ?? "{}").replaceAll("<", "\\\\u003c");`,
    `  return \`<template data-mreact-client-boundary="\${_escapedName}"\${_nonSerializableAttr}></template><script type="application/json" data-mreact-client-boundary-props="\${_escapedName}">\${_json}</script>\`;`,
    `}`,
  ].join("\n");
}

function containsClientBoundary(node: JsxNodeIr): boolean {
  if (node.kind === "component" && isClientBoundaryPlaceholder(node)) {
    return true;
  }

  if (node.kind === "conditional") {
    return [...node.whenTrue, ...node.whenFalse].some(containsClientBoundary);
  }

  if (node.kind === "list") {
    return node.children.some(containsClientBoundary);
  }

  if (node.kind === "fragment" || node.kind === "element") {
    return node.children.some(containsClientBoundary);
  }

  if (node.kind === "component") {
    return (
      node.children.some(containsClientBoundary) ||
      node.props.some(
        (prop) => prop.kind === "render-prop" && prop.children.some(containsClientBoundary),
      )
    );
  }

  if (node.kind === "async-boundary") {
    return (
      node.children.some(containsClientBoundary) ||
      node.placeholderChildren?.some(containsClientBoundary) === true ||
      node.catchChildren?.some(containsClientBoundary) === true
    );
  }

  return false;
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
    if (node.runtime === "compat" && !isClientBoundaryPlaceholder(node)) {
      return true;
    }

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
