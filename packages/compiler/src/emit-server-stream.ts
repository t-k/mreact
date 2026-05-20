import type {
  AsyncBoundaryIr,
  AttributeIr,
  ComponentPropIr,
  ComponentIr,
  JsxNodeIr,
  ModuleIr,
} from "./ir.js";
import type { RuntimeImport, ServerBootstrapMode, ServerEscapeOptions } from "./types.js";
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

let currentUrlSafeHelperName: string = "_urlAttrSafe";
let currentClientBoundaryHelperName: string | undefined;
let currentStreamNodeHelperName: string = "_renderStreamNode";
let currentAsyncBoundaryHelperName: string = "_renderAsyncBoundary";
let currentOutOfOrderBoundaryHelperName: string = "_renderOutOfOrderBoundary";
let currentReactSuspenseBoundaryHelperName: string = "_renderReactSuspenseBoundary";
let currentReactSuspenseOutOfOrderBoundaryHelperName: string =
  "_renderReactSuspenseOutOfOrderBoundary";
let currentCompatRenderToStringHelperName: string = "_renderCompatToString";
let currentPropChildrenCollectState: CollectHtmlState | undefined;

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
  const streamNodeHelperName = allocateHelperName(ir, "_renderStreamNode");
  const clientBoundaryHelperName = usesClientBoundary(ir)
    ? allocateHelperName(ir, "_renderClientBoundary")
    : undefined;
  const urlSafeHelperName = allocateHelperName(ir, "_urlAttrSafe");
  currentUrlSafeHelperName = urlSafeHelperName;
  currentClientBoundaryHelperName = clientBoundaryHelperName;
  currentStreamNodeHelperName = streamNodeHelperName;
  currentAsyncBoundaryHelperName = asyncBoundaryHelperName;
  currentOutOfOrderBoundaryHelperName = outOfOrderBoundaryHelperName;
  currentReactSuspenseBoundaryHelperName = reactSuspenseBoundaryHelperName;
  currentReactSuspenseOutOfOrderBoundaryHelperName = reactSuspenseOutOfOrderBoundaryHelperName;
  currentCompatRenderToStringHelperName = compatRenderToStringHelperName;
  const helper = emitEscapeHtmlHelper(escapeHelperName);
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
  // Emit batch escape import only when the helper is actually referenced
  // (issue 048: dead-import elimination).
  const escapeImport =
    options.escape === undefined ||
    escapeBatchHelperName === undefined ||
    !components.includes(escapeBatchHelperName)
      ? ""
      : `import { ${options.escape.batchImportName} as ${escapeBatchHelperName} } from ${stringLiteral(options.escape.batchImportSource)};`;
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
  const urlSafeBlock = components.includes(urlSafeHelperName) ? `\n\n${urlSafeHelper}` : "";
  const clientBoundaryBlock =
    clientBoundaryHelperName === undefined || !components.includes(clientBoundaryHelperName)
      ? ""
      : `\n\n${emitClientBoundaryHelper(clientBoundaryHelperName)}`;
  const streamNodeBlock = components.includes(streamNodeHelperName)
    ? `\n\n${emitStreamNodeHelper(streamNodeHelperName)}`
    : "";

  return {
    code: `${importsBlock === "" ? "" : `${importsBlock}\n\n`}${helper}${urlSafeBlock}${clientBoundaryBlock}${streamNodeBlock}\n\n${components}\n`,
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
      source: "@reckona/mreact-server",
      specifiers: serverSpecifiers,
    });
  }

  if (hasCompatComponentReference(ir) || hasReactNodeRender(ir)) {
    imports.push({
      source: "@reckona/mreact-compat",
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

function usesClientBoundary(ir: ModuleIr): boolean {
  return ir.components.some((component) => containsClientBoundary(component.root));
}

function emitClientBoundaryHelper(name: string): string {
  return [
    `function ${name}(name, props) {`,
    `  const _name = String(name);`,
    `  const _escapedName = _name.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");`,
    `  const _json = (JSON.stringify(props ?? {}) ?? "{}").replaceAll("<", "\\\\u003c");`,
    `  return \`<template data-mreact-client-boundary="\${_escapedName}"></template><script type="application/json" data-mreact-client-boundary-props="\${_escapedName}">\${_json}</script>\`;`,
    `}`,
  ].join("\n");
}

function emitStreamNodeHelper(name: string): string {
  return [
    `async function ${name}($sink, value, escapeHtml) {`,
    `  if (value == null || value === false) return;`,
    `  if (typeof value === "function") { await value($sink); return; }`,
    `  if (Array.isArray(value)) { for (const item of value) await ${name}($sink, item, escapeHtml); return; }`,
    `  if (typeof value === "string") { $sink.append(value); return; }`,
    `  $sink.append(escapeHtml(value === true ? "" : value));`,
    `}`,
  ].join("\n");
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
  const collectState: CollectHtmlState = {
    dynamicAttributes,
    ...(escapeBatchHelperName === undefined ? {} : { escapeBatchHelperName }),
    hydration,
    awaitHydration,
    nextFragmentId: 0,
    ...(reactSuspenseRevealScriptNonce === undefined ? {} : { reactSuspenseRevealScriptNonce }),
    ...(reactSuspenseRevealScriptSrc === undefined ? {} : { reactSuspenseRevealScriptSrc }),
  };
  const collected = collectHtmlParts(
    node,
    escapeHelperName,
    asyncBoundaryHelperName,
    outOfOrderBoundaryHelperName,
    reactSuspenseBoundaryHelperName,
    reactSuspenseOutOfOrderBoundaryHelperName,
    collectState,
  );
  const previousPropChildrenCollectState = currentPropChildrenCollectState;
  currentPropChildrenCollectState = collectState;
  try {
    return coalesceAdjacentStaticParts(collected).map((part) => {
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

      if (part.kind === "stream-node") {
        return `  await ${currentStreamNodeHelperName}(${sinkName}, (${part.code}), ${part.escapeHelperName});`;
      }

      if (part.kind === "list") {
        return emitListPart(part, sinkName, compatRenderToStringHelperName, "  ");
      }

      const expression =
        part.kind === "static"
          ? stringLiteral(part.value)
          : part.kind === "dynamic"
            ? `${escapeHelperName}(${part.code})`
            : part.code;

      return `  ${sinkName}.append(${expression});`;
    });
  } finally {
    currentPropChildrenCollectState = previousPropChildrenCollectState;
  }
}

function isHtmlSyncPart(part: HtmlPart): part is HtmlSyncPart {
  return (
    part.kind !== "async-boundary" &&
    part.kind !== "out-of-order-boundary" &&
    part.kind !== "react-suspense-boundary" &&
    part.kind !== "react-suspense-out-of-order-boundary"
  );
}

// Issue 085: collapse runs of adjacent `static` parts into a single
// `static` part. Each part becomes one `sink.append(...)` call at emit
// time and `sink.append` goes through 2-3 function frames, so merging
// `["<span", ">"]` into `"<span>"` halves the per-iteration call count
// for tag-heavy lists.
//
// Only adjacent static-kind parts are merged; dynamic / boundary /
// component / list / react-node parts stay where they are.
function coalesceAdjacentStaticParts<T extends HtmlPart>(parts: T[]): T[] {
  if (parts.length < 2) return parts;
  const result: T[] = [];
  let pending: { kind: "static"; value: string } | undefined;
  for (const part of parts) {
    if (part.kind === "static") {
      pending =
        pending === undefined
          ? { kind: "static", value: part.value }
          : { kind: "static", value: pending.value + part.value };
      continue;
    }
    if (pending !== undefined) {
      result.push(pending as T);
      pending = undefined;
    }
    result.push(part);
  }
  if (pending !== undefined) {
    result.push(pending as T);
  }
  return result;
}

function emitSyncPartAsAppendStatement(
  part: HtmlSyncPart,
  sinkName: string,
  compatRenderToStringHelperName: string,
  indent: string,
): string {
  if (part.kind === "component") {
    if (part.runtime === "compat") {
      return emitCompatComponentAppendStatements(
        part,
        sinkName,
        compatRenderToStringHelperName,
        indent,
      );
    }

    return `${indent}await ${part.name}(${sinkName}, ${emitPropsObject(part.props, part.children, part.escapeHelperName)});`;
  }

  if (part.kind === "react-node") {
    return `${indent}${sinkName}.append(${compatRenderToStringHelperName}(() => (${part.code})));`;
  }

  if (part.kind === "stream-node") {
    return `${indent}await ${currentStreamNodeHelperName}(${sinkName}, (${part.code}), ${part.escapeHelperName});`;
  }

  if (part.kind === "list") {
    return emitListPart(part, sinkName, compatRenderToStringHelperName, indent);
  }

  const expression =
    part.kind === "static"
      ? stringLiteral(part.value)
      : part.kind === "dynamic"
        ? `${part.escapeHelperName}(${part.code})`
        : part.code;

  return `${indent}${sinkName}.append(${expression});`;
}

function emitListPart(
  part: Extract<HtmlPart, { kind: "list" }>,
  sinkName: string,
  compatRenderToStringHelperName: string,
  indent: string,
): string {
  const innerIndent = indent + "    ";
  const itemBinding = `${innerIndent}const ${part.itemName} = _arr[_i];`;
  const indexBinding =
    part.indexName === undefined ? undefined : `${innerIndent}const ${part.indexName} = _i;`;
  const bodyLines = part.bodyStatements.map(
    (statement) => `${innerIndent}${statement}`,
  );
  const coalescedParts = coalesceAdjacentStaticParts(part.parts);

  // Issue 085 follow-up: if every child part can be expressed as a
  // pure string expression (no `sink.append`/`await` required), build
  // up a local ConsString accumulator and emit a single
  // `sink.append(_listOut)` at the end of the iteration. This matches
  // the string backend's `_out +=` pattern, which V8 turns into a
  // shallow cons-string tree (~3 ns per append). Otherwise (the list
  // contains components / nested lists with components / etc) fall
  // back to per-part `sink.append` inside the loop.
  const stringExpressions = coalescedParts.map((child) =>
    tryEmitPartAsStringExpression(child, compatRenderToStringHelperName),
  );
  const allStringSafe = stringExpressions.every((expr) => expr !== undefined);

  if (allStringSafe) {
    const accumulatorName = "_listOut";
    const concatLines = stringExpressions.map(
      (expr) => `${innerIndent}${accumulatorName} += ${expr};`,
    );
    return [
      `${indent}{`,
      `${indent}  const _arr = (${part.itemsCode});`,
      `${indent}  let ${accumulatorName} = "";`,
      `${indent}  for (let _i = 0, _len = _arr.length; _i < _len; _i++) {`,
      itemBinding,
      ...(indexBinding === undefined ? [] : [indexBinding]),
      ...bodyLines,
      ...concatLines,
      `${indent}  }`,
      `${indent}  ${sinkName}.append(${accumulatorName});`,
      `${indent}}`,
    ].join("\n");
  }

  const childLines = coalescedParts.map((child) =>
    emitSyncPartAsAppendStatement(child, sinkName, compatRenderToStringHelperName, innerIndent),
  );

  return [
    `${indent}{`,
    `${indent}  const _arr = (${part.itemsCode});`,
    `${indent}  for (let _i = 0, _len = _arr.length; _i < _len; _i++) {`,
    itemBinding,
    ...(indexBinding === undefined ? [] : [indexBinding]),
    ...bodyLines,
    ...childLines,
    `${indent}  }`,
    `${indent}}`,
  ].join("\n");
}

// Returns a string-typed expression for `part` if it can be evaluated
// synchronously without writing to the sink, otherwise undefined.
// Used by `emitListPart` to choose between the cons-string accumulator
// path and the per-part `sink.append` path.
function tryEmitPartAsStringExpression(
  part: HtmlSyncPart,
  compatRenderToStringHelperName: string,
): string | undefined {
  if (part.kind === "static") return stringLiteral(part.value);
  if (part.kind === "dynamic") return `${part.escapeHelperName}(${part.code})`;
  if (part.kind === "raw-dynamic") return `(${part.code})`;
  if (part.kind === "react-node") {
    return `${compatRenderToStringHelperName}(() => (${part.code}))`;
  }
  if (part.kind === "stream-node") {
    return undefined;
  }
  if (part.kind === "list") {
    return emitListPartAsStringExpression(part, compatRenderToStringHelperName);
  }
  if (part.kind === "component" && part.runtime === "compat") {
    const rendered = `${compatRenderToStringHelperName}(${part.name}, ${emitPropsObject(part.props, part.children, part.escapeHelperName)})`;
    if (part.hydrationId === undefined) {
      return rendered;
    }

    return `${stringLiteral(`<!--mreact-h:start:${encodeURIComponent(part.hydrationId)}-->`)} + ${rendered} + ${stringLiteral(`<!--mreact-h:end:${encodeURIComponent(part.hydrationId)}-->`)}`;
  }
  // Non-compat component parts require `await sink-write`; lists with
  // sink-needing children also can't collapse. Signal fallback.
  return undefined;
}

function emitListPartAsStringExpression(
  part: Extract<HtmlPart, { kind: "list" }>,
  compatRenderToStringHelperName: string,
): string | undefined {
  const coalescedParts = coalesceAdjacentStaticParts(part.parts);
  const stringExpressions = coalescedParts.map((child) =>
    tryEmitPartAsStringExpression(child, compatRenderToStringHelperName),
  );

  if (stringExpressions.some((expr) => expr === undefined)) {
    return undefined;
  }

  const concatLines = stringExpressions.map((expr) => `_listOut += ${expr};`);
  return `(() => { const _arr = (${part.itemsCode}); let _listOut = ""; for (let _i = 0, _len = _arr.length; _i < _len; _i++) { const ${part.itemName} = _arr[_i];${part.indexName === undefined ? "" : ` const ${part.indexName} = _i;`}${part.bodyStatements.length === 0 ? "" : ` ${part.bodyStatements.join(" ")}`} ${concatLines.join(" ")} } return _listOut; })()`;
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
  const placeholderTagOption =
    part.placeholderTagCode === undefined
      ? ""
      : `,\n  placeholderTag: (${part.placeholderTagCode})`;

  return [
    `  ${outOfOrderBoundaryHelperName}(${sinkName}, ${JSON.stringify(part.id)}, (${part.valueCode}), async (${sinkName}, ${part.valueName}) => {`,
    emitNestedAppendStatements(part.parts, sinkName, compatRenderToStringHelperName),
    `  }, {`,
    ...(part.hydration ? [`  hydration: true,`] : []),
    `  placeholder: (${sinkName}) => {`,
    emitNestedAppendStatements(part.placeholderParts, sinkName, compatRenderToStringHelperName),
    `  }${catchOption}${hydrationAwaitIdOption}${placeholderTagOption}`,
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
  return coalesceAdjacentStaticParts(parts)
    .map((part) => emitSyncPartAsAppendStatement(part, sinkName, compatRenderToStringHelperName, "    "))
    .join("\n");
}

function emitNestedStreamAppendStatements(
  parts: HtmlPart[],
  sinkName: string,
  compatRenderToStringHelperName: string,
): string {
  return coalesceAdjacentStaticParts(parts)
    .map((part) => {
      if (part.kind === "async-boundary") {
        return emitAsyncBoundary(
          part,
          sinkName,
          currentAsyncBoundaryHelperName,
          compatRenderToStringHelperName,
        ).replace(/^/gm, "    ");
      }

      if (part.kind === "out-of-order-boundary") {
        return emitOutOfOrderBoundary(
          part,
          sinkName,
          currentOutOfOrderBoundaryHelperName,
          compatRenderToStringHelperName,
        ).replace(/^/gm, "    ");
      }

      if (part.kind === "react-suspense-boundary") {
        return emitReactSuspenseBoundary(
          part,
          sinkName,
          currentReactSuspenseBoundaryHelperName,
          compatRenderToStringHelperName,
        ).replace(/^/gm, "    ");
      }

      if (part.kind === "react-suspense-out-of-order-boundary") {
        return emitReactSuspenseOutOfOrderBoundary(
          part,
          sinkName,
          currentReactSuspenseOutOfOrderBoundaryHelperName,
          compatRenderToStringHelperName,
        ).replace(/^/gm, "    ");
      }

      return emitSyncPartAsAppendStatement(
        part,
        sinkName,
        compatRenderToStringHelperName,
        "    ",
      );
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
      kind: "stream-node";
      code: string;
      escapeHelperName: string;
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
      placeholderTagCode?: string;
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
    }
  | {
      // Issue 085: sync-list direct streaming. The list iterates
      // `itemsCode`, runs `bodyStatements` and then emits each inner
      // part via `sink.append(...)` per iteration — no intermediate
      // Array, no `.join("")`, no per-element ConsString ladder. Only
      // produced when every collected child part is itself sync; lists
      // that contain async/oob/Suspense boundaries fall back to the
      // older `raw-dynamic` `.map().join("")` shape (which is anyway
      // the only path that ever supported them in this backend).
      kind: "list";
      itemsCode: string;
      itemName: string;
      indexName?: string;
      bodyStatements: string[];
      parts: HtmlSyncPart[];
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
  selectedValueCode?: string;
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
    if (node.renderMode === "html" && isChildrenExpressionCode(node.code)) {
      return [{ kind: "stream-node", code: node.code, escapeHelperName }];
    }

    if (node.renderMode === "html") {
      return [{ kind: "raw-dynamic", code: rawHtmlExpression(node.code) }];
    }

    if (node.renderMode === "react-node") {
      return [{ kind: "react-node", code: node.code }];
    }

    if (node.renderMode === "stream-node") {
      return [{ kind: "stream-node", code: node.code, escapeHelperName }];
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
    // Issue 085: try the direct-sink for-loop path first. We can only
    // take it when every collected child part is sync (no
    // async-boundary / out-of-order / react-suspense inside the
    // list renderer). That matches the previous behaviour: the
    // `.map().join("")` fallback never supported those either —
    // boundaries cannot be embedded inside a synchronous string
    // expression — so this is purely a performance change.
    const collectedChildParts: HtmlPart[] = node.children.flatMap((child) =>
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

    if (collectedChildParts.every(isHtmlSyncPart)) {
      return [
        {
          kind: "list",
          itemsCode: node.itemsCode,
          itemName: node.itemName,
          ...(node.indexName === undefined ? {} : { indexName: node.indexName }),
          bodyStatements: node.bodyStatements ?? [],
          parts: collectedChildParts,
        },
      ];
    }

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
          ...(node.placeholderTagCode === undefined
            ? {}
            : { placeholderTagCode: node.placeholderTagCode }),
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

    if (isClientBoundaryPlaceholder(node)) {
      const helperName = currentClientBoundaryHelperName;
      if (helperName !== undefined) {
        return [
          {
            kind: "raw-dynamic",
            code: `${helperName}(${stringLiteral(node.name)}, ${emitPropsObject(
              node.props,
              node.children,
              escapeHelperName,
            )})`,
          },
        ];
      }

      return [{ kind: "static", value: clientBoundaryPlaceholder(node) }];
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
  if (node.tagName === "textarea") {
    const attributeScan = scanElementAttributes(node.tagName, node.attributes);
    return [
      { kind: "static", value: "<textarea" },
      ...collectElementAttributeParts(
        node.tagName,
        node.attributes,
        escapeHelperName,
        state,
        attributeScan,
      ),
      { kind: "static", value: ">" },
      ...collectTextareaValueParts(
        node,
        escapeHelperName,
        asyncBoundaryHelperName,
        outOfOrderBoundaryHelperName,
        reactSuspenseBoundaryHelperName,
        reactSuspenseOutOfOrderBoundaryHelperName,
        state,
        attributeScan,
      ),
      { kind: "static", value: closeTag },
    ];
  }
  const attributeScan = scanElementAttributes(node.tagName, node.attributes);
  const childSelectedValueCode = node.tagName === "select"
    ? attributeScan.formValueAttributeCode
    : undefined;
  const childState = childSelectedValueCode === undefined
    ? state
    : { ...state, selectedValueCode: childSelectedValueCode };
  const selectedAttributePart = collectOptionSelectedAttributePart(node, state.selectedValueCode);

  return [
    { kind: "static", value: `<${node.tagName}` },
    ...collectElementAttributeParts(
      node.tagName,
      node.attributes,
      escapeHelperName,
      state,
      attributeScan,
    ),
    ...(selectedAttributePart === undefined ? [] : [selectedAttributePart]),
    { kind: "static", value: ">" },
    ...((childState.selectedValueCode === undefined
      ? collectBatchedSimpleChildrenParts(node.children, state.escapeBatchHelperName)
      : undefined) ??
      node.children.flatMap((child) =>
        collectHtmlParts(
          child,
          escapeHelperName,
          asyncBoundaryHelperName,
          outOfOrderBoundaryHelperName,
          reactSuspenseBoundaryHelperName,
          reactSuspenseOutOfOrderBoundaryHelperName,
          childState,
        ),
      )),
    { kind: "static", value: closeTag },
  ];
}

function isChildrenExpressionCode(code: string): boolean {
  const trimmed = code.trim();
  return (
    trimmed === "children" ||
    endsWithChildrenMemberAccess(trimmed) ||
    endsWithChildrenStringIndex(trimmed)
  );
}

function endsWithChildrenMemberAccess(code: string): boolean {
  const propertyName = "children";
  if (!code.endsWith(propertyName)) {
    return false;
  }

  return code[code.length - propertyName.length - 1] === ".";
}

function endsWithChildrenStringIndex(code: string): boolean {
  return code.endsWith('["children"]') || code.endsWith("['children']");
}

function collectHtmlAttributeParts(
  tagName: string,
  attr: AttributeIr,
  escapeHelperName: string,
  escapeBatchHelperName: string | undefined,
  dynamicAttributes: "drop" | "emit",
): HtmlSyncPart[] {
  if (attr.kind === "event" || attr.kind === "spread-attr" || attr.name === "key") {
    return [];
  }

  if (attr.kind === "static-attr") {
    const htmlName = htmlAttributeNameForElement(tagName, attr.name);
    if (isUrlAttribute(htmlName) && isStaticUrlValueUnsafe(htmlName, attr.value)) {
      return [];
    }
    if (isDangerousHtmlAttribute(htmlName)) {
      // Issue 077: literal srcdoc strings cannot match the opt-in shape.
      return [];
    }
    return [
      {
        kind: "static",
        value: ` ${htmlName}="${escapeHtml(attr.value)}"`,
      },
    ];
  }

  if (dynamicAttributes === "drop") {
    return [];
  }

  if (attr.name === "style") {
    return [{ kind: "raw-dynamic", code: emitDynamicStyleAttributeExpression(attr.code, escapeHelperName, escapeBatchHelperName) }];
  }

  const dynamicHtmlName = htmlAttributeNameForElement(tagName, attr.name);
  if (isDangerousHtmlAttribute(dynamicHtmlName)) {
    return [
      {
        kind: "raw-dynamic",
        code: `(() => { const _value = (${attr.code}); if (_value == null || _value === false) return ""; if (typeof _value === "object" && _value !== null && typeof _value.__html === "string") return ${stringLiteral(` ${dynamicHtmlName}="`)} + ${escapeHelperName}(_value.__html) + ${stringLiteral("\"")}; return ""; })()`,
      },
    ];
  }

  return [
    {
      kind: "raw-dynamic",
      code: emitDynamicAttributeExpression(dynamicHtmlName, attr.code, escapeHelperName),
    },
  ];
}

function collectElementAttributeParts(
  tagName: string,
  attrs: readonly AttributeIr[],
  escapeHelperName: string,
  state: CollectHtmlState,
  attributeScan = scanElementAttributes(tagName, attrs),
): HtmlSyncPart[] {
  const escapeBatchHelperName = state.escapeBatchHelperName;

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
          state.dynamicAttributes,
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
    return `(() => { const _value = (${code}); if (_value == null || _value === false) return ""; const _checked = ${currentUrlSafeHelperName}(${stringLiteral(name)}, _value === true ? "" : _value); return _checked === undefined ? "" : ${stringLiteral(` ${name}="`)} + ${escapeHelperName}(_checked) + ${stringLiteral("\"")}; })()`;
  }

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

  if (entries.length === 0) {
    return `""`;
  }

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

  const statements = entries.map((entry) =>
    `{ const _v = (${entry.valueCode}); if (_v != null && _v !== false) _style += (_style === "" ? "" : ";") + ${stringLiteral(`${entry.cssName}:`)} + ${escapeHelperName}(_v === true ? "" : _v); }`
  );

  return `(() => { let _style = ""; ${statements.join(" ")} return _style === "" ? "" : ${stringLiteral(" style=\"")} + _style + ${stringLiteral("\"")}; })()`;
}

function collectTextareaValueParts(
  node: Extract<JsxNodeIr, { kind: "element" }>,
  escapeHelperName: string,
  asyncBoundaryHelperName: string,
  outOfOrderBoundaryHelperName: string,
  reactSuspenseBoundaryHelperName: string,
  reactSuspenseOutOfOrderBoundaryHelperName: string,
  state: CollectHtmlState,
  attributeScan = scanElementAttributes(node.tagName, node.attributes),
): HtmlPart[] {
  const valueCode = attributeScan.formValueAttributeCode;
  if (valueCode !== undefined) {
    return [{ kind: "dynamic", code: valueCode, escapeHelperName }];
  }

  return node.children.flatMap((child) =>
    collectHtmlParts(
      child,
      escapeHelperName,
      asyncBoundaryHelperName,
      outOfOrderBoundaryHelperName,
      reactSuspenseBoundaryHelperName,
      reactSuspenseOutOfOrderBoundaryHelperName,
      state,
    )
  );
}

function collectOptionSelectedAttributePart(
  node: Extract<JsxNodeIr, { kind: "element" }>,
  selectedValueCode: string | undefined,
): HtmlSyncPart | undefined {
  if (selectedValueCode === undefined || node.tagName !== "option") {
    return undefined;
  }

  const optionValueCode = findOptionValueCode(node);
  if (optionValueCode === undefined) {
    return undefined;
  }

  return {
    kind: "raw-dynamic",
    code: `(() => { const _selected = (${selectedValueCode}); return _selected == null ? "" : String(_selected) === String(${optionValueCode}) ? ${stringLiteral(' selected=""')} : ""; })()`,
  };
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

    if (part.kind === "list") {
      return emitListPartAsStringExpression(part, "_renderCompatToString") ?? '""';
    }

    if (part.kind === "component") {
      return '""';
    }

    return '""';
  });

  return expressions.length === 0 ? '""' : expressions.join(" + ");
}

function emitStreamRendererFromChildren(
  children: JsxNodeIr[],
  escapeHelperName: string,
): string | undefined {
  if (children.length === 0) {
    return undefined;
  }

  const parentState = currentPropChildrenCollectState;
  const childState: CollectHtmlState = {
    dynamicAttributes: "emit",
    hydration: false,
    awaitHydration: false,
    nextFragmentId: parentState?.nextFragmentId ?? 0,
    ...(parentState?.reactSuspenseRevealScriptNonce === undefined
      ? {}
      : { reactSuspenseRevealScriptNonce: parentState.reactSuspenseRevealScriptNonce }),
    ...(parentState?.reactSuspenseRevealScriptSrc === undefined
      ? {}
      : { reactSuspenseRevealScriptSrc: parentState.reactSuspenseRevealScriptSrc }),
  };
  const parts = children.flatMap((child) =>
    collectHtmlParts(
      child,
      escapeHelperName,
      currentAsyncBoundaryHelperName,
      currentOutOfOrderBoundaryHelperName,
      currentReactSuspenseBoundaryHelperName,
      currentReactSuspenseOutOfOrderBoundaryHelperName,
      childState,
    ),
  );
  if (parentState !== undefined) {
    parentState.nextFragmentId = childState.nextFragmentId;
  }

  if (
    parts.every(
      (part) =>
        isHtmlSyncPart(part) &&
        tryEmitPartAsStringExpression(part, currentCompatRenderToStringHelperName) !== undefined,
    )
  ) {
    return undefined;
  }

  return `async ($sink) => {\n${emitNestedStreamAppendStatements(parts, "$sink", currentCompatRenderToStringHelperName)}\n}`;
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
    if (isClientBoundaryPlaceholder(node)) {
      return false;
    }

    return node.name === "Suspense" ? false : true;
  }

  return false;
}

function containsAnyAsyncBoundary(node: JsxNodeIr): boolean {
  if (node.kind === "async-boundary") {
    return true;
  }

  if (node.kind === "expr") {
    return (
      node.renderMode === "stream-node" ||
      (node.renderMode === "html" && isChildrenExpressionCode(node.code))
    );
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
    if (isClientBoundaryPlaceholder(node)) {
      return false;
    }

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
      if (isClientBoundaryPlaceholder(child)) {
        return false;
      }

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

function containsClientBoundary(node: JsxNodeIr): boolean {
  if (node.kind === "component" && isClientBoundaryPlaceholder(node)) {
    return true;
  }

  if (node.kind === "component") {
    return (
      node.children.some(containsClientBoundary) ||
      node.props.some(
        (prop) => prop.kind === "render-prop" && prop.children.some(containsClientBoundary),
      )
    );
  }

  if (node.kind === "conditional") {
    return [...node.whenTrue, ...node.whenFalse].some(containsClientBoundary);
  }

  if (node.kind === "list") {
    return node.children.some(containsClientBoundary);
  }

  if (node.kind === "element" || node.kind === "fragment") {
    return node.children.some(containsClientBoundary);
  }

  if (node.kind === "async-boundary") {
    return [
      ...node.children,
      ...(node.placeholderChildren ?? []),
      ...(node.catchChildren ?? []),
    ].some(containsClientBoundary);
  }

  return false;
}

function containsReactNodeRender(node: JsxNodeIr): boolean {
  if (node.kind === "expr") {
    return node.renderMode === "react-node";
  }

  if (node.kind === "component") {
    if (node.runtime === "compat") {
      return true;
    }

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
    entries.push(
      `children: ${
        emitStreamRendererFromChildren(children, escapeHelperName) ??
        emitHtmlExpressionFromChildren(children, escapeHelperName)
      }`,
    );
  }

  return `{ ${entries.join(", ")} }`;
}

function emitPropName(name: string): string {
  return /^[A-Za-z_$][\w$]*$/.test(name) ? name : JSON.stringify(name);
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
