import type { AttributeIr, ComponentPropIr, ComponentIr, JsxNodeIr, ModuleIr } from "./ir.js";
import type { RuntimeImport, ServerEscapeOptions } from "./types.js";
import { emitEscapeHtmlHelper } from "./emit-escape-helper.js";
import { createCodeBuilder } from "./emit-code-builder.js";
import { escapeHtmlAttribute as escapeHtml } from "@reckona/mreact-shared/html-escape";
import {
  emitOptionSelectedAttributeCode,
  emitSelectSelectionValueCode,
  htmlAttributeName,
  isBooleanishStringAttribute,
  isDangerousHtmlAttribute,
  isStaticUrlValueUnsafe,
  isUrlAttribute,
  isVoidHtmlElement,
  parseStaticStyleObjectLiteral,
  parseStyleLiteralValue,
  simpleSideEffectFreeExpression,
  type OptionSelectedLocalNames,
} from "./emit-server-shared.js";
import {
  emitOxcCompatObjectChildren,
  oxcServerStringReactNodeRenderHelperPlaceholder,
  setOxcServerStringUrlSafeHelperName,
} from "./oxc-runtime-emit.js";

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
let currentCompatChildHelperName: string | undefined;
let currentSpreadAttributesHelperName: string = "_renderSpreadAttributes";
let currentMarkServerRenderValueHelperName: string = "_registerServerRenderValue";
let currentRenderServerValueHelperName: string = "_renderServerValue";
let currentContainsServerRenderValueHelperName: string = "_containsServerRenderValue";
let currentServerRenderAttributeValueName: string = "_serverRenderAttributeValue";
let currentOptionSelectedLocalNames: OptionSelectedLocalNames = {
  selected: "_selected",
  optionValue: "_optionValue",
  index: "_i",
  candidate: "_candidate",
};
/**
 * Selection expression of the nearest enclosing `<select>`, or `undefined` outside
 * one. Emit-time only (this walker is a synchronous tree walk, and nothing here
 * survives into generated code), so unlike a runtime global it cannot leak between
 * sibling selects or concurrent requests: every `<select>` saves and restores it
 * around its own children. Threading it through the walker's parameter list would
 * mean touching ~25 recursion sites, and the stream emitter already carries the
 * same value on its `CollectHtmlState`.
 */
let currentSelectedValueCode: string | undefined;

function withSelectedValueCode<T>(selectedValueCode: string | undefined, emit: () => T): T {
  const previous = currentSelectedValueCode;
  currentSelectedValueCode = selectedValueCode;
  try {
    return emit();
  } finally {
    currentSelectedValueCode = previous;
  }
}

export function emitServer(ir: ModuleIr, options: EmitServerOptions = {}): EmitResult {
  const escapeHelperName = allocateEscapeHelperName(ir);
  const escapeBatchHelperName =
    options.escape === undefined ? undefined : allocateHelperName(ir, "_escapeHtmlBatch");
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
    ? allocateHelperFamilyName(ir, "_renderClientBoundary", [
        "$hasNonSerializableProps",
        "$markChildren",
      ])
    : undefined;
  const compatChildHelperName = usesCompatChildRender(ir)
    ? allocateHelperName(ir, "_renderCompatChild")
    : undefined;
  const spreadAttributesHelperName = allocateHelperName(ir, "_renderSpreadAttributes");
  const markServerRenderValueHelperName = allocateNestedBindingSafeName(
    ir,
    "_registerServerRenderValue",
  );
  const renderServerValueHelperName = allocateNestedBindingSafeName(ir, "_renderServerValue");
  const isServerRenderValueHelperName = allocateNestedBindingSafeName(ir, "_isServerRenderValue");
  const readServerRenderValueHelperName = allocateNestedBindingSafeName(ir, "_readServerRenderValue");
  const containsServerRenderValueHelperName = allocateNestedBindingSafeName(
    ir,
    "_containsServerRenderValue",
  );
  const serverRenderAttributeValueName = allocateNestedBindingSafeName(
    ir,
    "_serverRenderAttributeValue",
  );
  currentOptionSelectedLocalNames = {
    selected: allocateNestedBindingSafeName(ir, "_selected"),
    optionValue: allocateNestedBindingSafeName(ir, "_optionValue"),
    index: allocateNestedBindingSafeName(ir, "_i"),
    candidate: allocateNestedBindingSafeName(ir, "_candidate"),
  };
  const outAccumulatorName = allocateHelperName(ir, "_out");
  const urlSafeHelperName = allocateHelperName(ir, "_urlAttrSafe");
  currentUrlSafeHelperName = urlSafeHelperName;
  setOxcServerStringUrlSafeHelperName(urlSafeHelperName);
  currentClientBoundaryHelperName = clientBoundaryHelperName;
  currentCompatChildHelperName = compatChildHelperName;
  currentSpreadAttributesHelperName = spreadAttributesHelperName;
  currentMarkServerRenderValueHelperName = markServerRenderValueHelperName;
  currentRenderServerValueHelperName = renderServerValueHelperName;
  currentContainsServerRenderValueHelperName = containsServerRenderValueHelperName;
  currentServerRenderAttributeValueName = serverRenderAttributeValueName;
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
    `  name = name.toLowerCase();`,
    `  value = String(value);`,
    `  if (name === "srcset" || name === "imagesrcset") {`,
    `    const _canonicalSet = value.replace(/^[\\x00-\\x20]+/u, "").replace(/[\\t\\r\\n]/g, "");`,
    `    for (const _candidate of _canonicalSet.split(",")) {`,
    `      const _url = (_candidate.trim().split(/\\s+/)[0] || "");`,
    `      if (_url !== "" && ${urlSafeHelperName}("src", _url) === undefined) return undefined;`,
    `    }`,
    `    return value;`,
    `  }`,
    `  const _canonical = value`,
    `    .replace(/^[\\x00-\\x20]+/u, "")`,
    `    .replace(/[\\t\\r\\n]/g, "");`,
    `  const _match = /^([a-zA-Z][a-zA-Z0-9+.-]*):/.exec(_canonical);`,
    `  if (_match === null) return value;`,
    `  const _scheme = _match[1].toLowerCase();`,
    `  if (_scheme !== "javascript" && _scheme !== "vbscript" && _scheme !== "livescript" && _scheme !== "mhtml" && _scheme !== "file" && _scheme !== "data") return value;`,
    `  if (_scheme === "data" && (name === "src" || name === "poster") && /^data:image\\/(?!svg\\+xml\\s*(?:[;,]|$))/i.test(_canonical)) return value;`,
    `  return undefined;`,
    `}`,
  ].join("\n");
  const asyncComponentNames = collectAsyncServerComponentNames(ir.components);
  const components = ir.components
    .map((component) => {
      const emitted = emitComponent(
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
      );
      return component.serverRenderValuePlaceholder === undefined
        ? emitted
        : emitted.replaceAll(
            component.serverRenderValuePlaceholder,
            markServerRenderValueHelperName,
          );
    })
    .join("\n\n");
  const rawModuleStatements = emitModuleStatements(ir);
  const moduleStatements =
    ir.serverRenderValuePlaceholder === undefined
      ? rawModuleStatements
      : rawModuleStatements.replaceAll(
          ir.serverRenderValuePlaceholder,
          markServerRenderValueHelperName,
        );
  const emittedServerCode = `${moduleStatements}\n${components}`;
  // Tree-shake the URL-safety helper when it is not referenced by any
  // component output. Same shape as the existing escapeImport check.
  const needsSpreadAttributesHelper = components.includes(spreadAttributesHelperName);
  const urlSafeBlock =
    components.includes(urlSafeHelperName) || needsSpreadAttributesHelper ? urlSafeHelper : "";
  const needsServerRenderValue =
    emittedServerCode.includes(markServerRenderValueHelperName) ||
    emittedServerCode.includes(renderServerValueHelperName) ||
    emittedServerCode.includes(isServerRenderValueHelperName) ||
    emittedServerCode.includes(containsServerRenderValueHelperName);
  const clientBoundaryBlock =
    clientBoundaryHelperName === undefined || !components.includes(clientBoundaryHelperName)
      ? ""
      : emitClientBoundaryHelper(
          clientBoundaryHelperName,
          needsServerRenderValue ? isServerRenderValueHelperName : undefined,
        );
  const spreadAttributesBlock = needsSpreadAttributesHelper
    ? emitSpreadAttributesHelper(
        spreadAttributesHelperName,
        escapeHelperName,
        urlSafeHelperName,
        needsServerRenderValue ? containsServerRenderValueHelperName : undefined,
      )
    : "";
  const serverRenderValueBlock = needsServerRenderValue
    ? emitServerRenderValueHelpers(
        isServerRenderValueHelperName,
        readServerRenderValueHelperName,
        containsServerRenderValueHelperName,
        renderServerValueHelperName,
        escapeHelperName,
      )
    : "";
  const serverRenderValueImport =
    serverRenderValueBlock === ""
      ? ""
      : `import { isServerRenderValue as ${isServerRenderValueHelperName}, readServerRenderValue as ${readServerRenderValueHelperName}, registerServerRenderValue as ${markServerRenderValueHelperName} } from "@reckona/mreact-shared/server-render-value-internal";`;
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
    compatChildHelperName,
  );
  const code = createCodeBuilder();
  code.section(userImports);
  code.section(escapeImport);
  code.section(contextImport);
  code.section(serverRenderValueImport);
  code.section(moduleStatements);
  code.section(helper);
  code.section(urlSafeBlock);
  code.section(clientBoundaryBlock);
  code.section(spreadAttributesBlock);
  code.section(serverRenderValueBlock);
  code.section(components);

  return {
    code: code.toString(),
    imports: [
      ...collectContextImports(
        contextProviderHelperName,
        contextConsumerHelperName,
        reactNodeRenderHelperName,
        compatChildHelperName,
      ),
      ...(serverRenderValueBlock === ""
        ? []
        : [
            {
              source: "@reckona/mreact-shared/server-render-value-internal",
              specifiers: [
                "isServerRenderValue",
                "readServerRenderValue",
                "registerServerRenderValue",
              ],
            },
          ]),
    ],
  };
}

function emitContextImport(
  contextProviderHelperName: string | undefined,
  contextConsumerHelperName: string | undefined,
  reactNodeRenderHelperName: string | undefined,
  compatChildHelperName?: string | undefined,
): string {
  const specifiers = [
    reactNodeRenderHelperName === undefined
      ? undefined
      : `renderToString as ${reactNodeRenderHelperName}`,
    compatChildHelperName === undefined
      ? undefined
      : `renderChildToString as ${compatChildHelperName}`,
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
  compatChildHelperName?: string,
): RuntimeImport[] {
  const specifiers = [
    reactNodeRenderHelperName === undefined ? undefined : "renderToString",
    contextProviderHelperName === undefined ? undefined : "renderContextProviderToString",
    contextConsumerHelperName === undefined ? undefined : "renderContextConsumerToString",
    compatChildHelperName === undefined ? undefined : "renderChildToString",
  ].filter((specifier): specifier is string => specifier !== undefined);

  return specifiers.length === 0 ? [] : [{ source: "@reckona/mreact-compat", specifiers }];
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
  const body = component.bodyStatements.map(
    (statement) =>
      `  ${replaceOxcServerStringReactNodeRenderHelper(statement, reactNodeRenderHelperName)}`,
  );
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
    return '""';
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

    if (node.renderMode === "compat-child" && currentCompatChildHelperName !== undefined) {
      return [`${outVar} += ${currentCompatChildHelperName}(${node.code});`];
    }

    if (node.renderMode === "server-render-value") {
      return [`${outVar} += ${currentRenderServerValueHelperName}(${node.code});`];
    }

    return [`${outVar} += ${escapeHelperName}(${node.code});`];
  }

  if (node.kind === "conditional") {
    const conditionCode =
      node.conditionValueName === undefined
        ? node.conditionCode
        : (node.conditionTestCode ?? node.conditionValueName);
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

    let statements: string[];
    if (whenFalseStatements.length === 0) {
      statements = [
        `if (${conditionCode}) {`,
        ...whenTrueStatements.map((statement) => `  ${statement}`),
        `}`,
      ];
    } else if (whenTrueStatements.length === 0) {
      statements = [
        `if (!(${conditionCode})) {`,
        ...whenFalseStatements.map((statement) => `  ${statement}`),
        `}`,
      ];
    } else {
      statements = [
        `if (${conditionCode}) {`,
        ...whenTrueStatements.map((statement) => `  ${statement}`),
        `} else {`,
        ...whenFalseStatements.map((statement) => `  ${statement}`),
        `}`,
      ];
    }

    if (node.conditionValueName === undefined) {
      return statements;
    }

    return [
      `{`,
      `  const ${node.conditionValueName} = (${node.conditionCode});`,
      ...statements.map((statement) => `  ${statement}`),
      `}`,
    ];
  }

  if (node.kind === "list") {
    const isAsync = containsAsyncServerOperationInChildren(node.children, asyncComponentNames);

    if (isAsync) {
      // Parallel async path keeps the existing renderer + Promise.all + join
      // form to preserve concurrent resolution semantics.
      const parameters = emitListParameters(node);
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
    const itemPattern =
      node.parameterPatterns === undefined ? node.itemName : node.parameterPatterns[0];
    const itemBinding = itemPattern === undefined ? undefined : `const ${itemPattern} = _arr[_i];`;
    const indexPattern = node.parameterPatterns?.[1] ?? node.indexName;
    const arrayPattern = node.parameterPatterns?.[2] ?? node.arrayName;
    const indexBinding = indexPattern === undefined ? undefined : `const ${indexPattern} = _i;`;
    const arrayBinding = arrayPattern === undefined ? undefined : `const ${arrayPattern} = _arr;`;
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
      ...(itemBinding === undefined ? [] : [`    ${itemBinding}`]),
      ...(indexBinding === undefined ? [] : [`    ${indexBinding}`]),
      ...(arrayBinding === undefined ? [] : [`    ${arrayBinding}`]),
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
        const hasComponentFallback = shouldRenderClientBoundaryFallback(node);
        const boundaryProps = emitPropsObject(
          node.props,
          [],
          escapeHelperName,
          escapeBatchHelperName,
          asyncComponentNames,
          dynamicAttributes,
          contextProviderHelperName,
          contextConsumerHelperName,
          reactNodeRenderHelperName,
        );
        const fallbackHtml = hasComponentFallback
          ? `(_childrenHtml) => ${emitComponentCallExpression(
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
                node.name,
                "_childrenHtml",
              ),
              asyncComponentNames,
            )}`
          : emitHtmlExpressionFromChildren(
              node.children,
              escapeHelperName,
              escapeBatchHelperName,
              asyncComponentNames,
              dynamicAttributes,
              contextProviderHelperName,
              contextConsumerHelperName,
              reactNodeRenderHelperName,
            );
        const originalChildrenHtml = hasComponentFallback
          ? emitHtmlExpressionFromChildren(
              node.children,
              escapeHelperName,
              escapeBatchHelperName,
              asyncComponentNames,
              dynamicAttributes,
              contextProviderHelperName,
              contextConsumerHelperName,
              reactNodeRenderHelperName,
            )
          : undefined;
        return [
          `${outVar} += ${helperName}(${stringLiteral(node.name)}, ${boundaryProps}, ${fallbackHtml}${originalChildrenHtml === undefined ? "" : `, true, ${originalChildrenHtml}, ${node.children.length > 0}`});`,
        ];
      }

      return [`${outVar} += ${stringLiteral(clientBoundaryPlaceholder(node))};`];
    }

    if (node.runtime === "compat" && reactNodeRenderHelperName !== undefined) {
      return [
        `${outVar} += ${reactNodeRenderHelperName}(${node.name}, ${emitCompatRuntimePropsObject(
          node.props,
          node.children,
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
          node.name,
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

  const attributeScan = scanElementAttributes(node.tagName, node.attributes);
  if (
    dynamicAttributes === "emit" &&
    !isVoidHtmlElement(node.tagName) &&
    node.attributes.some((attr) => attr.kind === "spread-attr")
  ) {
    const selectedAttributePart = collectOptionSelectedAttributePart(node);
    statements.push(
      `${outVar} += ${emitMergedSpreadElementExpression(
        node.tagName,
        node.attributes,
        attributeScan,
        withSelectedValueCode(selectedValueCodeForChildren(node, attributeScan), () =>
          emitHtmlExpressionFromChildren(
            node.children,
            escapeHelperName,
            escapeBatchHelperName,
            asyncComponentNames,
            dynamicAttributes,
            contextProviderHelperName,
            contextConsumerHelperName,
            reactNodeRenderHelperName,
          ),
        ),
        selectedAttributePart,
        containsAsyncServerOperationInChildren(node.children, asyncComponentNames),
      )};`,
    );
    return statements;
  }

  statements.push(`${outVar} += ${stringLiteral(`<${node.tagName}`)};`);

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
  const selectedAttributePart = collectOptionSelectedAttributePart(node);
  if (selectedAttributePart !== undefined) {
    statements.push(`${outVar} += ${selectedAttributePart};`);
  }

  statements.push(`${outVar} += ">";`);

  if (isVoidHtmlElement(node.tagName)) {
    return statements;
  }

  const childSelectedValueCode = selectedValueCodeForChildren(node, attributeScan);

  const dangerousInnerHtml = emitDangerouslySetInnerHtmlExpression(
    node.attributes,
    emitHtmlExpressionFromChildren(
      node.children,
      escapeHelperName,
      escapeBatchHelperName,
      asyncComponentNames,
      dynamicAttributes,
      contextProviderHelperName,
      contextConsumerHelperName,
      reactNodeRenderHelperName,
    ),
  );
  if (dangerousInnerHtml !== undefined) {
    statements.push(`${outVar} += ${dangerousInnerHtml};`);
    statements.push(`${outVar} += ${stringLiteral(`</${node.tagName}>`)};`);
    return statements;
  }

  const childrenExpression = emitTextSeparatedSimpleChildrenExpression(
    node.children,
    escapeHelperName,
    escapeBatchHelperName,
  );

  if (
    childrenExpression !== undefined &&
    !(node.tagName === "select" && attributeScan.formValueAttributeCode !== undefined)
  ) {
    statements.push(`${outVar} += ${childrenExpression};`);
  } else {
    withSelectedValueCode(childSelectedValueCode, () => {
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
          ),
        );
      }
    });
  }

  statements.push(`${outVar} += ${stringLiteral(`</${node.tagName}>`)};`);

  return statements;
}

/**
 * Selection expression that this element's descendants compare against. A
 * `<select>` installs its own (possibly `undefined`, when it is uncontrolled) and
 * every other element simply passes the enclosing one through, so `<optgroup>`,
 * fragments, conditionals and list bodies keep the selection.
 */
function selectedValueCodeForChildren(
  node: Extract<JsxNodeIr, { kind: "element" }>,
  attributeScan: ElementAttributeScan,
): string | undefined {
  return node.tagName === "select"
    ? attributeScan.formValueAttributeCode
    : currentSelectedValueCode;
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

    if (node.renderMode === "compat-child" && currentCompatChildHelperName !== undefined) {
      return [`${currentCompatChildHelperName}(${node.code})`];
    }

    if (node.renderMode === "server-render-value") {
      return [`${currentRenderServerValueHelperName}(${node.code})`];
    }

    return [`${escapeHelperName}(${node.code})`];
  }

  if (node.kind === "conditional") {
    const whenTrue = emitHtmlExpressionFromChildren(
      node.whenTrue,
      escapeHelperName,
      escapeBatchHelperName,
      asyncComponentNames,
      dynamicAttributes,
      contextProviderHelperName,
      contextConsumerHelperName,
      reactNodeRenderHelperName,
    );
    const whenFalse = emitHtmlExpressionFromChildren(
      node.whenFalse,
      escapeHelperName,
      escapeBatchHelperName,
      asyncComponentNames,
      dynamicAttributes,
      contextProviderHelperName,
      contextConsumerHelperName,
      reactNodeRenderHelperName,
    );

    return [
      node.conditionValueName === undefined
        ? `((${node.conditionCode}) ? ${whenTrue} : ${whenFalse})`
        : `(() => { const ${node.conditionValueName} = (${node.conditionCode}); return ${node.conditionTestCode ?? node.conditionValueName} ? ${whenTrue} : ${whenFalse}; })()`,
    ];
  }

  if (node.kind === "list") {
    const isAsync = containsAsyncServerOperationInChildren(node.children, asyncComponentNames);

    if (isAsync) {
      // Async lists rely on Promise.all() for parallel resolution; the
      // callback allocation is amortized across `await` latency, so we keep
      // the `.map().then(...).join("")` form.
      const parameters = emitListParameters(node);
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
    return [
      emitSyncListIife(
        node,
        escapeHelperName,
        escapeBatchHelperName,
        asyncComponentNames,
        dynamicAttributes,
        contextProviderHelperName,
        contextConsumerHelperName,
        reactNodeRenderHelperName,
      ),
    ];
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
        const hasComponentFallback = shouldRenderClientBoundaryFallback(node);
        const boundaryProps = emitPropsObject(
          node.props,
          [],
          escapeHelperName,
          escapeBatchHelperName,
          asyncComponentNames,
          dynamicAttributes,
          contextProviderHelperName,
          contextConsumerHelperName,
          reactNodeRenderHelperName,
        );
        const fallbackHtml = hasComponentFallback
          ? `(_childrenHtml) => ${emitComponentCallExpression(
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
                node.name,
                "_childrenHtml",
              ),
              asyncComponentNames,
            )}`
          : emitHtmlExpressionFromChildren(
              node.children,
              escapeHelperName,
              escapeBatchHelperName,
              asyncComponentNames,
              dynamicAttributes,
              contextProviderHelperName,
              contextConsumerHelperName,
              reactNodeRenderHelperName,
            );
        const originalChildrenHtml = hasComponentFallback
          ? emitHtmlExpressionFromChildren(
              node.children,
              escapeHelperName,
              escapeBatchHelperName,
              asyncComponentNames,
              dynamicAttributes,
              contextProviderHelperName,
              contextConsumerHelperName,
              reactNodeRenderHelperName,
            )
          : undefined;
        return [
          `${helperName}(${stringLiteral(node.name)}, ${boundaryProps}, ${fallbackHtml}${originalChildrenHtml === undefined ? "" : `, true, ${originalChildrenHtml}, ${node.children.length > 0}`})`,
        ];
      }

      return [stringLiteral(clientBoundaryPlaceholder(node))];
    }

    if (node.runtime === "compat" && reactNodeRenderHelperName !== undefined) {
      return [
        `${reactNodeRenderHelperName}(${node.name}, ${emitCompatRuntimePropsObject(
          node.props,
          node.children,
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

  const childrenExpression = emitTextSeparatedSimpleChildrenExpression(
    node.children,
    escapeHelperName,
    escapeBatchHelperName,
  );
  const attributeScan = scanElementAttributes(node.tagName, node.attributes);
  const childSelectedValueCode = selectedValueCodeForChildren(node, attributeScan);
  const forceChildWalk =
    node.tagName === "select" && attributeScan.formValueAttributeCode !== undefined;
  const selectedAttributePart = collectOptionSelectedAttributePart(node);
  if (
    dynamicAttributes === "emit" &&
    !isVoidHtmlElement(node.tagName) &&
    node.attributes.some((attr) => attr.kind === "spread-attr")
  ) {
    return [
      emitMergedSpreadElementExpression(
        node.tagName,
        node.attributes,
        attributeScan,
        withSelectedValueCode(childSelectedValueCode, () =>
          emitHtmlExpressionFromChildren(
            node.children,
            escapeHelperName,
            escapeBatchHelperName,
            asyncComponentNames,
            dynamicAttributes,
            contextProviderHelperName,
            contextConsumerHelperName,
            reactNodeRenderHelperName,
          ),
        ),
        selectedAttributePart,
        containsAsyncServerOperationInChildren(node.children, asyncComponentNames),
      ),
    ];
  }
  const dangerousInnerHtml = emitDangerouslySetInnerHtmlExpression(
    node.attributes,
    emitHtmlExpressionFromChildren(
      node.children,
      escapeHelperName,
      escapeBatchHelperName,
      asyncComponentNames,
      dynamicAttributes,
      contextProviderHelperName,
      contextConsumerHelperName,
      reactNodeRenderHelperName,
    ),
  );
  const childrenParts = isVoidHtmlElement(node.tagName)
    ? []
    : dangerousInnerHtml !== undefined
      ? [dangerousInnerHtml]
      : childrenExpression === undefined || forceChildWalk
        ? withSelectedValueCode(childSelectedValueCode, () =>
            node.children.flatMap((child) =>
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
          )
        : [childrenExpression];

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
    ...childrenParts,
    ...(isVoidHtmlElement(node.tagName) ? [] : [stringLiteral(closeTag)]),
  ];
}

function emitDangerouslySetInnerHtmlExpression(
  attrs: readonly AttributeIr[],
  fallbackCode: string,
): string | undefined {
  if (
    !attrs.some((attr) => attr.kind === "spread-attr" || attr.name === "dangerouslySetInnerHTML")
  ) {
    return undefined;
  }

  const assignments = attrs.flatMap((attr): string[] => {
    if (attr.kind === "spread-attr") {
      return [`${currentSpreadAttributesHelperName}$assign(_props, (${attr.code}) ?? {});`];
    }
    return attr.kind === "dynamic-attr" && attr.name === "dangerouslySetInnerHTML"
      ? [`_props.dangerouslySetInnerHTML = (${attr.code});`]
      : [];
  });
  return `(() => { const _props = {}; ${assignments.join(" ")} if (!Object.prototype.hasOwnProperty.call(_props, "dangerouslySetInnerHTML")) return ${fallbackCode}; return ${emitExactDangerouslySetInnerHtmlExpression("_props.dangerouslySetInnerHTML")}; })()`;
}

function emitMergedSpreadElementExpression(
  tagName: string,
  attrs: readonly AttributeIr[],
  attributeScan: ElementAttributeScan,
  fallbackCode: string,
  selectedAttributePart: string | undefined,
  asyncFallback: boolean,
): string {
  const propsName = `${currentSpreadAttributesHelperName}$props`;
  const assignments = emitMergedSpreadPropsAssignments(
    tagName,
    attrs,
    attributeScan,
    propsName,
    true,
  );
  const opening = `${stringLiteral(`<${tagName}`)} + ${currentSpreadAttributesHelperName}(${stringLiteral(tagName)}, ${propsName})${selectedAttributePart === undefined ? "" : ` + (${selectedAttributePart})`} + ">"`;
  const innerHtml = `Object.prototype.hasOwnProperty.call(${propsName}, "dangerouslySetInnerHTML") ? ${emitExactDangerouslySetInnerHtmlExpression(`${propsName}.dangerouslySetInnerHTML`)} : (${fallbackCode})`;

  const invocation = `${asyncFallback ? "(async () =>" : "(() =>"} { const ${propsName} = {}; ${assignments.join(" ")} return ${opening} + (${innerHtml}) + ${stringLiteral(`</${tagName}>`)}; })()`;
  return asyncFallback ? `(await ${invocation})` : invocation;
}

function emitExactDangerouslySetInnerHtmlExpression(code: string): string {
  return `(() => { const _value = (${code}); if (typeof _value !== "object" || _value === null) return ""; try { const _descriptor = Object.getOwnPropertyDescriptor(_value, "__html"); return _descriptor !== undefined && "value" in _descriptor && typeof _descriptor.value === "string" ? _descriptor.value : ""; } catch { return ""; } })()`;
}

function collectHtmlAttributeParts(
  tagName: string,
  attr: AttributeIr,
  escapeHelperName: string,
  escapeBatchHelperName: string | undefined,
  dynamicAttributes: "drop" | "emit",
): string[] {
  if (attr.kind === "dom-ref") {
    return [];
  }

  if (attr.kind === "spread-attr") {
    return dynamicAttributes === "drop"
      ? []
      : [`${currentSpreadAttributesHelperName}(${stringLiteral(tagName)}, (${attr.code}))`];
  }

  if (attr.kind === "event" || attr.name === "key" || attr.name === "dangerouslySetInnerHTML") {
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
    if (attr.serialization !== "compat" && attr.omitServerRenderValue === true) {
      return [
        emitDynamicStyleAttributeExpression(
          attr.code,
          escapeHelperName,
          escapeBatchHelperName,
          currentContainsServerRenderValueHelperName,
        ),
      ];
    }
    return [
      emitDynamicAttributeWithServerRenderValueOmission(attr, (code) =>
        attr.serialization === "compat"
          ? emitCompatDynamicStyleAttributeExpression(code, escapeHelperName)
          : emitDynamicStyleAttributeExpression(
              code,
              escapeHelperName,
              escapeBatchHelperName,
              attr.omitServerRenderValue === true
                ? currentContainsServerRenderValueHelperName
                : undefined,
            ),
      ),
    ];
  }

  if (isDangerousHtmlAttribute(htmlName)) {
    // Dynamic srcdoc must arrive as `{ __html: "..." }`. Drop anything
    // else at runtime so a value computed from a loader cannot inject
    // executable HTML into the iframe document.
    return [
      emitDynamicAttributeWithServerRenderValueOmission(
        attr,
        (code) =>
          `(() => { const _value = (${code}); if (typeof _value !== "object" || _value === null) return ""; try { const _descriptor = Object.getOwnPropertyDescriptor(_value, "__html"); if (_descriptor !== undefined && "value" in _descriptor && typeof _descriptor.value === "string") return ${stringLiteral(` ${htmlName}="`)} + ${escapeHelperName}(_descriptor.value) + ${stringLiteral('"')}; return ""; } catch { return ""; } })()`,
      ),
    ];
  }

  return [
    emitDynamicAttributeWithServerRenderValueOmission(attr, (code) =>
      attr.serialization === "compat" && !isUrlAttribute(htmlName)
        ? emitCompatDynamicAttributeExpression(htmlName, code, escapeHelperName)
        : emitDynamicAttributeExpression(htmlName, code, escapeHelperName),
    ),
  ];
}

function emitDynamicAttributeWithServerRenderValueOmission(
  attr: Extract<AttributeIr, { kind: "dynamic-attr" }>,
  emit: (code: string) => string,
): string {
  if (attr.omitServerRenderValue !== true) {
    return emit(attr.code);
  }

  if (simpleSideEffectFreeExpression(attr.code)) {
    return `${currentContainsServerRenderValueHelperName}(${attr.code}) ? "" : (${emit(attr.code)})`;
  }

  const valueName = currentServerRenderAttributeValueName;
  return `(() => { const ${valueName} = (${attr.code}); return ${currentContainsServerRenderValueHelperName}(${valueName}) ? "" : (${emit(valueName)}); })()`;
}

function collectElementAttributeParts(
  tagName: string,
  attrs: readonly AttributeIr[],
  escapeHelperName: string,
  escapeBatchHelperName: string | undefined,
  dynamicAttributes: "drop" | "emit",
  attributeScan = scanElementAttributes(tagName, attrs),
): string[] {
  if (dynamicAttributes === "emit" && attrs.some((attr) => attr.kind === "spread-attr")) {
    return [emitMergedSpreadAttributeExpression(tagName, attrs, attributeScan)];
  }

  return attrs.flatMap((attr) =>
    attr.kind !== "spread-attr" &&
    ((tagName === "input" &&
      ((attr.name === "defaultValue" && attributeScan.hasExplicitInputValue) ||
        (attr.name === "defaultChecked" && attributeScan.hasExplicitInputChecked))) ||
      ((tagName === "textarea" || tagName === "select") &&
        (attr.name === "value" || attr.name === "defaultValue")) ||
      isSuppressedOptionSelectedAttribute(tagName, attr.name))
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

function emitMergedSpreadAttributeExpression(
  tagName: string,
  attrs: readonly AttributeIr[],
  attributeScan: ElementAttributeScan,
): string {
  const propsName = "_props";
  const statements = emitMergedSpreadPropsAssignments(
    tagName,
    attrs,
    attributeScan,
    propsName,
    false,
  );

  return `(() => { const ${propsName} = {}; ${statements.join(" ")} return ${currentSpreadAttributesHelperName}(${stringLiteral(tagName)}, ${propsName}); })()`;
}

function emitMergedSpreadPropsAssignments(
  tagName: string,
  attrs: readonly AttributeIr[],
  attributeScan: ElementAttributeScan,
  propsName: string,
  includeDangerouslySetInnerHtml: boolean,
): string[] {
  return attrs.flatMap((attr): string[] => {
    if (
      attr.kind !== "spread-attr" &&
      ((tagName === "input" &&
        ((attr.name === "defaultValue" && attributeScan.hasExplicitInputValue) ||
          (attr.name === "defaultChecked" && attributeScan.hasExplicitInputChecked))) ||
        ((tagName === "textarea" || tagName === "select") &&
          (attr.name === "value" || attr.name === "defaultValue")))
    ) {
      return [];
    }

    if (attr.kind === "spread-attr") {
      return [`${currentSpreadAttributesHelperName}$assign(${propsName}, (${attr.code}) ?? {});`];
    }

    if (attr.kind === "event" || attr.name === "key") {
      return [];
    }

    if (attr.name === "dangerouslySetInnerHTML" && !includeDangerouslySetInnerHtml) return [];

    const valueCode =
      attr.kind === "static-attr"
        ? stringLiteral(attr.value)
        : attr.kind === "dynamic-attr" && attr.omitServerRenderValue === true
          ? `(() => { const _value = (${attr.code}); return ${currentContainsServerRenderValueHelperName}(_value) ? undefined : _value; })()`
          : `(${attr.code})`;
    return [`${propsName}[${stringLiteral(attr.name)}] = ${valueCode};`];
  });
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
    } else if ((tagName === "textarea" || tagName === "select") && attr.name === "defaultValue") {
      defaultValueAttributeCode = readFormValueAttributeCode(attr);
    }
  }

  return {
    hasExplicitInputValue,
    hasExplicitInputChecked,
    formValueAttributeCode:
      tagName === "select"
        ? emitSelectSelectionValueCode(valueAttributeCode, defaultValueAttributeCode)
        : (valueAttributeCode ?? defaultValueAttributeCode),
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
  const booleanishString = isBooleanishStringAttribute(name);

  if (isUrlAttribute(name)) {
    // Run the value through the inline URL safety helper. The helper
    // returns the value when safe and `undefined` when the attribute
    // should be dropped. Using an IIFE here is necessary because we
    // need to capture the value once and branch on the helper output.
    return `(() => { const _value = (${code}); if (_value == null || _value === false) return ""; const _checked = ${currentUrlSafeHelperName}(${stringLiteral(name)}, _value === true ? "" : _value); return _checked === undefined ? "" : ${stringLiteral(` ${name}="`)} + ${escapeHelperName}(_checked) + ${stringLiteral('"')}; })()`;
  }

  const inlineExpr = simpleSideEffectFreeExpression(code);

  if (inlineExpr !== undefined) {
    // Inline 3 evaluations to avoid per-attribute IIFE closure allocation.
    // Safe because `simpleSideEffectFreeExpression` only matches expressions
    // whose evaluation has no observable side effects (identifier read,
    // member chain, literal, this).
    return booleanishString
      ? `(${inlineExpr} == null ? "" : ${stringLiteral(` ${name}="`)} + ${escapeHelperName}(${inlineExpr}) + ${stringLiteral('"')})`
      : `(${inlineExpr} == null || ${inlineExpr} === false ? "" : ${stringLiteral(` ${name}="`)} + ${escapeHelperName}(${inlineExpr} === true ? "" : ${inlineExpr}) + ${stringLiteral('"')})`;
  }

  return booleanishString
    ? `(() => { const _value = (${code}); return _value == null ? "" : ${stringLiteral(` ${name}="`)} + ${escapeHelperName}(_value) + ${stringLiteral('"')}; })()`
    : `(() => { const _value = (${code}); return _value == null || _value === false ? "" : ${stringLiteral(` ${name}="`)} + ${escapeHelperName}(_value === true ? "" : _value) + ${stringLiteral('"')}; })()`;
}

// Mirrors packages/react-compat/src/server-render.ts renderHtmlAttribute for
// dynamic values: functions and objects drop, booleans serialize as
// "true"/"false" for booleanish-string and data attributes, and false drops
// elsewhere. Byte parity with the interpreter is pinned by tests.
function emitCompatDynamicAttributeExpression(
  name: string,
  code: string,
  escapeHelperName: string,
): string {
  const lowerCased = name.toLowerCase();
  const booleanishOrData =
    lowerCased.startsWith("aria-") ||
    lowerCased.startsWith("data-") ||
    lowerCased === "contenteditable" ||
    lowerCased === "draggable" ||
    lowerCased === "spellcheck";
  const booleanBranch = booleanishOrData
    ? `return ${stringLiteral(` ${name}="`)} + (_value ? "true" : "false") + ${stringLiteral('"')};`
    : `return _value ? ${stringLiteral(` ${name}=""`)} : "";`;

  return `(() => { const _value = (${code}); if (_value == null || typeof _value === "function") return ""; if (typeof _value === "boolean") { ${booleanBranch} } if (typeof _value === "object") return ""; return ${stringLiteral(` ${name}="`)} + ${escapeHelperName}(_value) + ${stringLiteral('"')}; })()`;
}

// Mirrors packages/react-compat/src/server-render.ts renderStyleAttribute and
// renderCssValue: skips null/boolean/empty entries and appends px to nonzero
// numeric values outside the react unitless list.
function emitCompatDynamicStyleAttributeExpression(code: string, escapeHelperName: string): string {
  const unitlessCheck =
    '_styleName === "flex" || _styleName === "fontWeight" || _styleName === "lineHeight" || _styleName === "opacity" || _styleName === "order" || _styleName === "zIndex" || _styleName === "zoom"';

  return `(() => { const _value = (${code}); if (_value == null || typeof _value !== "object") return ""; let _style = ""; for (const _styleName in _value) { const _styleValue = _value[_styleName]; if (_styleValue == null || typeof _styleValue === "boolean" || _styleValue === "") continue; const _cssName = _styleName.startsWith("--") ? _styleName : _styleName.replace(/[A-Z]/g, (_char) => "-" + _char.toLowerCase()); const _css = typeof _styleValue !== "number" || _styleValue === 0 || (${unitlessCheck}) ? String(_styleValue) : _styleValue + "px"; _style += (_style === "" ? "" : ";") + ${escapeHelperName}(_cssName) + ":" + ${escapeHelperName}(_css); } return _style === "" ? "" : ${stringLiteral(' style="')} + _style + ${stringLiteral('"')}; })()`;
}

function emitDynamicStyleAttributeExpression(
  code: string,
  escapeHelperName: string,
  escapeBatchHelperName: string | undefined,
  containsServerRenderValueHelperName?: string,
): string {
  const staticStyleExpression = emitStaticStyleObjectAttributeExpression(
    code,
    escapeHelperName,
    containsServerRenderValueHelperName,
  );

  if (staticStyleExpression !== undefined) {
    return staticStyleExpression;
  }

  const escapedPair =
    escapeBatchHelperName === undefined
      ? `${escapeHelperName}(_cssName) + ":" + ${escapeHelperName}(_styleValue === true ? "" : _styleValue)`
      : `(() => { const _escaped = ${escapeBatchHelperName}([_cssName, _styleValue === true ? "" : _styleValue]); return _escaped[0] + ":" + _escaped[1]; })()`;

  const renderValueGuard =
    containsServerRenderValueHelperName === undefined
      ? ""
      : ` if (_entries.some(([, _styleValue]) => ${containsServerRenderValueHelperName}(_styleValue))) return "";`;

  return `(() => { const _value = (${code}); if (_value == null || _value === false) return ""; if (typeof _value === "string") { const _style = ${escapeHelperName}(_value); return _style === "" ? "" : ${stringLiteral(' style="')} + _style + ${stringLiteral('"')}; } const _entries = Object.entries(_value);${renderValueGuard} const _style = _entries.filter(([, _styleValue]) => _styleValue != null && _styleValue !== false).map(([_styleName, _styleValue]) => { const _cssName = String(_styleName).startsWith("--") ? String(_styleName) : String(_styleName).replace(/[A-Z]/g, (_char) => "-" + _char.toLowerCase()); return ${escapedPair}; }).join(";"); return _style === "" ? "" : ${stringLiteral(' style="')} + _style + ${stringLiteral('"')}; })()`;
}

function emitStaticStyleObjectAttributeExpression(
  code: string,
  escapeHelperName: string,
  containsServerRenderValueHelperName?: string,
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
  const statements = entries.map(
    (entry) =>
      `{ const _v = (${entry.valueCode});${containsServerRenderValueHelperName === undefined ? "" : ` if (${containsServerRenderValueHelperName}(_v)) return "";`} if (_v != null && _v !== false) _style += (_style === "" ? "" : ";") + ${stringLiteral(`${entry.cssName}:`)} + ${escapeHelperName}(_v === true ? "" : _v); }`,
  );

  return `(() => { let _style = ""; ${statements.join(" ")} return _style === "" ? "" : ${stringLiteral(' style="')} + _style + ${stringLiteral('"')}; })()`;
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
    ),
  );
}

function collectOptionSelectedAttributePart(
  node: Extract<JsxNodeIr, { kind: "element" }>,
): string | undefined {
  const selectedValueCode = currentSelectedValueCode;
  if (selectedValueCode === undefined || node.tagName !== "option") {
    return undefined;
  }

  const optionValueCode = findOptionValueCode(node);
  return emitOptionSelectedAttributeCode(
    selectedValueCode,
    optionValueCode,
    emitOwnSelectedFallbackCode(node),
    currentOptionSelectedLocalNames,
  );
}

/**
 * `<option selected>` only decides the selection when the enclosing `<select>`
 * has none, so its attribute is dropped from the normal attribute list (see
 * `isSuppressedOptionSelectedAttribute`) and re-emitted here as the fallback
 * branch. Without that, a stale `selected` would survive next to the match.
 */
function emitOwnSelectedFallbackCode(node: Extract<JsxNodeIr, { kind: "element" }>): string {
  const selectedAttr = node.attributes.find(
    (attr) => attr.kind !== "spread-attr" && attr.name === "selected",
  );
  if (selectedAttr === undefined || selectedAttr.kind === "spread-attr") {
    return '""';
  }
  if (selectedAttr.kind === "static-attr") {
    return stringLiteral(' selected=""');
  }
  if (selectedAttr.kind !== "dynamic-attr") {
    return '""';
  }

  return `((_own) => _own == null || _own === false ? "" : ${stringLiteral(' selected=""')})(${selectedAttr.code})`;
}

/**
 * True while an `<option>`'s own `selected` attribute is folded into the
 * selection expression emitted by `collectOptionSelectedAttributePart`.
 */
function isSuppressedOptionSelectedAttribute(tagName: string, attributeName: string): boolean {
  return (
    tagName === "option" && attributeName === "selected" && currentSelectedValueCode !== undefined
  );
}

function findOptionValueCode(node: Extract<JsxNodeIr, { kind: "element" }>): string | undefined {
  const valueAttr = node.attributes.find(
    (attr) => attr.kind !== "spread-attr" && attr.name === "value",
  );
  if (valueAttr !== undefined && valueAttr.kind !== "event" && valueAttr.kind !== "spread-attr") {
    return valueAttr.kind === "static-attr"
      ? stringLiteral(valueAttr.value)
      : `(${valueAttr.code})`;
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

function emitTextSeparatedSimpleChildrenExpression(
  children: readonly JsxNodeIr[],
  escapeHelperName: string,
  escapeBatchHelperName: string | undefined,
): string | undefined {
  if (children.length < 2) {
    return undefined;
  }

  const dynamicChildren = children.filter(
    (child) =>
      child.kind === "expr" &&
      child.renderMode !== "html" &&
      child.renderMode !== "react-node" &&
      child.renderMode !== "compat-child",
  ) as Array<Extract<JsxNodeIr, { kind: "expr" }>>;

  if (
    children.some(
      (child) =>
        child.kind !== "text" &&
        !(
          child.kind === "expr" &&
          child.renderMode !== "html" &&
          child.renderMode !== "react-node" &&
          child.renderMode !== "compat-child"
        ),
    )
  ) {
    return undefined;
  }

  const useBatch =
    escapeBatchHelperName !== undefined &&
    dynamicChildren.length >= 2 &&
    dynamicChildren.every((child) => child.renderMode !== "server-render-value");
  const values = dynamicChildren.map((child) => child.code);
  let dynamicIndex = 0;
  const pieces = children.map((child) => {
    if (child.kind === "text") {
      return stringLiteral(escapeHtml(child.value));
    }

    const index = dynamicIndex;
    dynamicIndex += 1;
    const expressionChild = child as Extract<JsxNodeIr, { kind: "expr" }>;

    return useBatch
      ? `_escaped[${index}]`
      : expressionChild.renderMode === "server-render-value"
        ? `${currentRenderServerValueHelperName}(${expressionChild.code})`
        : `${escapeHelperName}(${expressionChild.code})`;
  });
  const appendStatements = pieces.map(
    (piece) =>
      `{ const _text = ${piece}; if (_text !== "") { if (_hasText) _textOut += "<!-- -->"; _textOut += _text; _hasText = true; } }`,
  );
  const batchStatement = useBatch
    ? `const _escaped = ${escapeBatchHelperName}([${values.join(", ")}]); `
    : "";

  return `(() => { ${batchStatement}let _textOut = ""; let _hasText = false; ${appendStatements.join(" ")} return _textOut; })()`;
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
    return '""';
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
  const itemPattern =
    node.parameterPatterns === undefined ? node.itemName : node.parameterPatterns[0];
  const itemBinding = itemPattern === undefined ? "" : `const ${itemPattern} = _arr[_i];`;
  const indexPattern = node.parameterPatterns?.[1] ?? node.indexName;
  const arrayPattern = node.parameterPatterns?.[2] ?? node.arrayName;
  const indexBinding = indexPattern === undefined ? "" : ` const ${indexPattern} = _i;`;
  const arrayBinding = arrayPattern === undefined ? "" : ` const ${arrayPattern} = _arr;`;
  const bodyStatements =
    node.bodyStatements === undefined || node.bodyStatements.length === 0
      ? ""
      : ` ${node.bodyStatements.join(" ")}`;

  return `(() => { let _o = ""; const _arr = (${node.itemsCode}); for (let _i = 0, _len = _arr.length; _i < _len; _i++) { ${itemBinding}${indexBinding}${arrayBinding}${bodyStatements} _o += ${valueExpression}; } return _o; })()`;
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
  const asyncKeyword = containsAsyncServerOperationInChildren(node.children, asyncComponentNames)
    ? "async "
    : "";

  if (node.bodyStatements === undefined || node.bodyStatements.length === 0) {
    return `${asyncKeyword}(${parameters}) => ${valueExpression}`;
  }

  return `${asyncKeyword}(${parameters}) => {\n${node.bodyStatements.map((statement) => `    ${statement}`).join("\n")}\n    return ${valueExpression};\n  }`;
}

function emitListParameters(node: Extract<JsxNodeIr, { kind: "list" }>): string {
  if (node.parameterPatterns !== undefined) {
    return node.parameterPatterns.join(", ");
  }

  return [node.itemName, node.indexName, node.arrayName]
    .filter((name): name is string => name !== undefined)
    .join(", ");
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
  componentName?: string,
  childrenExpressionOverride?: string,
): string {
  const entries = props.map((prop) => {
    if (prop.kind === "spread-prop") {
      const code =
        prop.serverRenderValuePlaceholder === undefined
          ? prop.code
          : prop.code.replaceAll(
              prop.serverRenderValuePlaceholder,
              currentMarkServerRenderValueHelperName,
            );
      return `...(${code})`;
    }

    if (prop.kind === "render-prop") {
      return `${emitPropName(prop.name)}: ${currentMarkServerRenderValueHelperName}(${emitHtmlExpressionFromChildren(prop.children, escapeHelperName, escapeBatchHelperName, asyncComponentNames, dynamicAttributes, contextProviderHelperName, contextConsumerHelperName, reactNodeRenderHelperName)})`;
    }

    const code =
      prop.serverRenderValuePlaceholder !== undefined
        ? prop.code.replaceAll(
            prop.serverRenderValuePlaceholder,
            currentMarkServerRenderValueHelperName,
          )
        : prop.code;
    return `${emitPropName(prop.name)}: (${code})`;
  });

  if (children.length > 0) {
    const childrenExpression =
      childrenExpressionOverride ??
      emitHtmlExpressionFromChildren(
        children,
        escapeHelperName,
        escapeBatchHelperName,
        asyncComponentNames,
        dynamicAttributes,
        contextProviderHelperName,
        contextConsumerHelperName,
        reactNodeRenderHelperName,
      );
    entries.push(
      `children: ${isRouterLinkComponentName(componentName) ? `${componentName}.trustedHtml(${childrenExpression})` : childrenExpression}`,
    );
  }

  return `{ ${entries.join(", ")} }`;
}

function isRouterLinkComponentName(name: string | undefined): name is string {
  return name !== undefined && (name === "Link" || name.endsWith(".Link"));
}

function emitCompatRuntimePropsObject(
  props: ComponentPropIr[],
  children: JsxNodeIr[] = [],
): string {
  const entries = props.map((prop) => {
    if (prop.kind === "spread-prop") {
      const code =
        prop.serverRenderValuePlaceholder === undefined
          ? prop.code
          : prop.code.replaceAll(
              prop.serverRenderValuePlaceholder,
              currentMarkServerRenderValueHelperName,
            );
      return `...(${code})`;
    }

    if (prop.kind === "render-prop") {
      return `${emitPropName(prop.name)}: ${emitOxcCompatObjectChildren(prop.children)}`;
    }

    return `${emitPropName(prop.name)}: (${prop.code})`;
  });

  if (children.length > 0) {
    entries.push(`children: ${emitOxcCompatObjectChildren(children)}`);
  }

  return `{ ${entries.join(", ")} }`;
}

function emitComponentCallExpression(
  name: string,
  propsCode: string,
  asyncComponentNames: ReadonlySet<string>,
): string {
  const call = `${name}(${propsCode})`;
  return emitRenderableHtmlExpression(asyncComponentNames.has(name) ? `(await ${call})` : call);
}

function emitRenderableHtmlExpression(code: string): string {
  return `((_value) => _value == null || typeof _value === "boolean" ? "" : _value)(${code})`;
}

function isClientBoundaryPlaceholder(node: Extract<JsxNodeIr, { kind: "component" }>): boolean {
  return node.clientReference !== undefined;
}

function shouldRenderClientBoundaryFallback(
  node: Extract<JsxNodeIr, { kind: "component" }>,
): boolean {
  return node.clientReference?.ssrFallback === true;
}

function clientBoundaryPlaceholder(node: Extract<JsxNodeIr, { kind: "component" }>): string {
  return `<!--mreact-client-boundary:${escapeHtml(node.name)}-->`;
}

function collectAsyncServerComponentNames(components: readonly ComponentIr[]): Set<string> {
  const names = new Set(
    components.filter((component) => component.async === true).map((component) => component.name),
  );

  let changed = true;

  while (changed) {
    changed = false;

    for (const component of components) {
      if (!names.has(component.name) && containsAsyncServerOperation(component.root, names)) {
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

function allocateNestedBindingSafeName(ir: ModuleIr, baseName: string): string {
  const serializedIr = JSON.stringify(ir);
  let name = allocateHelperName(ir, baseName);
  let index = name === baseName ? 1 : Number(name.slice(baseName.length + 1)) + 1;

  while (
    new RegExp(`(?<![A-Za-z0-9_$])${name.replaceAll("$", "\\$")}(?![A-Za-z0-9_$])`).test(
      serializedIr,
    )
  ) {
    name = allocateHelperName(ir, `${baseName}$${index}`);
    index += 1;
  }

  return name;
}

function allocateHelperFamilyName(
  ir: ModuleIr,
  baseName: string,
  suffixes: readonly string[],
): string {
  const serializedIr = JSON.stringify(ir);
  let index = 0;

  while (true) {
    const candidate = index === 0 ? baseName : `${baseName}$${index}`;
    const names = [candidate, ...suffixes.map((suffix) => `${candidate}${suffix}`)];

    if (
      names.every(
        (name) =>
          !new RegExp(
            `(?<![A-Za-z0-9_$])${name.replaceAll("$", "\\$")}(?![A-Za-z0-9_$])`,
          ).test(serializedIr),
      )
    ) {
      return candidate;
    }

    index += 1;
  }
}

function emitServerRenderValueHelpers(
  isHelperName: string,
  readHelperName: string,
  containsHelperName: string,
  renderHelperName: string,
  escapeHelperName: string,
): string {
  return [
    `function ${containsHelperName}(value) {`,
    `  const pending = [value];`,
    `  const seen = new Set();`,
    `  while (pending.length > 0) {`,
    `    const current = pending.pop();`,
    `    if (${isHelperName}(current)) return true;`,
    `    if ((typeof current !== "object" && typeof current !== "function") || current === null) continue;`,
    `    if (seen.has(current)) continue;`,
    `    seen.add(current);`,
    `    if (Array.isArray(current)) {`,
    `      try {`,
    `        for (let index = 0; index < current.length; index += 1) pending.push(current[index]);`,
    `      } catch { return true; }`,
    `      continue;`,
    `    }`,
    `    let descriptors;`,
    `    try { descriptors = Object.getOwnPropertyDescriptors(current); } catch { return true; }`,
    `    for (const descriptor of Object.values(descriptors)) {`,
    `      if ("value" in descriptor) pending.push(descriptor.value);`,
    `    }`,
    `  }`,
    `  return false;`,
    `}`,
    `function ${renderHelperName}(value, depth = 0) {`,
    `  if (depth > 256) throw new Error("mreact render value is too deep: exceeded 256 levels");`,
    `  if (value == null || typeof value === "boolean") return "";`,
    `  if (Array.isArray(value)) {`,
    `    let rendered = "";`,
    `    for (let index = 0; index < value.length; index += 1) {`,
    `      rendered += ${renderHelperName}(value[index], depth + 1);`,
    `    }`,
    `    return rendered;`,
    `  }`,
    `  return ${isHelperName}(value)`,
    `    ? String(${readHelperName}(value))`,
    `    : ${escapeHelperName}(value);`,
    `}`,
  ].join("\n");
}

function usesContextProvider(ir: ModuleIr): boolean {
  return ir.components.some((component) => containsContextProvider(component.root));
}

function usesContextConsumer(ir: ModuleIr): boolean {
  return ir.components.some((component) => containsContextConsumer(component.root));
}

function usesReactNodeRender(ir: ModuleIr): boolean {
  return ir.components.some(
    (component) =>
      containsReactNodeRender(component.root) ||
      component.bodyStatements.some((statement) =>
        statement.includes(oxcServerStringReactNodeRenderHelperPlaceholder),
      ),
  );
}

function replaceOxcServerStringReactNodeRenderHelper(
  code: string,
  helperName: string | undefined,
): string {
  return helperName === undefined
    ? code
    : code.replaceAll(oxcServerStringReactNodeRenderHelperPlaceholder, helperName);
}

function usesClientBoundary(ir: ModuleIr): boolean {
  return ir.components.some((component) => containsClientBoundary(component.root));
}

function usesCompatChildRender(ir: ModuleIr): boolean {
  return ir.components.some((component) => containsCompatChildRender(component.root));
}

function containsCompatChildRender(node: JsxNodeIr): boolean {
  if (node.kind === "expr") {
    return node.renderMode === "compat-child";
  }

  if (node.kind === "conditional") {
    return [...node.whenTrue, ...node.whenFalse].some(containsCompatChildRender);
  }

  if (node.kind === "list" || node.kind === "element" || node.kind === "fragment") {
    return node.children.some(containsCompatChildRender);
  }

  if (node.kind === "async-boundary") {
    return [
      ...node.children,
      ...(node.placeholderChildren ?? []),
      ...(node.catchChildren ?? []),
    ].some(containsCompatChildRender);
  }

  if (node.kind === "component") {
    return node.children.some(containsCompatChildRender);
  }

  return false;
}

function emitClientBoundaryHelper(name: string, isServerRenderValueHelperName?: string): string {
  const propsHelperName = `${name}$hasNonSerializableProps`;
  const markChildrenHelperName = `${name}$markChildren`;

  return [
    `function ${propsHelperName}(value) {`,
    `  const pending = [value];`,
    `  const seen = new Set();`,
    `  while (pending.length > 0) {`,
    `    const current = pending.pop();`,
    ...(isServerRenderValueHelperName === undefined
      ? []
      : [`    if (${isServerRenderValueHelperName}(current)) return true;`]),
    `    if (typeof current === "function" || typeof current === "symbol" || typeof current === "bigint") return true;`,
    `    if (current === null || typeof current !== "object") continue;`,
    `    if (seen.has(current)) continue;`,
    `    seen.add(current);`,
    `    if (Array.isArray(current)) {`,
    `      try {`,
    `        for (let index = 0; index < current.length; index += 1) pending.push(current[index]);`,
    `      } catch { return true; }`,
    `      continue;`,
    `    }`,
    `    let descriptors;`,
    `    try { descriptors = Object.getOwnPropertyDescriptors(current); } catch { return true; }`,
    `    for (const descriptor of Object.values(descriptors)) {`,
    `      if (descriptor.enumerable !== true) continue;`,
    `      if (!("value" in descriptor)) return true;`,
    `      pending.push(descriptor.value);`,
    `    }`,
    `  }`,
    `  return false;`,
    `}`,
    `function ${markChildrenHelperName}(fallbackHtml, childrenHtml, startMarker, endMarker) {`,
    `  if (childrenHtml === "") return undefined;`,
    `  const _start = fallbackHtml.indexOf(childrenHtml);`,
    `  if (_start === -1 || fallbackHtml.indexOf(childrenHtml, _start + childrenHtml.length) !== -1) return undefined;`,
    `  const _end = _start + childrenHtml.length;`,
    `  const _opening = /<([a-z][a-z0-9:-]*)(?:\\s[^<>]*)?>$/i.exec(fallbackHtml.slice(0, _start));`,
    `  const _closing = /^<\\/([a-z][a-z0-9:-]*)\\s*>/i.exec(fallbackHtml.slice(_end));`,
    `  if (_opening === null || _closing === null || _opening[1].toLowerCase() !== _closing[1].toLowerCase()) return undefined;`,
    `  if (["iframe", "noembed", "noframes", "noscript", "plaintext", "script", "style", "template", "textarea", "title", "xmp"].includes(_opening[1].toLowerCase())) return undefined;`,
    `  return fallbackHtml.slice(0, _start) + startMarker + childrenHtml + endMarker + fallbackHtml.slice(_end);`,
    `}`,
    `function ${name}(name, props, fallbackHtml = "", componentFallback = false, originalChildrenHtml = "", hasOriginalChildren = false) {`,
    `  const _name = String(name);`,
    `  const _escapedName = _name.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");`,
    `  const _props = props ?? {};`,
    `  let _nonSerializable = ${propsHelperName}(_props);`,
    `  const _componentFallbackAttr = componentFallback ? ' data-mreact-client-boundary-fallback="component"' : "";`,
    `  const _startMarker = "<!--mreact-client-boundary-children-start-->";`,
    `  const _endMarker = "<!--mreact-client-boundary-children-end-->";`,
    `  const _fallbackHtml = String(componentFallback && typeof fallbackHtml === "function" ? fallbackHtml(originalChildrenHtml) : fallbackHtml);`,
    `  const _markedFallbackHtml = componentFallback ? ${markChildrenHelperName}(_fallbackHtml, originalChildrenHtml, _startMarker, _endMarker) : undefined;`,
    `  const childrenHtml = _markedFallbackHtml ?? _fallbackHtml;`,
    `  const _childrenArchive = componentFallback && hasOriginalChildren && _markedFallbackHtml === undefined ? '<template data-mreact-client-boundary-children="' + _escapedName + '">' + _startMarker + originalChildrenHtml + _endMarker + '</template>' : "";`,
    `  let _jsonValue = "{}";`,
    `  if (!_nonSerializable) { try { _jsonValue = JSON.stringify(_props) ?? "{}"; } catch { _nonSerializable = true; _jsonValue = "{}"; } }`,
    `  const _nonSerializableAttr = _nonSerializable ? ' data-mreact-client-boundary-nonserializable="true"' : "";`,
    `  const _json = _jsonValue`,
    `    .replaceAll("&", "\\\\u0026")`,
    `    .replaceAll("<", "\\\\u003c")`,
    `    .replaceAll(">", "\\\\u003e")`,
    `    .replaceAll("\\u2028", "\\\\u2028")`,
    `    .replaceAll("\\u2029", "\\\\u2029");`,
    `  return \`<template data-mreact-client-boundary="\${_escapedName}"\${_nonSerializableAttr}\${_componentFallbackAttr}></template>\${childrenHtml}\${_childrenArchive}<script type="application/json" data-mreact-client-boundary-props="\${_escapedName}">\${_json}</script>\`;`,
    `}`,
  ].join("\n");
}

function emitSpreadAttributesHelper(
  name: string,
  escapeHelperName: string,
  urlSafeHelperName: string,
  isServerRenderValueHelperName?: string,
): string {
  const aliases = JSON.stringify({
    acceptCharset: "accept-charset",
    autoFocus: "autofocus",
    autoPlay: "autoplay",
    charSet: "charset",
    className: "class",
    colSpan: "colspan",
    contentEditable: "contenteditable",
    crossOrigin: "crossorigin",
    encType: "enctype",
    formAction: "formaction",
    frameBorder: "frameborder",
    htmlFor: "for",
    httpEquiv: "http-equiv",
    maxLength: "maxlength",
    minLength: "minlength",
    noValidate: "novalidate",
    playsInline: "playsinline",
    readOnly: "readonly",
    rowSpan: "rowspan",
    spellCheck: "spellcheck",
    imageSrcSet: "imagesrcset",
    srcDoc: "srcdoc",
    srcSet: "srcset",
    tabIndex: "tabindex",
    useMap: "usemap",
  });
  const urlAttributes = JSON.stringify([
    "href",
    "src",
    "action",
    "formaction",
    "xlink:href",
    "ping",
    "poster",
    "background",
    "manifest",
    "data",
    "codebase",
    "srcset",
    "imagesrcset",
  ]);
  const dangerousAttributes = JSON.stringify(["srcdoc"]);

  return [
    `const ${name}$aliases = ${aliases};`,
    `const ${name}$urlAttributes = new Set(${urlAttributes});`,
    `const ${name}$dangerousAttributes = new Set(${dangerousAttributes});`,
    `function ${name}$html(value) {`,
    `  try {`,
    `    if (typeof value !== "object" || value === null) return undefined;`,
    `    const _descriptor = Object.getOwnPropertyDescriptor(value, "__html");`,
    `    return _descriptor !== undefined && "value" in _descriptor && typeof _descriptor.value === "string" ? _descriptor.value : undefined;`,
    `  } catch { return undefined; }`,
    `}`,
    `function ${name}$assign(target, source) {`,
    `  for (const _rawName of Object.keys(source)) {`,
    `    if (_rawName === "key" || _rawName === "ref" || _rawName === "domRef" || _rawName === "children" || /^on/i.test(_rawName)) continue;`,
    `    if (_rawName === "__proto__") Object.defineProperty(target, _rawName, { configurable: true, enumerable: true, value: source[_rawName], writable: true });`,
    `    else target[_rawName] = source[_rawName];`,
    `  }`,
    `}`,
    `function ${name}$style(value) {`,
    `  if (value == null || value === false) return "";`,
    `  if (typeof value === "string") return value;`,
    `  let _style = "";`,
    `  for (const _styleName of Object.keys(value)) {`,
    `    const _styleValue = value[_styleName];`,
    `    if (_styleValue == null || _styleValue === false) continue;`,
    `    const _cssName = String(_styleName).startsWith("--") ? String(_styleName) : String(_styleName).replace(/[A-Z]/g, (_char) => "-" + _char.toLowerCase());`,
    `    _style += (_style === "" ? "" : ";") + _cssName + ":" + (_styleValue === true ? "" : String(_styleValue));`,
    `  }`,
    `  return _style;`,
    `}`,
    `function ${name}(tagName, props) {`,
    `  if (props == null || props === false) return "";`,
    `  let _out = "";`,
    `  for (const _rawName of Object.keys(props)) {`,
    `    if (_rawName === "key" || _rawName === "ref" || _rawName === "domRef" || _rawName === "children" || _rawName === "dangerouslySetInnerHTML") continue;`,
    `    if (/^on/i.test(_rawName)) continue;`,
    `    let _value = props[_rawName];`,
    `    if (_value == null) continue;`,
    ...(isServerRenderValueHelperName === undefined
      ? []
      : [`    if (${isServerRenderValueHelperName}(_value)) continue;`]),
    `    let _name = tagName === "input" && _rawName === "defaultValue" ? "value" : tagName === "input" && _rawName === "defaultChecked" ? "checked" : (Object.hasOwn(${name}$aliases, _rawName) ? ${name}$aliases[_rawName] : _rawName);`,
    `    if (!/^[A-Za-z_:][A-Za-z0-9:_.-]*$/.test(_name)) continue;`,
    `    const _lowerName = _name.toLowerCase();`,
    `    const _booleanish = _lowerName.startsWith("aria-") || _lowerName.startsWith("data-") || _lowerName === "autocapitalize" || _lowerName === "contenteditable" || _lowerName === "draggable" || _lowerName === "spellcheck" || _lowerName === "translate";`,
    `    if (_value === false && !_booleanish) continue;`,
    `    if (_name === "style") {`,
    `      const _style = ${name}$style(_value);`,
    `      if (_style !== "") _out += " style=\\"" + ${escapeHelperName}(_style) + "\\"";`,
    `      continue;`,
    `    }`,
    `    if (${name}$dangerousAttributes.has(_lowerName)) {`,
    `      const _html = ${name}$html(_value);`,
    `      if (_html !== undefined) {`,
    `        _out += " " + _name + "=\\"" + ${escapeHelperName}(_html) + "\\"";`,
    `      }`,
    `      continue;`,
    `    }`,
    `    if (${name}$urlAttributes.has(_lowerName)) {`,
    `      _value = ${urlSafeHelperName}(_name, _value === true ? "" : _value);`,
    `      if (_value === undefined) continue;`,
    `    }`,
    `    _out += " " + _name + "=\\"" + ${escapeHelperName}(_value === true && !_booleanish ? "" : _value) + "\\"";`,
    `  }`,
    `  return _out;`,
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
