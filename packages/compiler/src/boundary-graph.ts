import { collectClientRouteModuleAnalysis } from "./internal.js";
import type {
  ClientRouteModuleAnalysis,
  ClientRouteStaticImportReference,
  StaticExportReference,
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

export interface BoundaryGraphResult {
  diagnostics: Diagnostic[];
  modules: BoundaryGraphModule[];
}

export async function analyzeBoundaryGraph(
  input: BoundaryGraphInput,
): Promise<BoundaryGraphResult> {
  const modules = new Map<string, BoundaryGraphModule>();
  const diagnostics: Diagnostic[] = [];
  const visiting = new Set<string>();

  for (const entry of input.entries) {
    await analyzeModule({
      diagnostics,
      entry: true,
      file: entry.file,
      input,
      modules,
      visiting,
    });
  }

  return { diagnostics, modules: Array.from(modules.values()) };
}

async function analyzeModule(options: {
  diagnostics: Diagnostic[];
  entry: boolean;
  file: string;
  input: BoundaryGraphInput;
  modules: Map<string, BoundaryGraphModule>;
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
    const exports = analysis.topLevelExportRenderInfo.map((info) => ({
      classification: exportClassification(info, options.entry),
      name: info.name,
    }));

    options.modules.set(options.file, {
      classification: moduleClassification(exports.map((item) => item.classification)),
      exports,
      file: options.file,
    });

    await analyzeStaticExports({
      analysis,
      diagnostics: options.diagnostics,
      file: options.file,
      input: options.input,
      modules: options.modules,
      visiting: options.visiting,
    });
    await analyzeRenderedImports({
      analysis,
      diagnostics: options.diagnostics,
      file: options.file,
      input: options.input,
      modules: options.modules,
      visiting: options.visiting,
    });
  } finally {
    options.visiting.delete(options.file);
  }
}

async function analyzeStaticExports(options: {
  analysis: ClientRouteModuleAnalysis;
  diagnostics: Diagnostic[];
  file: string;
  input: BoundaryGraphInput;
  modules: Map<string, BoundaryGraphModule>;
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
      entry: false,
      file: resolved,
      input: options.input,
      modules: options.modules,
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
  modules: Map<string, BoundaryGraphModule>;
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

    await analyzeModule({
      diagnostics: options.diagnostics,
      entry: false,
      file: resolved,
      input: options.input,
      modules: options.modules,
      visiting: options.visiting,
    });
  }
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
  entry: boolean,
): BoundaryClassification {
  if (!info.clientRuntime) {
    return "server-render";
  }

  return entry ? "client-route" : "client-boundary";
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
