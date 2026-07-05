import {
  collectClientRouteModuleAnalysis,
  collectFormActionExpressionReferences,
  hasModuleDirective,
} from "./internal.js";
import type {
  ClientRouteModuleAnalysis,
  ClientRouteStaticImportReference,
  StaticExportReference,
  StaticImportSpecifierReference,
  TopLevelExportRenderInfo,
} from "./internal.js";
import { escapeRegExp } from "./string-utils.js";
import type { Diagnostic } from "./types.js";

/** Classifies the route role of a module used as a boundary graph entry. */
export type BoundaryGraphEntryKind =
  | "module"
  | "route-layout"
  | "route-page"
  | "route-template";

/** Classifies how a module or export participates in client, server, and shared execution. */
export type BoundaryClassification =
  | "client-boundary"
  | "client-route"
  | "server-action"
  | "server-only"
  | "server-render"
  | "shared"
  | "unknown";

/** Describes an entry module passed to boundary graph analysis. */
export interface BoundaryGraphEntry {
  file: string;
  kind: BoundaryGraphEntryKind;
}

/** Supplies entry modules and module loading hooks for boundary graph analysis. */
export interface BoundaryGraphInput {
  entries: readonly BoundaryGraphEntry[];
  readModule(file: string): Promise<string | undefined> | string | undefined;
  resolveModule(input: {
    importer: string;
    source: string;
  }): Promise<string | undefined> | string | undefined;
}

/** Describes the boundary classification assigned to one named export. */
export interface BoundaryGraphExport {
  classification: BoundaryClassification;
  name: string;
}

/** Describes one analyzed module and the classifications for its exports. */
export interface BoundaryGraphModule {
  classification: BoundaryClassification;
  exports: BoundaryGraphExport[];
  file: string;
}

/** Describes an import that crosses from server-rendered code into a client boundary. */
export interface BoundaryGraphClientBoundary {
  exportNames?: readonly string[];
  importerFile: string;
  moduleFile: string;
  source: string;
}

/** Describes an inferred or explicit server action reference discovered in the graph. */
export interface BoundaryGraphServerActionSite {
  end: number;
  exportName: string;
  expression: string;
  expressionEnd: number;
  expressionStart: number;
  file: string;
  inferred: boolean;
  moduleFile: string;
  start: number;
}

/** Names the kind of boundary graph trace event. */
export type BoundaryGraphTraceKind =
  | "client-boundary"
  | "export"
  | "module"
  | "server-action";

/** Names the analysis reason attached to a boundary graph trace event. */
export type BoundaryGraphTraceReason =
  | "client-runtime-export"
  | "module-classification"
  | "node-builtin-import"
  | "rendered-import"
  | "server-action-expression"
  | "server-render-export"
  | "static-export"
  | "use-client-directive"
  | "unknown-module"
  | "use-server-directive";

/** Records one decision made while classifying a boundary graph. */
export interface BoundaryGraphTraceEvent {
  classification: BoundaryClassification;
  exportName?: string;
  exportNames?: readonly string[];
  expression?: string;
  file: string;
  importerFile?: string;
  inferred?: boolean;
  kind: BoundaryGraphTraceKind;
  moduleFile?: string;
  reason: BoundaryGraphTraceReason;
  source?: string;
  viaExportName?: string;
}

/** Contains modules, client boundaries, server actions, diagnostics, and trace events for a graph analysis run. */
export interface BoundaryGraphResult {
  clientBoundaries: BoundaryGraphClientBoundary[];
  diagnostics: Diagnostic[];
  modules: BoundaryGraphModule[];
  serverActions: BoundaryGraphServerActionSite[];
  trace: BoundaryGraphTraceEvent[];
}

interface ResolvedServerActionTarget {
  exportName: string;
  inferred: boolean;
  moduleFile: string;
}

/** Analyzes route modules and static imports to classify server, client, shared, and action boundaries. */
export async function analyzeBoundaryGraph(
  input: BoundaryGraphInput,
): Promise<BoundaryGraphResult> {
  const modules = new Map<string, BoundaryGraphModule>();
  const clientBoundaries: BoundaryGraphClientBoundary[] = [];
  const diagnostics: Diagnostic[] = [];
  const serverActions: BoundaryGraphServerActionSite[] = [];
  const trace: BoundaryGraphTraceEvent[] = [];
  const visiting = new Set<string>();

  for (const entry of input.entries) {
    await analyzeModule({
      diagnostics,
      entryKind: entry.kind,
      file: entry.file,
      input,
      clientBoundaries,
      modules,
      serverActions,
      trace,
      visiting,
    });
  }

  return {
    clientBoundaries,
    diagnostics,
    modules: Array.from(modules.values()),
    serverActions,
    trace,
  };
}

async function analyzeModule(options: {
  diagnostics: Diagnostic[];
  entryKind: BoundaryGraphEntryKind;
  file: string;
  input: BoundaryGraphInput;
  clientBoundaries: BoundaryGraphClientBoundary[];
  modules: Map<string, BoundaryGraphModule>;
  serverActions: BoundaryGraphServerActionSite[];
  trace: BoundaryGraphTraceEvent[];
  visiting: Set<string>;
}): Promise<void> {
  if (options.modules.has(options.file) || options.visiting.has(options.file)) {
    return;
  }

  options.visiting.add(options.file);

  try {
    const code = await options.input.readModule(options.file);

    if (code === undefined) {
      options.diagnostics.push({
        code: "MR_BOUNDARY_GRAPH_MODULE_NOT_FOUND",
        level: "warn",
        message: `Boundary graph could not read module ${JSON.stringify(options.file)}.`,
      });
      options.modules.set(options.file, {
        classification: "unknown",
        exports: [],
        file: options.file,
      });
      options.trace.push({
        classification: "unknown",
        file: options.file,
        kind: "module",
        reason: "unknown-module",
      });
      return;
    }

    const analysis = collectClientRouteModuleAnalysis({
      code,
      filename: options.file,
    });
    const serverOnly = isServerOnlyModule(analysis);
    const explicitClient = analysis.hasUseClientDirective;
    const exports = analysis.topLevelExportRenderInfo.map((info) => ({
      classification: serverOnly
        ? "server-only"
        : exportClassification({
            explicitClient,
            info,
            entryKind: options.entryKind,
          }),
      name: info.name,
    }));

    options.modules.set(options.file, {
      classification: moduleClassification(exports.map((item) => item.classification)),
      exports,
      file: options.file,
    });
    const module = options.modules.get(options.file);

    if (module !== undefined) {
      options.trace.push({
        classification: module.classification,
        file: options.file,
        kind: "module",
        reason: "module-classification",
      });
    }
    options.trace.push(
      ...analysis.topLevelExportRenderInfo.map((info) => {
        const classification = serverOnly
          ? "server-only"
          : exportClassification({
              explicitClient,
              info,
              entryKind: options.entryKind,
            });

        return {
          classification,
          exportName: info.name,
          file: options.file,
          kind: "export" as const,
          reason: exportTraceReason({ analysis, classification, explicitClient, serverOnly }),
        };
      }),
    );

    const inferredServerActions = await inferServerActionSites({
      analysis,
      code,
      file: options.file,
      input: options.input,
    });
    options.serverActions.push(...inferredServerActions);
    options.trace.push(
      ...inferredServerActions.map((action) => ({
        classification: "server-action" as const,
        exportName: action.exportName,
        expression: action.expression,
        file: action.file,
        inferred: action.inferred,
        kind: "server-action" as const,
        moduleFile: action.moduleFile,
        reason: "server-action-expression" as const,
      })),
    );
    await analyzeStaticExports({
      analysis,
      diagnostics: options.diagnostics,
      file: options.file,
      input: options.input,
      clientBoundaries: options.clientBoundaries,
      modules: options.modules,
      serverActions: options.serverActions,
      trace: options.trace,
      visiting: options.visiting,
    });
    await analyzeRenderedImports({
      analysis,
      diagnostics: options.diagnostics,
      file: options.file,
      input: options.input,
      clientBoundaries: options.clientBoundaries,
      modules: options.modules,
      serverActions: options.serverActions,
      trace: options.trace,
      visiting: options.visiting,
    });
  } finally {
    options.visiting.delete(options.file);
  }
}

function exportTraceReason(options: {
  analysis: ClientRouteModuleAnalysis;
  classification: BoundaryClassification;
  explicitClient: boolean;
  serverOnly: boolean;
}): BoundaryGraphTraceReason {
  if (options.serverOnly) {
    return options.analysis.hasUseServerDirective ? "use-server-directive" : "node-builtin-import";
  }

  if (options.explicitClient) {
    return "use-client-directive";
  }

  return options.classification === "server-render"
    ? "server-render-export"
    : "client-runtime-export";
}

function isServerOnlyModule(analysis: ClientRouteModuleAnalysis): boolean {
  return (
    analysis.hasUseServerDirective ||
    analysis.staticImports.some((reference) => nodeBuiltinPackages.has(reference.source))
  );
}

const nodeBuiltinPackages = new Set([
  "assert",
  "async_hooks",
  "buffer",
  "child_process",
  "cluster",
  "console",
  "crypto",
  "dgram",
  "diagnostics_channel",
  "dns",
  "domain",
  "events",
  "fs",
  "fs/promises",
  "http",
  "http2",
  "https",
  "module",
  "net",
  "os",
  "path",
  "perf_hooks",
  "process",
  "punycode",
  "querystring",
  "readline",
  "repl",
  "stream",
  "stream/consumers",
  "stream/promises",
  "stream/web",
  "string_decoder",
  "timers",
  "timers/promises",
  "tls",
  "trace_events",
  "tty",
  "url",
  "util",
  "v8",
  "vm",
  "wasi",
  "worker_threads",
  "zlib",
].flatMap((name) => [name, `node:${name}`]));

async function inferServerActionSites(options: {
  analysis: ClientRouteModuleAnalysis;
  code: string;
  file: string;
  input: BoundaryGraphInput;
}): Promise<BoundaryGraphServerActionSite[]> {
  const actions: BoundaryGraphServerActionSite[] = [];
  const references = collectFormActionExpressionReferences({
    code: options.code,
    filename: options.file,
  });

  for (const reference of references) {
    const target = await resolveServerActionExpression({
      analysis: options.analysis,
      code: options.code,
      expression: reference.expression,
      file: options.file,
      input: options.input,
      seen: new Set(),
    });

    if (target !== undefined) {
      actions.push({
        end: reference.end,
        exportName: target.exportName,
        expression: reference.expression,
        expressionEnd: reference.expressionEnd,
        expressionStart: reference.expressionStart,
        file: options.file,
        inferred: target.inferred,
        moduleFile: target.moduleFile,
        start: reference.start,
      });
    }
  }

  return actions;
}

async function resolveServerActionExpression(options: {
  analysis: ClientRouteModuleAnalysis;
  code: string;
  expression: string;
  file: string;
  input: BoundaryGraphInput;
  seen: Set<string>;
}): Promise<ResolvedServerActionTarget | undefined> {
  const expression = options.expression.trim();

  if (options.seen.has(expression)) {
    return undefined;
  }

  options.seen.add(expression);

  if (identifierPattern.test(expression)) {
    const imported = await importedActionReference({
      analysis: options.analysis,
      expression,
      file: options.file,
      input: options.input,
    });

    if (imported !== undefined) {
      return imported;
    }

    const alias = localAliasExpression(options.code, expression);

    return alias === undefined
      ? undefined
      : await resolveServerActionExpression({
          ...options,
          expression: alias,
        });
  }

  const member = memberExpressionPattern.exec(expression);

  if (member !== null) {
    const objectName = member.groups?.object;
    const propertyName = member.groups?.property;
    const namespace =
      objectName === undefined || propertyName === undefined
        ? undefined
        : await namespaceActionReference({
            analysis: options.analysis,
            exportName: propertyName,
            file: options.file,
            input: options.input,
            localName: objectName,
          });

    if (namespace !== undefined) {
      return namespace;
    }

    const propertyExpression =
      objectName === undefined || propertyName === undefined
        ? undefined
        : objectLiteralPropertyExpression(options.code, objectName, propertyName);

    return propertyExpression === undefined
      ? undefined
      : await resolveServerActionExpression({
          ...options,
          expression: propertyExpression,
        });
  }

  return undefined;
}

async function namespaceActionReference(options: {
  analysis: ClientRouteModuleAnalysis;
  exportName: string;
  file: string;
  input: BoundaryGraphInput;
  localName: string;
}): Promise<ResolvedServerActionTarget | undefined> {
  for (const staticImport of options.analysis.staticImports) {
    const specifier = staticImport.specifiers.find(
      (candidate) => candidate.kind === "namespace" && candidate.localName === options.localName,
    );

    if (specifier === undefined) {
      continue;
    }

    const moduleFile = await options.input.resolveModule({
      importer: options.file,
      source: staticImport.source,
    });

    if (moduleFile === undefined) {
      continue;
    }

    return {
      exportName: options.exportName,
      inferred: await isInferredServerAction(options.input, moduleFile),
      moduleFile,
    };
  }

  return undefined;
}

async function importedActionReference(options: {
  analysis: ClientRouteModuleAnalysis;
  expression: string;
  file: string;
  input: BoundaryGraphInput;
}): Promise<ResolvedServerActionTarget | undefined> {
  for (const staticImport of options.analysis.staticImports) {
    const specifier = staticImport.specifiers.find(
      (candidate) => candidate.localName === options.expression,
    );

    if (specifier === undefined || specifier.kind === "namespace") {
      continue;
    }

    const moduleFile = await options.input.resolveModule({
      importer: options.file,
      source: staticImport.source,
    });

    if (moduleFile === undefined) {
      continue;
    }

    return {
      exportName: importedActionExportName(specifier),
      inferred: await isInferredServerAction(options.input, moduleFile),
      moduleFile,
    };
  }

  return undefined;
}

function localAliasExpression(code: string, name: string): string | undefined {
  const match = new RegExp(
    String.raw`\b(?:const|let|var)\s+${escapeRegExp(name)}\s*=\s*(?<expression>[^;]+);`,
  ).exec(code);
  const expression = match?.groups?.expression;

  return expression === undefined ? undefined : expression.trim();
}

function objectLiteralPropertyExpression(
  code: string,
  objectName: string,
  propertyName: string,
): string | undefined {
  const object = new RegExp(
    String.raw`\b(?:const|let|var)\s+${escapeRegExp(objectName)}\s*=\s*\{(?<body>[\s\S]*?)\}\s*;`,
  ).exec(code);
  const body = object?.groups?.body;

  if (body === undefined) {
    return undefined;
  }

  const property = escapeRegExp(propertyName);
  const assignment = new RegExp(
    String.raw`(?:^|,)\s*${property}\s*:\s*(?<expression>[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)?)\s*(?:,|$)`,
  ).exec(body);

  if (assignment?.groups?.expression !== undefined) {
    return assignment.groups.expression;
  }

  const shorthand = new RegExp(String.raw`(?:^|,)\s*(?<name>${property})\s*(?:,|$)`).exec(body);

  return shorthand?.groups?.name;
}

function importedActionExportName(specifier: StaticImportSpecifierReference): string {
  return specifier.kind === "default" ? "default" : specifier.importedName;
}

async function isInferredServerAction(
  input: BoundaryGraphInput,
  moduleFile: string,
): Promise<boolean> {
  const code = await input.readModule(moduleFile);

  if (code === undefined) {
    return true;
  }

  return !hasModuleDirective({ code, directive: "use server", filename: moduleFile });
}

const identifierPattern = /^[A-Za-z_$][\w$]*$/;
const memberExpressionPattern =
  /^(?<object>[A-Za-z_$][\w$]*)\.(?<property>[A-Za-z_$][\w$]*)$/;

async function analyzeStaticExports(options: {
  analysis: ClientRouteModuleAnalysis;
  diagnostics: Diagnostic[];
  file: string;
  input: BoundaryGraphInput;
  clientBoundaries: BoundaryGraphClientBoundary[];
  modules: Map<string, BoundaryGraphModule>;
  serverActions: BoundaryGraphServerActionSite[];
  trace: BoundaryGraphTraceEvent[];
  visiting: Set<string>;
}): Promise<void> {
  for (const reference of options.analysis.staticExports) {
    const resolved = await options.input.resolveModule({
      importer: options.file,
      source: reference.source,
    });

    if (resolved === undefined) {
      continue;
    }

    await analyzeModule({
      diagnostics: options.diagnostics,
      entryKind: "module",
      file: resolved,
      input: options.input,
      clientBoundaries: options.clientBoundaries,
      modules: options.modules,
      serverActions: options.serverActions,
      trace: options.trace,
      visiting: options.visiting,
    });

    propagateStaticExport({
      file: options.file,
      modules: options.modules,
      reference,
      resolved,
      trace: options.trace,
    });
  }
}

function propagateStaticExport(options: {
  file: string;
  modules: Map<string, BoundaryGraphModule>;
  reference: StaticExportReference;
  resolved: string;
  trace: BoundaryGraphTraceEvent[];
}): void {
  const module = options.modules.get(options.file);
  const exported = options.modules.get(options.resolved);

  if (module === undefined || exported === undefined) {
    return;
  }

  const propagated = propagatedStaticExports(options.reference, exported);

  if (propagated.length === 0) {
    return;
  }

  const exportsByName = new Map(module.exports.map((item) => [item.name, item]));

  for (const item of propagated) {
    exportsByName.set(item.export.name, item.export);
    options.trace.push({
      classification: item.export.classification,
      exportName: item.export.name,
      file: options.file,
      kind: "export",
      moduleFile: options.resolved,
      reason: "static-export",
      source: options.reference.source,
      viaExportName: item.viaExportName,
    });
  }

  const exports = Array.from(exportsByName.values()).sort((left, right) =>
    left.name.localeCompare(right.name),
  );
  const classification = moduleClassification(exports.map((item) => item.classification));
  options.modules.set(options.file, {
    ...module,
    classification,
    exports,
  });
  options.trace.push({
    classification,
    file: options.file,
    kind: "module",
    moduleFile: options.resolved,
    reason: "static-export",
    source: options.reference.source,
  });
}

function propagatedStaticExports(
  reference: StaticExportReference,
  exported: BoundaryGraphModule,
): { export: BoundaryGraphExport; viaExportName: string }[] {
  if (reference.exportAll) {
    return exported.exports.map((item) => ({
      export: item,
      viaExportName: item.name,
    }));
  }

  if (reference.specifiers.length === 0) {
    return exported.exports
      .filter((item) => reference.exportedNames.includes(item.name))
      .map((item) => ({
        export: item,
        viaExportName: item.name,
      }));
  }

  return reference.specifiers.flatMap((specifier) => {
    const item = exported.exports.find((candidate) => candidate.name === specifier.localName);

    return item === undefined
      ? []
      : [
          {
            export: { ...item, name: specifier.exportedName },
            viaExportName: specifier.localName,
          },
        ];
  });
}

async function analyzeRenderedImports(options: {
  analysis: ClientRouteModuleAnalysis;
  diagnostics: Diagnostic[];
  file: string;
  input: BoundaryGraphInput;
  clientBoundaries: BoundaryGraphClientBoundary[];
  modules: Map<string, BoundaryGraphModule>;
  serverActions: BoundaryGraphServerActionSite[];
  trace: BoundaryGraphTraceEvent[];
  visiting: Set<string>;
}): Promise<void> {
  const renderedRoots = new Set(
    options.analysis.topLevelExportRenderInfo.flatMap((info) => [
      ...info.renderedComponentRoots,
      ...info.calledComponentRoots,
    ]),
  );

  for (const reference of options.analysis.staticImports) {
    if (reference.sideEffect && isStyleModuleSpecifier(reference.source)) {
      continue;
    }

    if (!isRenderedImport(reference, renderedRoots)) {
      continue;
    }

    const resolved = await options.input.resolveModule({
      importer: options.file,
      source: reference.source,
    });

    if (resolved === undefined) {
      continue;
    }

    const exportNames = renderedImportedExportNames(reference, renderedRoots);
    await analyzeModule({
      diagnostics: options.diagnostics,
      entryKind: "module",
      file: resolved,
      input: options.input,
      clientBoundaries: options.clientBoundaries,
      modules: options.modules,
      serverActions: options.serverActions,
      trace: options.trace,
      visiting: options.visiting,
    });

    const module = options.modules.get(resolved);

    if (module !== undefined && hasClientBoundaryExport(module, exportNames)) {
      options.clientBoundaries.push({
        ...(exportNames === undefined ? {} : { exportNames }),
        importerFile: options.file,
        moduleFile: resolved,
        source: reference.source,
      });
      options.trace.push({
        classification: "client-boundary",
        ...(exportNames === undefined ? {} : { exportNames }),
        file: options.file,
        importerFile: options.file,
        kind: "client-boundary",
        moduleFile: resolved,
        reason: "rendered-import",
        source: reference.source,
      });
    }
  }
}

function renderedImportedExportNames(
  reference: ClientRouteStaticImportReference,
  renderedRoots: ReadonlySet<string>,
): string[] | undefined {
  if (reference.sideEffect) {
    return undefined;
  }

  const names: string[] = [];

  for (const specifier of reference.specifiers) {
    if (!renderedRoots.has(specifier.localName)) {
      continue;
    }

    if (specifier.kind === "namespace") {
      return undefined;
    }

    names.push(specifier.kind === "default" ? "default" : specifier.importedName);
  }

  return names;
}

function hasClientBoundaryExport(
  module: BoundaryGraphModule,
  exportNames: readonly string[] | undefined,
): boolean {
  return module.exports.some(
    (item) =>
      item.classification === "client-boundary" &&
      (exportNames === undefined || exportNames.includes(item.name)),
  );
}

function isRenderedImport(
  reference: ClientRouteStaticImportReference,
  renderedRoots: ReadonlySet<string>,
): boolean {
  return (
    reference.sideEffect ||
    reference.localNames.some((localName) => renderedRoots.has(localName))
  );
}

function isStyleModuleSpecifier(source: string): boolean {
  return /\.(?:css|less|sass|scss|styl|stylus)(?:[?#].*)?$/u.test(source);
}

function exportClassification(options: {
  explicitClient: boolean;
  info: TopLevelExportRenderInfo;
  entryKind: BoundaryGraphEntryKind;
}): BoundaryClassification {
  if (!options.explicitClient && !options.info.clientRuntime) {
    return "server-render";
  }

  return isRouteEntryKind(options.entryKind) ? "client-route" : "client-boundary";
}

function isRouteEntryKind(kind: BoundaryGraphEntryKind): boolean {
  return kind === "route-layout" || kind === "route-page" || kind === "route-template";
}

function moduleClassification(
  classifications: readonly BoundaryClassification[],
): BoundaryClassification {
  if (classifications.includes("client-route")) {
    return "client-route";
  }

  if (classifications.includes("client-boundary")) {
    return "client-boundary";
  }

  if (classifications.includes("server-action")) {
    return "server-action";
  }

  if (classifications.includes("unknown")) {
    return "unknown";
  }

  if (classifications.includes("server-only")) {
    return "server-only";
  }

  return "server-render";
}
