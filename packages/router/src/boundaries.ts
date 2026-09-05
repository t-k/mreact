import { readFile } from "node:fs/promises";
import { relative, sep } from "node:path";
import type { UserConfig } from "vite";
import type {
  ClientRouteComponent,
  ClientRouteComponentClassification,
  ClientRouteComponentOrigin,
  ClientRouteInferenceDiagnostic,
} from "./client-route-inference.js";
import {
  createClientRouteInferenceCache,
  inferClientRouteModule,
} from "./client-route-inference.js";
import {
  resolveAppRouterProjectOptions,
  type AppRouterExecutionContracts,
  type AppRouterProjectOptions,
} from "./config.js";
import { stripRouteClientSource } from "./route-source.js";
import { scanAppRoutes } from "./routes.js";

/**
 * Describes one statically traced component in a route boundary report.
 */
export interface BoundaryReportComponent {
  classification: ClientRouteComponentClassification;
  decision: BoundaryReportDecision;
  exportName: string;
  file: string;
  origin: ClientRouteComponentOrigin;
}

export type BoundaryExecutionMode = "client" | "server" | "shared" | "unknown";

export interface BoundaryReportDecision {
  executionMode: BoundaryExecutionMode;
  reasonChain: readonly string[];
  sourceRange?: BoundarySourceRange | undefined;
}

export interface BoundarySourcePosition {
  column: number;
  line: number;
}

export interface BoundarySourceRange {
  end: BoundarySourcePosition;
  start: BoundarySourcePosition;
}

export interface BoundaryReportByteCost {
  gzipEstimateBytes: number;
  observedTransferBytes?: number | undefined;
  rawBytes: number;
}

export interface BoundaryReportCost {
  baseline?:
    | {
        initialGzipDeltaBytes?: number | undefined;
        navigationGzipDeltaBytes?: number | undefined;
      }
    | undefined;
  initial?: BoundaryReportByteCost | undefined;
  navigation?: BoundaryReportByteCost | undefined;
  reason?: string | undefined;
  status: "available" | "unavailable";
}

/**
 * Describes the rendered component boundary graph for one page route.
 */
export interface BoundaryReportRoute {
  classification: "client-route" | "server-render";
  components: readonly BoundaryReportComponent[];
  cost: BoundaryReportCost;
  entry: string;
  executionModes: readonly BoundaryExecutionMode[];
  path: string;
}

/**
 * Counts route and component classifications across a boundary report.
 */
export interface BoundaryReportSummary {
  clientBoundaries: number;
  clientRoutes: number;
  serverOnlyComponents: number;
  serverRenderComponents: number;
  serverRenderRoutes: number;
  sharedComponents: number;
  unknownComponents: number;
}

/**
 * Contains a deterministic, versioned snapshot of app-router component boundaries.
 */
export interface BoundaryReport {
  diagnostics: readonly ClientRouteInferenceDiagnostic[];
  routes: readonly BoundaryReportRoute[];
  summary: BoundaryReportSummary;
  version: 1;
}

export interface CreateBoundaryReportRouteInput {
  components: readonly ClientRouteComponent[];
  cost?: BoundaryReportCost | undefined;
  diagnostics: readonly ClientRouteInferenceDiagnostic[];
  entry: string;
  path: string;
  source?: string | undefined;
}

export interface CreateBoundaryReportInput {
  projectRoot: string;
  routes: readonly CreateBoundaryReportRouteInput[];
}

/**
 * Supplies project and Vite settings for standalone boundary analysis.
 */
export interface AnalyzeAppBoundariesOptions extends AppRouterProjectOptions {
  viteConfig?: Pick<UserConfig, "define" | "plugins"> | undefined;
}

/**
 * Inspects every page route without writing build artifacts or executing application code.
 */
export async function analyzeAppBoundaries(
  options: AnalyzeAppBoundariesOptions,
): Promise<BoundaryReport> {
  const project = resolveAppRouterProjectOptions(options);
  const routes = (await scanAppRoutes({ appDir: project.routesDir })).filter(
    (route) => route.kind === "page",
  );
  const cache = createClientRouteInferenceCache();
  const analyzedRoutes = await Promise.all(
    routes.map(async (route): Promise<CreateBoundaryReportRouteInput> => {
      const source = await readFile(route.file, "utf8");
      const inference = await inferClientRouteModule({
        appDir: project.routesDir,
        cache,
        code: stripRouteClientSource({ code: source, filename: route.file }),
        collectComponents: true,
        filename: route.file,
        routePath: route.path,
        vitePlugins: options.viteConfig?.plugins,
      });

      return {
        components: inference.components ?? [],
        diagnostics: inference.diagnostics,
        entry: route.file,
        path: route.path,
        source,
      };
    }),
  );

  const report = createBoundaryReport({
    projectRoot: project.projectRoot,
    routes: analyzedRoutes,
  });
  validateBoundaryExecutionContracts(report, project.executionContracts);
  return report;
}

export function createBoundaryReport(input: CreateBoundaryReportInput): BoundaryReport {
  const routes = input.routes
    .map((route): BoundaryReportRoute => {
      const entry = projectRelativePath(input.projectRoot, route.entry);
      const components = normalizeComponents(
        input.projectRoot,
        entry,
        route.components,
        route.source,
      );

      return {
        classification: components.some(
          (component) =>
            component.file === entry &&
            component.exportName === "default" &&
            component.classification === "client-route",
        )
          ? "client-route"
          : "server-render",
        components,
        cost: route.cost ?? {
          reason: "No production artifact supplied.",
          status: "unavailable",
        },
        entry,
        executionModes: executionModesForComponents(components),
        path: route.path,
      };
    })
    .sort((left, right) =>
      left.path === right.path
        ? left.entry.localeCompare(right.entry)
        : left.path.localeCompare(right.path),
    );
  const diagnostics = input.routes
    .flatMap((route) => route.diagnostics)
    .map((diagnostic) => {
      const filename = projectRelativePath(input.projectRoot, diagnostic.filename);

      return {
        ...diagnostic,
        filename,
        message: diagnostic.message.split(diagnostic.filename).join(filename),
      };
    })
    .sort((left, right) =>
      left.filename === right.filename
        ? left.code.localeCompare(right.code)
        : left.filename.localeCompare(right.filename),
    );

  return {
    diagnostics,
    routes,
    summary: summarizeBoundaryRoutes(routes),
    version: 1,
  };
}

export function formatBoundaryReport(report: BoundaryReport): string {
  const lines = ["Boundaries:"];

  for (const route of report.routes) {
    lines.push(`  ${route.path} [${route.classification}]`);

    for (const component of route.components) {
      lines.push(
        `    ${component.file}#${component.exportName}  ${component.classification}${formatComponentOrigin(component.origin)}`,
      );
    }

    lines.push(`    modes: ${route.executionModes.join(", ")}`);

    lines.push("");
  }

  if (report.diagnostics.length > 0) {
    lines.push("Warnings:");
    for (const diagnostic of report.diagnostics) {
      lines.push(`  ${diagnostic.code}: ${diagnostic.message}`);
    }
    lines.push("");
  }

  const summary = report.summary;
  lines.push(
    [
      `Summary: ${summary.serverRenderRoutes} ${plural(summary.serverRenderRoutes, "server-render route")}`,
      `${summary.clientRoutes} ${plural(summary.clientRoutes, "client route")}`,
      `${summary.clientBoundaries} ${plural(summary.clientBoundaries, "client boundary")}`,
      `${summary.serverRenderComponents} ${plural(summary.serverRenderComponents, "server-render component")}`,
      `${summary.serverOnlyComponents} ${plural(summary.serverOnlyComponents, "server-only component")}`,
      `${summary.sharedComponents} ${plural(summary.sharedComponents, "shared component")}`,
      `${summary.unknownComponents} ${plural(summary.unknownComponents, "unknown component")}`,
    ].join(", "),
  );

  return `${lines.join("\n")}\n`;
}

export function formatBoundaryReportJson(report: BoundaryReport): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}

function normalizeComponents(
  projectRoot: string,
  entry: string,
  components: readonly ClientRouteComponent[],
  source: string | undefined,
): BoundaryReportComponent[] {
  const unique = new Map<string, BoundaryReportComponent>();

  for (const component of components) {
    const normalized: BoundaryReportComponent = {
      ...component,
      decision: {
        executionMode: executionModeForClassification(component.classification),
        reasonChain: reasonChainForComponent(component, projectRoot, entry),
        ...(source === undefined ||
        component.file !== resolveProjectRelativePath(projectRoot, entry)
          ? {}
          : sourceRangeField(source, component.exportName)),
      },
      file: projectRelativePath(projectRoot, component.file),
    };
    unique.set(
      `${normalized.file}\0${normalized.exportName}\0${normalized.classification}`,
      normalized,
    );
  }

  return Array.from(unique.values()).sort((left, right) => {
    const leftEntry = left.file === entry;
    const rightEntry = right.file === entry;

    if (leftEntry !== rightEntry) {
      return leftEntry ? -1 : 1;
    }

    return left.file === right.file
      ? left.exportName === right.exportName
        ? left.classification.localeCompare(right.classification)
        : left.exportName.localeCompare(right.exportName)
      : left.file.localeCompare(right.file);
  });
}

/** Validates opt-in execution constraints against the normalized boundary report. */
export function validateBoundaryExecutionContracts(
  report: BoundaryReport,
  contracts: AppRouterExecutionContracts | undefined,
): void {
  if (contracts === undefined) {
    return;
  }

  const violations: string[] = [];
  const serverOnlyRoutes = contracts.serverOnlyRoutes ?? [];
  const noCompatComponents = contracts.noCompatComponents ?? [];

  for (const route of report.routes) {
    if (serverOnlyRoutes.some((pattern) => globMatches(route.path, pattern))) {
      for (const component of route.components) {
        if (
          component.decision.executionMode === "client" ||
          component.decision.executionMode === "shared" ||
          component.decision.executionMode === "unknown"
        ) {
          violations.push(
            `server-only route ${JSON.stringify(route.path)} includes ${component.decision.executionMode} execution at ${component.file}#${component.exportName}`,
          );
        }
      }
    }

    for (const component of route.components) {
      const componentId = `${component.file}#${component.exportName}`;
      if (
        !noCompatComponents.some(
          (pattern) => globMatches(component.file, pattern) || globMatches(componentId, pattern),
        )
      ) {
        continue;
      }

      if (component.origin === "compat-filename" || isCompatComponentFile(component.file)) {
        violations.push(
          `no-compat component ${componentId} uses compat fallback from its filename`,
        );
      } else if (component.decision.executionMode === "unknown") {
        violations.push(`no-compat component ${componentId} has an unknown compiler decision`);
      }
    }
  }

  if (violations.length > 0) {
    throw new Error(
      `mreactRouter execution contract violation(s):\n${violations.map((violation) => `- ${violation}`).join("\n")}`,
    );
  }
}

function isCompatComponentFile(file: string): boolean {
  return /\.compat(?:\.mreact)?\.[cm]?[jt]sx?$/.test(file.replaceAll("\\", "/"));
}

function executionModesForComponents(
  components: readonly BoundaryReportComponent[],
): BoundaryExecutionMode[] {
  const order: readonly BoundaryExecutionMode[] = ["client", "server", "shared", "unknown"];
  const modes = new Set(components.map((component) => component.decision.executionMode));
  return order.filter((mode) => modes.has(mode));
}

function executionModeForClassification(
  classification: ClientRouteComponentClassification,
): BoundaryExecutionMode {
  if (classification === "client-boundary" || classification === "client-route") {
    return "client";
  }
  if (classification === "shared") {
    return "shared";
  }
  if (classification === "unknown") {
    return "unknown";
  }
  return "server";
}

function reasonChainForComponent(
  component: ClientRouteComponent,
  projectRoot: string,
  entry: string,
): string[] {
  const reasons = [`classification:${component.classification}`, `origin:${component.origin}`];

  if (component.origin === "inferred-client-runtime") {
    reasons.push("client-runtime-inference");
  } else if (component.origin === "compat-filename") {
    reasons.push("compat-fallback");
  } else if (component.origin === "unresolved-reference") {
    reasons.push("unresolved-reference");
  }

  if (projectRelativePath(projectRoot, component.file) !== entry) {
    reasons.push(`reachable-from:${entry}`);
  }

  return reasons;
}

function sourceRangeField(
  source: string,
  exportName: string,
): { sourceRange?: BoundarySourceRange | undefined } {
  const escapedName = escapeRegExp(exportName);
  const pattern =
    exportName === "default"
      ? /\bexport\s+default\b/u
      : new RegExp(
          `\\bexport\\s+(?:(?:async)\\s+)?(?:function|class|const|let|var)\\s+${escapedName}\\b`,
          "u",
        );
  const match = pattern.exec(source);

  return match === null || match.index === undefined
    ? {}
    : {
        sourceRange: {
          end: sourcePosition(source, match.index + match[0].length),
          start: sourcePosition(source, match.index),
        },
      };
}

function sourcePosition(source: string, offset: number): BoundarySourcePosition {
  const lines = source.slice(0, offset).split("\n");
  return { column: (lines.at(-1)?.length ?? 0) + 1, line: lines.length };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function globMatches(value: string, pattern: string): boolean {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/gu, "\\$&");
  const expression = escaped
    .replaceAll("**", "\u0000")
    .replaceAll("*", "[^/]*")
    .replaceAll("\u0000", ".*");
  return new RegExp(`^${expression}$`, "u").test(value);
}

function resolveProjectRelativePath(projectRoot: string, relativePath: string): string {
  return `${projectRoot}/${relativePath}`;
}

function summarizeBoundaryRoutes(routes: readonly BoundaryReportRoute[]): BoundaryReportSummary {
  const components = routes.flatMap((route) => route.components);

  return {
    clientBoundaries: countClassification(components, "client-boundary"),
    clientRoutes: routes.filter((route) => route.classification === "client-route").length,
    serverOnlyComponents: countClassification(components, "server-only"),
    serverRenderComponents: countClassification(components, "server-render"),
    serverRenderRoutes: routes.filter((route) => route.classification === "server-render").length,
    sharedComponents: countClassification(components, "shared"),
    unknownComponents: countClassification(components, "unknown"),
  };
}

function countClassification(
  components: readonly BoundaryReportComponent[],
  classification: ClientRouteComponentClassification,
): number {
  return components.filter((component) => component.classification === classification).length;
}

function projectRelativePath(projectRoot: string, file: string): string {
  const value = relative(projectRoot, file).split(sep).join("/");
  return value === "" ? "." : value;
}

function formatComponentOrigin(origin: ClientRouteComponentOrigin): string {
  if (origin === "use-client-directive") return ' ("use client")';
  if (origin === "use-server-directive") return ' ("use server")';
  if (origin === "client-filename") return " (.client.*)";
  if (origin === "compat-filename") return " (.compat.*)";
  if (origin === "inferred-client-runtime") return " (inferred)";
  if (origin === "server-only-import") return " (server-only import)";
  if (origin === "unresolved-reference") return " (unresolved)";
  return "";
}

function plural(count: number, singular: string): string {
  return count === 1 ? singular : `${singular}s`;
}
