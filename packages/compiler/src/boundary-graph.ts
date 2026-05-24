import { collectTopLevelExportRenderInfo } from "./internal.js";
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
  const modules: BoundaryGraphModule[] = [];
  const diagnostics: Diagnostic[] = [];

  for (const entry of input.entries) {
    const code = await input.readModule(entry.file);

    if (code === undefined) {
      diagnostics.push({
        code: "MR_BOUNDARY_GRAPH_MODULE_NOT_FOUND",
        level: "warn",
        message: `Boundary graph could not read module ${JSON.stringify(entry.file)}.`,
      });
      modules.push({
        classification: "unknown",
        exports: [],
        file: entry.file,
      });
      continue;
    }

    modules.push({
      classification: "server-render",
      exports: collectTopLevelExportRenderInfo({ code, filename: entry.file }).map((info) => ({
        classification: "server-render",
        name: info.name,
      })),
      file: entry.file,
    });
  }

  return { diagnostics, modules };
}
