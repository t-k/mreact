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
import type { Diagnostic } from "./types.js";

export type BoundaryGraphEntryKind =
  | "module"
  | "route-layout"
  | "route-page"
  | "route-template";

export type BoundaryClassification =
  | "client-boundary"
  | "client-route"
  | "server-action"
  | "server-only"
  | "server-render"
  | "shared"
  | "unknown";

export interface BoundaryGraphEntry {
  file: string;
  kind: BoundaryGraphEntryKind;
}

export interface BoundaryGraphInput {
  entries: readonly BoundaryGraphEntry[];
  readModule(file: string): Promise<string | undefined> | string | undefined;
  resolveModule(input: {
    importer: string;
    source: string;
  }): Promise<string | undefined> | string | undefined;
}

export interface BoundaryGraphExport {
  classification: BoundaryClassification;
  name: string;
}

export interface BoundaryGraphModule {
  classification: BoundaryClassification;
  exports: BoundaryGraphExport[];
  file: string;
}

export interface BoundaryGraphClientBoundary {
  exportNames?: readonly string[];
  importerFile: string;
  moduleFile: string;
  source: string;
}

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

export interface BoundaryGraphResult {
  clientBoundaries: BoundaryGraphClientBoundary[];
  diagnostics: Diagnostic[];
  modules: BoundaryGraphModule[];
  serverActions: BoundaryGraphServerActionSite[];
}

interface ResolvedServerActionTarget {
  exportName: string;
  inferred: boolean;
  moduleFile: string;
}

export async function analyzeBoundaryGraph(
  input: BoundaryGraphInput,
): Promise<BoundaryGraphResult> {
  const modules = new Map<string, BoundaryGraphModule>();
  const clientBoundaries: BoundaryGraphClientBoundary[] = [];
  const diagnostics: Diagnostic[] = [];
  const serverActions: BoundaryGraphServerActionSite[] = [];
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
      visiting,
    });
  }

  return {
    clientBoundaries,
    diagnostics,
    modules: Array.from(modules.values()),
    serverActions,
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
      return;
    }

    const analysis = collectClientRouteModuleAnalysis({
      code,
      filename: options.file,
    });
    const serverOnly = isServerOnlyModule(analysis);
    const exports = analysis.topLevelExportRenderInfo.map((info) => ({
      classification: serverOnly ? "server-only" : exportClassification(info, options.entryKind),
      name: info.name,
    }));

    options.modules.set(options.file, {
      classification: moduleClassification(exports.map((item) => item.classification)),
      exports,
      file: options.file,
    });

    options.serverActions.push(
      ...(await inferServerActionSites({
        analysis,
        code,
        file: options.file,
        input: options.input,
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
      visiting: options.visiting,
    });
  } finally {
    options.visiting.delete(options.file);
  }
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

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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
      visiting: options.visiting,
    });

    propagateStaticExport({
      file: options.file,
      modules: options.modules,
      reference,
      resolved,
    });
  }
}

function propagateStaticExport(options: {
  file: string;
  modules: Map<string, BoundaryGraphModule>;
  reference: StaticExportReference;
  resolved: string;
}): void {
  const module = options.modules.get(options.file);
  const exported = options.modules.get(options.resolved);

  if (module === undefined || exported === undefined) {
    return;
  }

  const propagated = exported.exports.filter(
    (item) => options.reference.exportAll || options.reference.exportedNames.includes(item.name),
  );

  if (propagated.length === 0) {
    return;
  }

  const exportsByName = new Map(module.exports.map((item) => [item.name, item]));

  for (const item of propagated) {
    exportsByName.set(item.name, item);
  }

  const exports = Array.from(exportsByName.values()).sort((left, right) =>
    left.name.localeCompare(right.name),
  );
  options.modules.set(options.file, {
    ...module,
    classification: moduleClassification(exports.map((item) => item.classification)),
    exports,
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
  visiting: Set<string>;
}): Promise<void> {
  const renderedRoots = new Set(
    options.analysis.topLevelExportRenderInfo.flatMap((info) => [
      ...info.renderedComponentRoots,
      ...info.calledComponentRoots,
    ]),
  );

  for (const reference of options.analysis.staticImports) {
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

function exportClassification(
  info: TopLevelExportRenderInfo,
  entryKind: BoundaryGraphEntryKind,
): BoundaryClassification {
  if (!info.clientRuntime) {
    return "server-render";
  }

  return isRouteEntryKind(entryKind) ? "client-route" : "client-boundary";
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
