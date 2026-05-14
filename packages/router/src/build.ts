import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { transform } from "@modular-react/compiler";
import {
  buildClientRouteOutput,
  clientScriptForPath,
  detectClientNavigationHint,
  isClientRouteSource,
  routeIdForPath,
  type ClientRouteManifestEntry,
} from "./client.js";
import { importAppRouterSourceModule } from "./module-runner.js";
import { scanAppRoutes } from "./routes.js";
import type { AppRoute } from "./routes.js";
import { renderAppRequest } from "./render.js";
import {
  hasGenerateStaticParamsExport,
  hasPrerenderExport,
  isStreamRouteSource,
  stripRouteBuildExports,
  stripRouteClientOnlyExports,
} from "./route-source.js";

const nativeEscapeTransform = {
  batchImportName: "escapeHtmlBatch",
  batchImportSource: "@modular-react/router/internal/native-escape",
} as const;

export interface BuildAppOptions {
  appDir: string;
  outDir: string;
}

export interface BuildAppResult {
  routes: AppRoute[];
}

export interface BuiltServerManifest {
  version: 1;
  files: Record<string, string>;
  prerenderedRoutes?: Record<string, BuiltPrerenderedRoute>;
  routes: AppRoute[];
  serverModules?: Record<string, BuiltServerModuleArtifact>;
}

export interface BuiltServerModuleArtifact {
  stream?: BuiltServerModuleOutput;
  string?: BuiltServerModuleOutput;
}

export interface BuiltServerModuleOutput {
  code: string;
  sourceHash: string;
}

export interface BuiltPrerenderedRoute {
  headers: Record<string, string>;
  html: string;
  status: number;
}

type StaticParams = Record<string, string | number | boolean | readonly string[]>;

export async function buildApp(options: BuildAppOptions): Promise<BuildAppResult> {
  const routes = await scanAppRoutes({ appDir: options.appDir });
  const serverDir = join(options.outDir, "server");
  const clientDir = join(options.outDir, "client");

  await validateProductionRoutes(routes);

  await rm(options.outDir, { force: true, recursive: true });
  await mkdir(serverDir, { recursive: true });
  await mkdir(clientDir, { recursive: true });
  await mkdir(join(clientDir, ".vite"), { recursive: true });
  await mkdir(join(clientDir, "assets", "routes"), { recursive: true });

  const files = await collectBuildFiles(options.appDir);
  const serverModules = buildServerModuleArtifacts({
    appDir: options.appDir,
    files,
    routes,
  });
  const serverRoutes = routes.map((route) => ({
    ...route,
    file: relative(options.appDir, route.file),
  }));
  const clientRoutes = await Promise.all(
    routes.map((route) => writeClientRouteBundle(route, clientDir)),
  );
  const prerenderedRoutes = await prerenderStaticRoutes({
    appDir: options.appDir,
    clientRoutes,
    routes,
  });

  await writeFile(
    join(serverDir, "manifest.json"),
    JSON.stringify(
      {
        version: 1,
        routes: serverRoutes,
        files,
        prerenderedRoutes,
        serverModules,
      } satisfies BuiltServerManifest,
      null,
      2,
    ),
  );
  await writeFile(
    join(clientDir, "manifest.json"),
    JSON.stringify({ routes: clientRoutes }, null, 2),
  );
  await writeFile(
    join(clientDir, ".vite", "manifest.json"),
    JSON.stringify(viteManifestFromClientRoutes(clientRoutes), null, 2),
  );

  return { routes };
}

async function prerenderStaticRoutes(options: {
  appDir: string;
  clientRoutes: readonly ClientRouteManifestEntry[];
  routes: readonly AppRoute[];
}): Promise<Record<string, BuiltPrerenderedRoute>> {
  const clientScripts = new Map(
    options.clientRoutes.flatMap((route) =>
      route.client && route.script !== undefined ? [[route.path, route.script]] : [],
    ),
  );
  const prerendered: Record<string, BuiltPrerenderedRoute> = {};

  for (const route of options.routes) {
    if (route.kind !== "page") {
      continue;
    }

    const source = await readFile(route.file, "utf8");

    if (!hasPrerenderExport(source)) {
      continue;
    }

    for (const pathname of await prerenderPathsForRoute(route, source)) {
      const response = await renderAppRequest({
        appDir: options.appDir,
        clientScripts,
        request: new Request(`http://mreact.local${pathname}`),
      });
      const headers: Record<string, string> = {};

      response.headers.forEach((value, key) => {
        headers[key] = value;
      });
      prerendered[pathname] = {
        headers,
        html: await response.text(),
        status: response.status,
      };
    }
  }

  return prerendered;
}

async function prerenderPathsForRoute(route: AppRoute, source: string): Promise<string[]> {
  if (route.segments.every((segment) => segment.kind === "static")) {
    return [route.path];
  }

  if (!hasGenerateStaticParamsExport(source)) {
    return [];
  }

  const module = await importAppRouterSourceModule<{
    generateStaticParams?: () => Iterable<StaticParams> | PromiseLike<Iterable<StaticParams>>;
  }>({
    code: source,
    label: `generate-static-params:${route.file}`,
    resolveDir: dirname(route.file),
    sourcefile: route.file,
  });
  const params = await module.generateStaticParams?.();

  if (params === undefined) {
    return [];
  }

  return Array.from(params, (entry) => routePathFromParams(route, entry));
}

function routePathFromParams(route: AppRoute, params: StaticParams): string {
  const parts = route.segments.flatMap((segment) => {
    if (segment.kind === "static") {
      return [segment.value];
    }

    const value = params[segment.name];

    if (value === undefined) {
      throw new Error(`${route.file}: generateStaticParams() is missing "${segment.name}".`);
    }

    if (segment.kind === "catch-all") {
      const values = Array.isArray(value) ? value : String(value).split("/");

      return values.map((part) => encodeURIComponent(String(part)));
    }

    return [encodeURIComponent(String(value))];
  });

  return `/${parts.join("/")}`;
}

function buildServerModuleArtifacts(options: {
  appDir: string;
  files: Record<string, string>;
  routes: readonly AppRoute[];
}): Record<string, BuiltServerModuleArtifact> {
  const routeByFile = new Map(
    options.routes.map((route) => [relative(options.appDir, route.file), route]),
  );
  const artifacts: Record<string, BuiltServerModuleArtifact> = {};

  for (const [file, source] of Object.entries(options.files)) {
    if (!isServerComponentFile(file)) {
      continue;
    }

    const route = routeByFile.get(file);
    const serverOutput = route !== undefined && isStreamRouteSource(source) ? "stream" : "string";
    const code = route === undefined ? source : stripRouteBuildExports(source);
    const output = transform({
      code,
      dev: false,
      filename: join(options.appDir, file),
      serverEscape: nativeEscapeTransform,
      serverOutput,
      target: "server",
    });
    const fatalDiagnostics = output.diagnostics.filter(
      (diagnostic) => diagnostic.code !== "MR_UNSUPPORTED_SERVER_EVENT_HANDLER",
    );

    if (fatalDiagnostics.length > 0) {
      throw new Error(
        `${file}: ${fatalDiagnostics
          .map((diagnostic) => `${diagnostic.code}: ${diagnostic.message}`)
          .join("\n")}`,
      );
    }

    artifacts[file] = {
      [serverOutput]: {
        code: output.code,
        sourceHash: hashText(code),
      },
    };
  }

  return artifacts;
}

function isServerComponentFile(file: string): boolean {
  return /(?:^|\/)(?:page|layout|template|loading|error|not-found)(?:\.mreact)?\.tsx$/.test(file);
}

function viteManifestFromClientRoutes(routes: ClientRouteManifestEntry[]): Record<
  string,
  {
    file: string;
    isEntry: true;
    name: string;
    src: string;
  }
> {
  const manifest: Record<
    string,
    {
      file: string;
      isEntry: true;
      name: string;
      src: string;
    }
  > = {};

  for (const route of routes) {
    if (!route.client || route.script === undefined || route.devScript === undefined) {
      continue;
    }

    manifest[route.devScript] = {
      file: route.script,
      isEntry: true,
      name: route.routeId ?? routeIdForPath(route.path),
      src: route.devScript,
    };
  }

  return manifest;
}

async function writeClientRouteBundle(
  route: AppRoute,
  clientDir: string,
): Promise<ClientRouteManifestEntry> {
  if (route.kind === "server") {
    return { path: route.path, kind: route.kind, client: false };
  }

  const source = await readFile(route.file, "utf8");
  const clientSource = stripRouteClientOnlyExports(source);

  if (!isClientRouteSource(clientSource)) {
    return { path: route.path, kind: route.kind, client: false };
  }

  let output: Awaited<ReturnType<typeof buildClientRouteOutput>>;

  try {
    output = await buildClientRouteOutput({
      code: clientSource,
      clientNavigation: detectClientNavigationHint(source),
      filename: route.file,
      minify: true,
      routePath: route.path,
      sourceMap: true,
    });
  } catch (error) {
    throw new Error(
      `Failed to build client bundle for ${route.path} (${route.file}).\n${errorMessage(error)}`,
      { cause: error },
    );
  }

  const routeId = routeIdForPath(route.path);
  const hash = createHash("sha256")
    .update(output.code)
    .update(output.map ?? "")
    .digest("hex")
    .slice(0, 8);
  const script = `assets/routes/${routeId}.${hash}.js`;
  const sourceMap = `${script}.map`;
  const scriptBasename = script.split("/").pop() ?? "route.js";
  const codeWithSourceMap = output.code.replace(
    /\/\/# sourceMappingURL=route\.js\.map\s*$/,
    `//# sourceMappingURL=${scriptBasename}.map`,
  );
  const code =
    output.map === undefined || codeWithSourceMap.includes("sourceMappingURL=")
      ? codeWithSourceMap
      : `${codeWithSourceMap}\n//# sourceMappingURL=${scriptBasename}.map`;

  await mkdir(dirname(join(clientDir, script)), { recursive: true });
  await writeFile(join(clientDir, script), code);
  if (output.map !== undefined) {
    await writeFile(join(clientDir, sourceMap), output.map);
  }

  return {
    bytes: Buffer.byteLength(code),
    path: route.path,
    kind: route.kind,
    client: true,
    routeId,
    script,
    sourceMap,
    devScript: clientScriptForPath(route.path),
  };
}

async function validateProductionRoutes(routes: AppRoute[]): Promise<void> {
  for (const route of routes) {
    if (route.kind !== "page") {
      continue;
    }

    const source = await readFile(route.file, "utf8");
    const output = transform({
      code: stripRouteBuildExports(source),
      dev: false,
      filename: route.file,
      serverEscape: nativeEscapeTransform,
      serverOutput: isStreamRouteSource(source) ? "stream" : "string",
      target: "server",
    });
    const fatalDiagnostics = output.diagnostics.filter(
      (diagnostic) => diagnostic.code !== "MR_UNSUPPORTED_SERVER_EVENT_HANDLER",
    );

    if (fatalDiagnostics.length > 0) {
      throw new Error(
        `${route.file}: ${fatalDiagnostics
          .map((diagnostic) => `${diagnostic.code}: ${diagnostic.message}`)
          .join("\n")}`,
      );
    }
  }
}

async function collectBuildFiles(appDir: string): Promise<Record<string, string>> {
  const files: Record<string, string> = {};

  for (const file of await collectFiles(appDir)) {
    files[relative(appDir, file)] = await readFile(file, "utf8");
  }

  return files;
}

async function collectFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const path = join(directory, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await collectFiles(path)));
      continue;
    }

    if (entry.isFile()) {
      files.push(path);
    }
  }

  return files;
}

function hashText(text: string): string {
  return createHash("sha256").update(text).digest("hex").slice(0, 16);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
