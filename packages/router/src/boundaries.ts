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
import { resolveAppRouterProjectOptions, type AppRouterProjectOptions } from "./config.js";
import { stripRouteClientSource } from "./route-source.js";
import { scanAppRoutes } from "./routes.js";

export interface BoundaryReportComponent {
  classification: ClientRouteComponentClassification;
  exportName: string;
  file: string;
  origin: ClientRouteComponentOrigin;
}

export interface BoundaryReportRoute {
  classification: "client-route" | "server-render";
  components: readonly BoundaryReportComponent[];
  entry: string;
  path: string;
}

export interface BoundaryReportSummary {
  clientBoundaries: number;
  clientRoutes: number;
  serverOnlyComponents: number;
  serverRenderComponents: number;
  serverRenderRoutes: number;
  sharedComponents: number;
  unknownComponents: number;
}

export interface BoundaryReport {
  diagnostics: readonly ClientRouteInferenceDiagnostic[];
  routes: readonly BoundaryReportRoute[];
  summary: BoundaryReportSummary;
  version: 1;
}

export interface CreateBoundaryReportRouteInput {
  components: readonly ClientRouteComponent[];
  diagnostics: readonly ClientRouteInferenceDiagnostic[];
  entry: string;
  path: string;
}

export interface CreateBoundaryReportInput {
  projectRoot: string;
  routes: readonly CreateBoundaryReportRouteInput[];
}

export interface AnalyzeAppBoundariesOptions extends AppRouterProjectOptions {
  viteConfig?: Pick<UserConfig, "define" | "plugins"> | undefined;
}

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
      };
    }),
  );

  return createBoundaryReport({
    projectRoot: project.projectRoot,
    routes: analyzedRoutes,
  });
}

export function createBoundaryReport(input: CreateBoundaryReportInput): BoundaryReport {
  const routes = input.routes
    .map((route): BoundaryReportRoute => {
      const entry = projectRelativePath(input.projectRoot, route.entry);
      const components = normalizeComponents(input.projectRoot, entry, route.components);

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
        entry,
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
    .map((diagnostic) => ({
      ...diagnostic,
      filename: projectRelativePath(input.projectRoot, diagnostic.filename),
    }))
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
): BoundaryReportComponent[] {
  const unique = new Map<string, BoundaryReportComponent>();

  for (const component of components) {
    const normalized = {
      ...component,
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
  return "";
}

function plural(count: number, singular: string): string {
  return count === 1 ? singular : `${singular}s`;
}
