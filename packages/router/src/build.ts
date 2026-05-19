import { createHash } from "node:crypto";
import { access, cp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative, sep } from "node:path";
import { build as bundle, type Plugin } from "esbuild";
import {
  collectTopLevelValueExportNames,
  formatDiagnostic,
  hasModuleDirective,
  transform,
} from "@reckona/mreact-compiler";
import type { ServerOutputMode } from "@reckona/mreact-compiler";
import {
  buildClientRouteOutput,
  buildNavigationRuntimeBundle,
  clientScriptForPath,
  createClientRouteInferenceCache,
  detectClientNavigationHint,
  detectNavigationRuntimeHint,
  formatClientRouteInferenceDiagnostic,
  inferClientRouteModule,
  isClientRouteModule,
  routeIdForPath,
  type ClientRouteManifestEntry,
  type ClientRouteInferenceCache,
} from "./client.js";
import { bundleAppRouterSourceModule, importAppRouterSourceModule } from "./module-runner.js";
import { scanAppRoutes } from "./routes.js";
import type { AppRoute } from "./routes.js";
import {
  resolveAppRouterProjectOptions,
  resolveBuildTargets,
  type AppRouterProjectOptions,
  type AppRouterBuildTarget,
  type AppRouterClientSourceMapMode,
  type ResolvedAppRouterProject,
} from "./config.js";
import type { ModuleMetadata } from "@reckona/mreact-compiler";
import type { RouteCachePolicy } from "./cache.js";
import { routeCachePolicyFromSource } from "./cache.js";
import { bundleMiddlewareModuleCode, renderAppRequest } from "./render.js";
import { createAppRouterImportPolicyPlugin, type AppRouterImportPolicy } from "./import-policy.js";
import {
  hasGenerateStaticParamsExport,
  hasLoaderExport,
  hasPrerenderExport,
  isStreamRouteSource,
  stripRouteBuildExports,
  stripRouteClientOnlyExports,
  stripRouteLoaderOnlyExports,
  stripRouteMetadataOnlyExports,
  stripRouteRequestOnlyExports,
} from "./route-source.js";
import { workspacePackageFile } from "./workspace-packages.js";

const nativeEscapeTransform = {
  batchImportName: "escapeHtmlBatch",
  batchImportSource: "@reckona/mreact-router/native-escape",
} as const;

export interface BuildAppOptions extends AppRouterProjectOptions {
  outDir: string;
  targets?: readonly AppRouterBuildTarget[] | undefined;
}

export interface BuildAppResult {
  routes: AppRoute[];
}

export interface BuiltServerManifest {
  allowedSourceDirs?: readonly string[];
  assetBaseUrl?: string;
  version: 1;
  files: Record<string, string>;
  prerenderedRoutes?: Record<string, BuiltPrerenderedRoute>;
  publicAssetBaseUrl?: string;
  routesDir?: string;
  serverActionManifest?: BuiltServerActionReference[];
  serverModuleFiles?: Record<string, string>;
  routes: AppRoute[];
  serverModules?: Record<string, BuiltServerModuleArtifact>;
}

export interface BuiltServerActionReference {
  moduleId: string;
  exportName: string;
}

export interface BuiltServerModuleArtifact {
  analysis?: BuiltRouteSourceAnalysisSummary;
  loader?: BuiltServerModuleOutput;
  routeMetadata?: BuiltServerModuleOutput;
  request?: BuiltServerModuleOutput;
  stream?: BuiltServerModuleOutput;
  string?: BuiltServerModuleOutput;
}

export interface BuiltRouteSourceAnalysisSummary {
  authIncludesClaims: boolean;
  cachePolicy?: RouteCachePolicy | undefined;
  clientBoundaryImports: readonly string[];
  clientRoute: boolean;
  hasLoader: boolean;
  routeCode: string;
  routePath: string;
  sourceHash: string;
  streamRoute: boolean;
  usesRuntimeCacheControl: boolean;
}

export interface BuiltServerModuleOutput {
  code: string;
  metadata?: ModuleMetadata;
  sourceHash: string;
}

export interface BuiltPrerenderedRoute {
  headers: Record<string, string>;
  html: string;
  status: number;
}

type StaticParams = Record<string, string | number | boolean | readonly string[]>;

export async function buildApp(options: BuildAppOptions): Promise<BuildAppResult> {
  const project = resolveAppRouterProjectOptions(options);
  const buildTargets = resolveBuildTargets(options.targets ?? project.buildTargets);
  const shouldBuildCloudflare = buildTargets.includes("cloudflare");
  const routes = await scanAppRoutes({ appDir: project.routesDir });
  const serverDir = join(options.outDir, "server");
  const clientDir = join(options.outDir, "client");
  const cloudflareDir = join(options.outDir, "cloudflare");

  await validateProductionRoutes(routes);

  await rm(options.outDir, { force: true, recursive: true });
  await mkdir(serverDir, { recursive: true });
  await mkdir(clientDir, { recursive: true });
  if (shouldBuildCloudflare) {
    await mkdir(cloudflareDir, { recursive: true });
  }
  await mkdir(join(clientDir, ".vite"), { recursive: true });
  await mkdir(join(clientDir, "assets", "routes"), { recursive: true });
  await copyPublicAssets(project.publicDir, join(clientDir, "public"));

  const files = await collectBuildFiles(project.projectRoot, project.allowedSourceDirs);
  const serverActionManifest = collectBuildServerActionManifest({
    files,
    projectRoot: project.projectRoot,
    routesDir: project.routesDir,
  });
  const clientRouteInferenceCache = createClientRouteInferenceCache();
  const serverModules = await buildServerModuleArtifacts({
    clientRouteInferenceCache,
    files,
    project,
    projectRoot: project.projectRoot,
    routes,
  });
  const serverModuleFiles = await writeServerModuleArtifactFiles(serverDir, serverModules);
  const serverRoutes = routes.map((route) => ({
    ...route,
    file: relative(project.projectRoot, route.file),
  }));
  const clientRoutes = await Promise.all(
    routes.map((route) =>
      writeClientRouteBundle({
        clientDir,
        clientRouteInferenceCache,
        route,
        sourceMapDir: join(options.outDir, "source-maps", "client"),
        sourceMaps: project.clientSourceMaps,
      }),
    ),
  );
  const navigationRuntimeScript = clientRoutes.some(
    (route) => route.navigation === true && !route.client,
  )
    ? await writeNavigationRuntimeBundle(clientDir)
    : undefined;
  const clientManifestRoutes =
    navigationRuntimeScript === undefined
      ? clientRoutes
      : clientRoutes.map((route) =>
          route.navigation === true && !route.client
            ? { ...route, navigationScript: navigationRuntimeScript }
            : route,
        );
  const prerenderedRoutes = await prerenderStaticRoutes({
    appDir: project.routesDir,
    assetBaseUrl: project.assetBaseUrl,
    clientRoutes: clientManifestRoutes,
    routes,
  });
  if (shouldBuildCloudflare) {
    await writeCloudflareRouteModules({
      cloudflareDir,
      prerenderedRoutes,
      projectRoot: project.projectRoot,
      routesDir: project.routesDir,
      routes,
      serverModules,
    });
  }

  await writeFile(
    join(serverDir, "manifest.json"),
    JSON.stringify(
      {
        allowedSourceDirs: project.allowedSourceDirs.map((directory) =>
          relative(project.projectRoot, directory),
        ),
        ...(project.assetBaseUrl === undefined ? {} : { assetBaseUrl: project.assetBaseUrl }),
        version: 1,
        routes: serverRoutes,
        routesDir: relative(project.projectRoot, project.routesDir),
        files,
        prerenderedRoutes,
        ...(project.publicAssetBaseUrl === undefined
          ? {}
          : { publicAssetBaseUrl: project.publicAssetBaseUrl }),
        ...(serverActionManifest.length === 0 ? {} : { serverActionManifest }),
        ...(Object.keys(serverModuleFiles).length === 0 ? {} : { serverModuleFiles }),
      } satisfies BuiltServerManifest,
      null,
      2,
    ),
  );
  await writeFile(
    join(clientDir, "manifest.json"),
    JSON.stringify({ routes: clientManifestRoutes }, null, 2),
  );
  await writeFile(
    join(clientDir, ".vite", "manifest.json"),
    JSON.stringify(viteManifestFromClientRoutes(clientManifestRoutes), null, 2),
  );

  return { routes };
}

async function writeServerModuleArtifactFiles(
  serverDir: string,
  serverModules: Record<string, BuiltServerModuleArtifact>,
): Promise<Record<string, string>> {
  const files: Record<string, string> = {};
  const modulesDir = join(serverDir, "server-modules");

  for (const [file, artifact] of Object.entries(serverModules)) {
    const json = JSON.stringify(artifact);
    const artifactFile = `server-modules/${hashText(`${file}\0${json}`).slice(0, 16)}.json`;

    await mkdir(modulesDir, { recursive: true });
    await writeFile(join(serverDir, artifactFile), json);
    files[file] = artifactFile;
  }

  return files;
}

function collectBuildServerActionManifest(options: {
  files: Record<string, string>;
  projectRoot: string;
  routesDir: string;
}): BuiltServerActionReference[] {
  const entries: BuiltServerActionReference[] = [];
  const relativeRoutesDir = relative(options.projectRoot, options.routesDir);

  for (const [file, code] of Object.entries(options.files)) {
    if (!isAppRelativeFile(file, relativeRoutesDir) || !isSourceModuleFile(file)) {
      continue;
    }

    if (!hasModuleDirective({ code, directive: "use server", filename: file })) {
      continue;
    }

    const moduleId = moduleIdForBuildFile(file, relativeRoutesDir);

    for (const exportName of collectTopLevelValueExportNames({ code, filename: file })) {
      entries.push({ moduleId, exportName });
    }
  }

  return entries.sort((left, right) =>
    left.moduleId === right.moduleId
      ? left.exportName.localeCompare(right.exportName)
      : left.moduleId.localeCompare(right.moduleId),
  );
}

function isSourceModuleFile(file: string): boolean {
  return /\.(?:mreact\.tsx|tsx?|jsx?|mjs|mts|cjs|cts)$/.test(file);
}

function isAppRelativeFile(file: string, relativeRoutesDir: string): boolean {
  return relativeRoutesDir === "" || file === relativeRoutesDir || file.startsWith(`${relativeRoutesDir}/`);
}

function moduleIdForBuildFile(file: string, relativeRoutesDir: string): string {
  return relativeRoutesDir === "" ? file : file.slice(relativeRoutesDir.length + 1);
}

async function copyPublicAssets(publicDir: string, outDir: string): Promise<void> {
  try {
    await cp(publicDir, outDir, { force: true, recursive: true });
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return;
    }

    throw error;
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

async function prerenderStaticRoutes(options: {
  appDir: string;
  assetBaseUrl?: string | undefined;
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
        assetBaseUrl: options.assetBaseUrl,
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

async function buildServerModuleArtifacts(options: {
  clientRouteInferenceCache: ClientRouteInferenceCache;
  files: Record<string, string>;
  project: ResolvedAppRouterProject;
  projectRoot: string;
  routes: readonly AppRoute[];
}): Promise<Record<string, BuiltServerModuleArtifact>> {
  const routeByFile = new Map(
    options.routes.map((route) => [relative(options.projectRoot, route.file), route]),
  );
  const requestModuleFiles = new Set<string>();
  const requestModuleImportPolicy = {
    allowedPackages: await readDeclaredProjectPackages(options.project.projectRoot),
    allowedSourceDirs: options.project.allowedSourceDirs,
    projectRoot: options.project.projectRoot,
  } satisfies AppRouterImportPolicy;
  const artifacts: Record<string, BuiltServerModuleArtifact> = {};

  for (const [file, source] of Object.entries(options.files)) {
    const absoluteFile = join(options.projectRoot, file);
    const route = routeByFile.get(file);

    if (isMiddlewareFile(options.project.routesDir, absoluteFile)) {
      requestModuleFiles.add(file);
    }

    if (
      route?.kind === "server" ||
      (route?.kind === "page" && hasLoaderExport(source)) ||
      hasMetadataExport(source)
    ) {
      requestModuleFiles.add(file);
    }
  }

  for (const [file, source] of Object.entries(options.files)) {
    const absoluteFile = join(options.projectRoot, file);
    const route = routeByFile.get(file);
    const artifact: BuiltServerModuleArtifact = {};

    if (requestModuleFiles.has(file)) {
      if (route?.kind === "page" && hasLoaderExport(source)) {
        const code = await bundleRouteLoaderModuleCode({
          appDir: options.project.routesDir,
          code: stripRouteLoaderOnlyExports(source),
          filename: absoluteFile,
          importPolicy: requestModuleImportPolicy,
        });
        artifact.loader = {
          code,
          sourceHash: hashText(source),
        };
      }

      if (route?.kind === "page" && hasMetadataExport(source)) {
        const code = await bundleRouteMetadataModuleCode({
          appDir: options.project.routesDir,
          code: stripRouteMetadataOnlyExports(source),
          filename: absoluteFile,
          importPolicy: requestModuleImportPolicy,
        });
        artifact.routeMetadata = {
          code,
          sourceHash: hashText(source),
        };
      }

      artifact.request = {
        code: await buildRequestModuleArtifactCode({
          appDir: options.project.routesDir,
          filename: absoluteFile,
          importPolicy: requestModuleImportPolicy,
          routeKind: route?.kind,
          source,
        }),
        sourceHash: hashText(source),
      };
    }

    if (!isServerComponentFile(file)) {
      if (Object.keys(artifact).length > 0) {
        artifacts[file] = artifact;
      }
      continue;
    }

    const serverOutputs =
      route !== undefined && isStreamRouteSource(source)
        ? (["stream", "string"] as const)
        : (["string"] as const);
    const code = route === undefined ? source : stripRouteBuildExports(source);
    const clientInference = route === undefined
      ? { client: false, clientBoundaryImports: [], diagnostics: [] }
      : await inferClientRouteModule({
          cache: options.clientRouteInferenceCache,
          code: stripRouteClientOnlyExports(source),
          filename: join(options.projectRoot, file),
          routePath: route.path,
        });
    const clientBoundaryImports = clientInference.clientBoundaryImports;

    for (const diagnostic of clientInference.diagnostics) {
      console.warn(formatClientRouteInferenceDiagnostic(diagnostic));
    }

    if (route?.kind === "page") {
      artifact.analysis = builtRouteSourceAnalysisSummary({
        clientBoundaryImports,
        clientRoute: clientInference.client,
        route,
        routeCode: code,
        source,
      });
    }

    for (const serverOutput of serverOutputs) {
      const output = transform({
        code,
        clientBoundaryImports,
        dev: false,
        filename: join(options.projectRoot, file),
        serverEscape: nativeEscapeTransform,
        serverOutput,
        target: "server",
      });
      const fatalDiagnostics = output.diagnostics.filter(
        (diagnostic) => diagnostic.code !== "MR_UNSUPPORTED_SERVER_EVENT_HANDLER",
      );

      if (fatalDiagnostics.length > 0) {
        throw new Error(
          fatalDiagnostics.map((diagnostic) => formatDiagnostic(file, diagnostic)).join("\n"),
        );
      }

      artifact[serverOutput] = {
        code: output.code,
        metadata: output.metadata,
        sourceHash: hashText(code),
      };
    }

    artifacts[file] = artifact;
  }

  return artifacts;
}

function builtRouteSourceAnalysisSummary(options: {
  clientBoundaryImports: readonly string[];
  clientRoute: boolean;
  route: AppRoute;
  routeCode: string;
  source: string;
}): BuiltRouteSourceAnalysisSummary {
  const cachePolicy = routeCachePolicyFromSource(options.source);

  return {
    authIncludesClaims: authIncludesClaims(options.source),
    ...(cachePolicy === undefined ? {} : { cachePolicy }),
    clientBoundaryImports: options.clientBoundaryImports,
    clientRoute: options.clientRoute,
    hasLoader: hasLoaderExport(options.source),
    routeCode: options.routeCode,
    routePath: options.route.path,
    sourceHash: hashText(options.source),
    streamRoute: isStreamRouteSource(options.source),
    usesRuntimeCacheControl: usesRuntimeCacheControl(options.source),
  };
}

function usesRuntimeCacheControl(code: string): boolean {
  return /\bcacheControl\s*\(/.test(code);
}

function authIncludesClaims(code: string): boolean {
  return /\bexport\s+const\s+auth\s*=\s*["']include-claims["']\s*;?/.test(code);
}

async function buildRequestModuleArtifactCode(options: {
  appDir: string;
  filename: string;
  importPolicy: AppRouterImportPolicy;
  routeKind?: AppRoute["kind"] | undefined;
  source: string;
}): Promise<string> {
  if (isMiddlewareFile(options.appDir, options.filename)) {
    return await bundleMiddlewareModuleCode({
      appDir: options.appDir,
      code: options.source,
      file: options.filename,
      importPolicy: options.importPolicy,
    });
  }

  if (options.routeKind === "server") {
    return await bundleAppRouterSourceModule({
      code: options.source,
      label: `server-route:${options.filename}`,
      resolveDir: dirname(options.filename),
      sourcefile: options.filename,
    });
  }

  return await bundleRouteLoaderModuleCode({
    appDir: options.appDir,
    code: stripRouteRequestOnlyExports(options.source),
    filename: options.filename,
    importPolicy: options.importPolicy,
  });
}

async function bundleRouteLoaderModuleCode(options: {
  appDir: string;
  code: string;
  filename: string;
  importPolicy?: AppRouterImportPolicy | undefined;
}): Promise<string> {
  return await bundleRouteRequestModuleCode({
    ...options,
    label: "Loader",
  });
}

async function bundleRouteMetadataModuleCode(options: {
  appDir: string;
  code: string;
  filename: string;
  importPolicy?: AppRouterImportPolicy | undefined;
}): Promise<string> {
  return await bundleRouteRequestModuleCode({
    ...options,
    label: "Metadata",
  });
}

async function bundleRouteRequestModuleCode(options: {
  appDir: string;
  code: string;
  filename: string;
  importPolicy?: AppRouterImportPolicy | undefined;
  label: "Loader" | "Metadata";
}): Promise<string> {
  const output = await bundle({
    bundle: true,
    format: "esm",
    logLevel: "silent",
    platform: "node",
    plugins: [
      createAppRouterImportPolicyPlugin({
        appDir: options.appDir,
        importPolicy: options.importPolicy,
        label: options.label,
      }),
    ],
    write: false,
    jsx: "transform",
    jsxFactory: "__mreact_jsx",
    jsxFragment: "__mreact_fragment",
    stdin: {
      contents: options.code,
      loader: "tsx",
      resolveDir: dirname(options.filename),
      sourcefile: options.filename,
    },
  });
  const code = output.outputFiles[0]?.text;

  if (code === undefined) {
    throw new Error(`Failed to compile ${options.label.toLowerCase()} for ${options.filename}.`);
  }

  return code;
}

function isMiddlewareFile(appDir: string, file: string): boolean {
  return file === join(appDir, "middleware.ts") || file === join(appDir, "middleware.mreact.ts");
}

function hasMetadataExport(code: string): boolean {
  return /\bexport\s+const\s+metadata\s*=/.test(code);
}

async function readDeclaredProjectPackages(projectRoot: string): Promise<string[]> {
  try {
    const json = JSON.parse(await readFile(join(projectRoot, "package.json"), "utf8")) as {
      dependencies?: Record<string, unknown> | undefined;
      devDependencies?: Record<string, unknown> | undefined;
      optionalDependencies?: Record<string, unknown> | undefined;
      peerDependencies?: Record<string, unknown> | undefined;
    };

    return [
      ...Object.keys(json.dependencies ?? {}),
      ...Object.keys(json.devDependencies ?? {}),
      ...Object.keys(json.optionalDependencies ?? {}),
      ...Object.keys(json.peerDependencies ?? {}),
    ];
  } catch {
    return [];
  }
}

async function writeCloudflareRouteModules(options: {
  cloudflareDir: string;
  prerenderedRoutes: Record<string, BuiltPrerenderedRoute>;
  projectRoot: string;
  routesDir: string;
  routes: readonly AppRoute[];
  serverModules: Record<string, BuiltServerModuleArtifact>;
}): Promise<void> {
  const routesDir = join(options.cloudflareDir, "routes");
  const requiredRoutes = options.routes.filter((route) =>
    cloudflareRouteRequiresGeneratedModule(route, options.prerenderedRoutes),
  );
  const registryEntries: string[] = [];

  await mkdir(routesDir, { recursive: true });

  for (const route of requiredRoutes) {
    const routeFile = relative(options.projectRoot, route.file).replaceAll(sep, "/");
    const source = await readFile(route.file, "utf8");
    const routeId = routeIdForPath(route.path);
    const routeModuleFile = `routes/${routeId}.mjs`;
    let routeModuleExports: string[];

    const serverOutput = isStreamRouteSource(source) ? "stream" : "string";

    try {
      const componentOutput =
        serverOutput === "stream"
          ? await buildCloudflareStreamRouteComponentModule({
              filename: route.file,
              projectRoot: options.projectRoot,
              routesDir: options.routesDir,
              serverModules: options.serverModules,
            })
          : await buildCloudflareStringRouteComponentModule({
              filename: route.file,
              projectRoot: options.projectRoot,
              routesDir: options.routesDir,
              serverModules: options.serverModules,
            });
      const componentFile = `routes/${routeId}.${hashText(componentOutput).slice(0, 8)}.component.mjs`;

      await writeFile(join(options.cloudflareDir, componentFile), componentOutput);

      const componentImport = `./${componentFile.split("/").pop() ?? componentFile}`;
      routeModuleExports = [
        `export { default, App, slots } from ${JSON.stringify(componentImport)};`,
      ];
    } catch (error) {
      throw new Error(
        `Failed to build Cloudflare route module for ${routeFile}: ${errorMessage(error)}`,
      );
    }

    if (hasLoaderExport(source)) {
      try {
        const loaderOutput = await buildCloudflareRouteLoaderModule({
          filename: route.file,
          projectRoot: options.projectRoot,
        });
        const loaderFile = `routes/${routeId}.${hashText(loaderOutput).slice(0, 8)}.loader.mjs`;

        await writeFile(join(options.cloudflareDir, loaderFile), loaderOutput);
        const loaderImport = `./${loaderFile.split("/").pop() ?? loaderFile}`;
        routeModuleExports.push(`export { loader } from ${JSON.stringify(loaderImport)};`);
      } catch (error) {
        throw new Error(
          `Failed to build Cloudflare loader module for ${routeFile}: ${errorMessage(error)}`,
        );
      }
    }

    await writeFile(join(options.cloudflareDir, routeModuleFile), `${routeModuleExports.join("\n")}\n`);
    registryEntries.push(
      `${JSON.stringify(routeFile)}: () => import(${JSON.stringify(`./${routeModuleFile}`)})`,
    );
  }

  const registrySource = [
    `export const routeModules = {`,
    ...registryEntries.map((entry) => `  ${entry},`),
    `};`,
    `export default routeModules;`,
    ``,
  ].join("\n");

  await writeFile(join(options.cloudflareDir, "route-modules.mjs"), registrySource);
}

interface CloudflareShellFile {
  file: string;
  id: string;
  kind: "layout" | "template";
}

async function buildCloudflareServerComponentModule(options: {
  filename: string;
  projectRoot: string;
  serverOutput: ServerOutputMode;
  serverModules: Record<string, BuiltServerModuleArtifact>;
}): Promise<string> {
  const entry = `import * as routeModule from ${JSON.stringify(options.filename)};

const component = routeModule.default ?? routeModule.App ?? Object.values(routeModule).find((value) => typeof value === "function");
export const App = component;
export default component;
export const slots = routeModule.slots;`;

  return bundleCloudflareModule({
    entry,
    filename: `${options.filename}.mreact-cloudflare-component.js`,
    plugins: [
      cloudflareServerSourceTransformPlugin({
        projectRoot: options.projectRoot,
        serverOutput: options.serverOutput,
        serverModules: options.serverModules,
      }),
      cloudflareWorkspaceRuntimePlugin(),
    ],
    resolveDir: dirname(options.filename),
  });
}

async function buildCloudflareStringRouteComponentModule(options: {
  filename: string;
  projectRoot: string;
  routesDir: string;
  serverModules: Record<string, BuiltServerModuleArtifact>;
}): Promise<string> {
  const shellFiles = await cloudflareShellFilesForPage(options.routesDir, options.filename);

  if (shellFiles.length === 0) {
    return buildCloudflareServerComponentModule({
      filename: options.filename,
      projectRoot: options.projectRoot,
      serverModules: options.serverModules,
      serverOutput: "string",
    });
  }

  const pageModule = await buildCloudflareComponentExportModule({
    filename: options.filename,
    projectRoot: options.projectRoot,
    serverModules: options.serverModules,
    serverOutput: "string",
  });
  const shellModules = await Promise.all(
    shellFiles.map((shell) =>
      buildCloudflareComponentExportModule({
        filename: shell.file,
        projectRoot: options.projectRoot,
        serverModules: options.serverModules,
        serverOutput: "string",
      }),
    ),
  );
  const shellImports = shellFiles.map((_, index) => `import * as shell${index} from "mreact:shell-${index}";`);
  const shellDefinitions = shellFiles.map(
    (shell, index) =>
      `{ component: selectComponent(shell${index}, ${JSON.stringify(shell.file)}), id: ${JSON.stringify(shell.id)}, kind: ${JSON.stringify(shell.kind)} }`,
  );
  const entry = `import * as pageModule from "mreact:page";
${shellImports.join("\n")}

const pageComponent = selectComponent(pageModule, ${JSON.stringify(options.filename)});
const shells = [${shellDefinitions.join(", ")}];
export const slots = pageModule.slots;
export const App = renderCloudflareStringRoute;
export default renderCloudflareStringRoute;

async function renderCloudflareStringRoute(props) {
  const slotHtml = await renderRouteSlots(pageModule.slots, props);
  const layoutShells = await renderLayoutShells(shells, props, slotHtml);
  let html = "<!DOCTYPE html>" + cloudflareModulePreloadTag(props.clientManifest, props.route.path);
  for (const shell of layoutShells) {
    html += shell.prefix;
  }
  html += String(await pageComponent(props) ?? "");
  for (const shell of [...layoutShells].reverse()) {
    html += shell.suffix;
  }
  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8"
    }
  });
}

function selectComponent(module, label) {
  const component = module.default ?? module.App ?? Object.values(module).find((value) => typeof value === "function");
  if (typeof component !== "function") {
    throw new Error(\`No Cloudflare component export was found for \${label}.\`);
  }
  return component;
}

async function renderRouteSlots(slots, props) {
  if (slots === undefined) {
    return {};
  }
  const rendered = {};
  for (const [name, value] of Object.entries(slots)) {
    rendered[name] = typeof value === "function" ? String(await value(props) ?? "") : String(value ?? "");
  }
  return rendered;
}

${cloudflareShellRuntimeSource()}`;

  return bundleCloudflareVirtualModule({
    entry,
    filename: `${options.filename}.mreact-cloudflare-string-route.js`,
    modules: new Map([
      ["mreact:page", pageModule],
      ...shellModules.map((source, index) => [`mreact:shell-${index}`, source] as const),
    ]),
    plugins: [cloudflareWorkspaceRuntimePlugin()],
    resolveDir: dirname(options.filename),
  });
}

async function buildCloudflareStreamRouteComponentModule(options: {
  filename: string;
  projectRoot: string;
  routesDir: string;
  serverModules: Record<string, BuiltServerModuleArtifact>;
}): Promise<string> {
  const pageModule = await buildCloudflareComponentExportModule({
    filename: options.filename,
    projectRoot: options.projectRoot,
    serverModules: options.serverModules,
    serverOutput: "stream",
  });
  const shellFiles = await cloudflareShellFilesForPage(options.routesDir, options.filename);
  const shellModules = await Promise.all(
    shellFiles.map((shell) =>
      buildCloudflareComponentExportModule({
        filename: shell.file,
        projectRoot: options.projectRoot,
        serverModules: options.serverModules,
        serverOutput: "string",
      }),
    ),
  );
  const shellImports = shellFiles.map((_, index) => `import * as shell${index} from "mreact:shell-${index}";`);
  const shellDefinitions = shellFiles.map(
    (shell, index) =>
      `{ component: selectComponent(shell${index}, ${JSON.stringify(shell.file)}), id: ${JSON.stringify(shell.id)}, kind: ${JSON.stringify(shell.kind)} }`,
  );
  const entry = `import { createStringSink, renderOutOfOrderReorderScript, renderToReadableStream } from "@reckona/mreact-server";
import * as pageModule from "mreact:page";
${shellImports.join("\n")}

const pageComponent = selectComponent(pageModule, ${JSON.stringify(options.filename)});
const shells = [${shellDefinitions.join(", ")}];
export const slots = pageModule.slots;
export const App = renderCloudflareStreamRoute;
export default renderCloudflareStreamRoute;

function renderCloudflareStreamRoute(props) {
  const body = renderToReadableStream(async ($sink) => {
    const slotHtml = await renderRouteSlots(pageModule.slots, props);
    const layoutShells = await renderLayoutShells(shells, props, slotHtml);
    $sink.append("<!DOCTYPE html>");
    $sink.append(cloudflareModulePreloadTag(props.clientManifest, props.route.path));
    for (const shell of layoutShells) {
      $sink.append(shell.prefix);
    }
    await pageComponent($sink, props);
    renderOutOfOrderReorderScript($sink);
    for (const shell of [...layoutShells].reverse()) {
      $sink.append(shell.suffix);
    }
  });
  return new Response(body, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "x-mreact-stream": "1"
    }
  });
}

function selectComponent(module, label) {
  const component = module.default ?? module.App ?? Object.values(module).find((value) => typeof value === "function");
  if (typeof component !== "function") {
    throw new Error(\`No Cloudflare component export was found for \${label}.\`);
  }
  return component;
}

async function renderRouteSlots(slots, props) {
  if (slots === undefined) {
    return {};
  }
  const rendered = {};
  for (const [name, value] of Object.entries(slots)) {
    if (typeof value !== "function") {
      rendered[name] = String(value ?? "");
      continue;
    }
    const sink = createStringSink();
    await value(sink, props);
    await sink.drain();
    rendered[name] = sink.toString();
  }
  return rendered;
}

${cloudflareShellRuntimeSource()}`;

  return bundleCloudflareVirtualModule({
    entry,
    filename: `${options.filename}.mreact-cloudflare-stream-route.js`,
    modules: new Map([
      ["mreact:page", pageModule],
      ...shellModules.map((source, index) => [`mreact:shell-${index}`, source] as const),
    ]),
    plugins: [cloudflareWorkspaceRuntimePlugin()],
    resolveDir: dirname(options.filename),
  });
}

function cloudflareShellRuntimeSource(): string {
  return `async function renderLayoutShells(shells, props, namedSlots) {
  const slotContext = { consumedSlots: new Set(), namedSlots };
  const rendered = [];
  for (const shell of shells) {
    const html = await shell.component(props);
    rendered.push(splitLayoutSlot(markShellBoundary(String(html ?? ""), shell), slotContext));
  }
  return rendered;
}

function splitLayoutSlot(layoutHtml, slotContext) {
  const html = replaceNamedLayoutSlots(layoutHtml, slotContext);
  const match = findDefaultLayoutSlot(html);
  if (match === null) {
    return { prefix: html, suffix: "" };
  }
  return {
    prefix: html.slice(0, match.index),
    suffix: html.slice(match.index + match[0].length),
  };
}

function markShellBoundary(html, shell) {
  const attributeName = shell.kind === "layout" ? "data-mreact-layout-boundary" : "data-mreact-template-boundary";
  if (html.includes(\`\${attributeName}=\`)) {
    return html;
  }
  return html.replace(/<([A-Za-z][^\\s/>]*)([^>]*)>/, \`<$1$2 \${attributeName}="\${escapeHtmlAttribute(shell.id)}">\`);
}

const SLOT_TAG_PATTERN = /<slot\\b([^>]*)>(?:<\\/slot\\s*>)?/g;

function replaceNamedLayoutSlots(layoutHtml, slotContext) {
  return layoutHtml.replace(SLOT_TAG_PATTERN, (source, openAttributes) => {
    const name = readSlotName(openAttributes);
    if (name === undefined || name === "default") {
      return source;
    }
    if (Object.hasOwn(slotContext.namedSlots, name)) {
      slotContext.consumedSlots.add(name);
      return slotContext.namedSlots[name] ?? "";
    }
    return "";
  });
}

function findDefaultLayoutSlot(html) {
  SLOT_TAG_PATTERN.lastIndex = 0;
  for (;;) {
    const match = SLOT_TAG_PATTERN.exec(html);
    if (match === null) {
      return null;
    }
    const name = readSlotName(match[1] ?? "");
    if (name === undefined || name === "default") {
      return match;
    }
  }
}

function readSlotName(attributes) {
  const match = /\\bname\\s*=\\s*(?:"([^"]*)"|'([^']*)')/.exec(attributes);
  return match?.[1] ?? match?.[2];
}

function cloudflareModulePreloadTag(manifest, routePath) {
  const script = manifest.routes.find((route) => route.path === routePath)?.script;
  return script === undefined
    ? ""
    : \`<link rel="modulepreload" href="/_mreact/client/\${escapeHtmlAttribute(script)}">\`;
}

function escapeHtmlAttribute(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;");
}`;
}

async function buildCloudflareComponentExportModule(options: {
  filename: string;
  projectRoot: string;
  serverModules: Record<string, BuiltServerModuleArtifact>;
  serverOutput: ServerOutputMode;
}): Promise<string> {
  const entry = `import * as routeModule from ${JSON.stringify(options.filename)};

const component = routeModule.default ?? routeModule.App ?? Object.values(routeModule).find((value) => typeof value === "function");
export const App = component;
export default component;
export const slots = routeModule.slots;`;

  return bundleCloudflareModule({
    entry,
    filename: `${options.filename}.mreact-cloudflare-${options.serverOutput}-component.js`,
    plugins: [
      cloudflareServerSourceTransformPlugin({
        projectRoot: options.projectRoot,
        serverOutput: options.serverOutput,
        serverModules: options.serverModules,
      }),
      cloudflareWorkspaceRuntimePlugin(),
    ],
    resolveDir: dirname(options.filename),
  });
}

async function buildCloudflareRouteLoaderModule(options: {
  filename: string;
  projectRoot: string;
}): Promise<string> {
  const entry = `export { loader } from ${JSON.stringify(options.filename)};`;

  return bundleCloudflareModule({
    entry,
    filename: `${options.filename}.mreact-cloudflare-loader.js`,
    plugins: [cloudflareWorkspaceRuntimePlugin()],
    resolveDir: dirname(options.filename),
  });
}

async function bundleCloudflareModule(options: {
  entry: string;
  filename: string;
  plugins: Plugin[];
  resolveDir: string;
}): Promise<string> {
  const output = await bundle({
    bundle: true,
    format: "esm",
    logLevel: "silent",
    minify: true,
    platform: "browser",
    plugins: options.plugins,
    target: "es2022",
    write: false,
    stdin: {
      contents: options.entry,
      loader: "js",
      resolveDir: options.resolveDir,
      sourcefile: options.filename,
    },
  });
  const code = output.outputFiles[0]?.text;

  if (code === undefined) {
    throw new Error(`Failed to build Cloudflare route module for ${options.filename}.`);
  }

  return code;
}

async function bundleCloudflareVirtualModule(options: {
  entry: string;
  filename: string;
  modules: ReadonlyMap<string, string>;
  plugins: Plugin[];
  resolveDir: string;
}): Promise<string> {
  return bundleCloudflareModule({
    entry: options.entry,
    filename: options.filename,
    plugins: [
      {
        name: "mreact-cloudflare-virtual-modules",
        setup(buildApi) {
          buildApi.onResolve({ filter: /^mreact:/ }, (args) => ({
            namespace: "mreact-cloudflare-virtual",
            path: args.path,
          }));
          buildApi.onLoad({ filter: /.*/, namespace: "mreact-cloudflare-virtual" }, (args) => {
            const contents = options.modules.get(args.path);

            if (contents === undefined) {
              throw new Error(`Missing virtual Cloudflare module ${args.path}.`);
            }

            return {
              contents,
              loader: "js",
              resolveDir: options.resolveDir,
            };
          });
        },
      },
      ...options.plugins,
    ],
    resolveDir: options.resolveDir,
  });
}

async function cloudflareShellFilesForPage(
  routesDir: string,
  pageFile: string,
): Promise<CloudflareShellFile[]> {
  const relativeDir = relative(routesDir, dirname(pageFile));
  const parts = relativeDir === "" ? [] : relativeDir.split(sep);
  const directories = [routesDir];
  const files: CloudflareShellFile[] = [];

  for (let index = 0; index < parts.length; index += 1) {
    directories.push(join(routesDir, ...parts.slice(0, index + 1)));
  }

  for (const directory of directories) {
    const shellId = cloudflareShellBoundaryId(routesDir, directory);

    for (const [filename, kind] of [
      ["layout.tsx", "layout"],
      ["layout.mreact.tsx", "layout"],
      ["template.tsx", "template"],
      ["template.mreact.tsx", "template"],
    ] as const) {
      const candidate = join(directory, filename);

      try {
        await access(candidate);
        files.push({ file: candidate, id: shellId, kind });
      } catch {
        // Missing shell files are allowed.
      }
    }
  }

  return files;
}

function cloudflareShellBoundaryId(routesDir: string, directory: string): string {
  const relativeDirectory = relative(routesDir, directory);

  return relativeDirectory === ""
    ? "root"
    : relativeDirectory.replaceAll(sep, "/").replace(/[^A-Za-z0-9_$/-]/g, "_");
}

function cloudflareServerSourceTransformPlugin(options: {
  projectRoot: string;
  serverOutput: ServerOutputMode;
  serverModules: Record<string, BuiltServerModuleArtifact>;
}): Plugin {
  return {
    name: "mreact-cloudflare-server-source-transform",
    setup(buildApi) {
      buildApi.onLoad({ filter: /(?:\.mreact)?\.[cm]?[jt]sx$/ }, async (args) => {
        if (args.path.includes(`${sep}node_modules${sep}`)) {
          return undefined;
        }

        const source = await readFile(args.path, "utf8");
        const serverSource = isServerComponentFile(args.path) ? stripRouteBuildExports(source) : source;
        const sourceHash = hashText(serverSource);
        const routeFile = relative(options.projectRoot, args.path).replaceAll(sep, "/");
        const artifact = options.serverModules[routeFile]?.[options.serverOutput];
        const contents =
          artifact !== undefined && artifact.sourceHash === sourceHash
            ? artifact.code
            : transformCloudflareServerSource({
                filename: args.path,
                serverOutput: options.serverOutput,
                source: serverSource,
              });

        return {
          contents,
          loader: "js",
          resolveDir: dirname(args.path),
        };
      });
    },
  };
}

function transformCloudflareServerSource(options: {
  filename: string;
  serverOutput: ServerOutputMode;
  source: string;
}): string {
  const output = transform({
    code: options.source,
    dev: false,
    filename: options.filename,
    serverEscape: nativeEscapeTransform,
    serverOutput: options.serverOutput,
    target: "server",
  });
  const fatalDiagnostics = output.diagnostics.filter(
    (diagnostic) => diagnostic.code !== "MR_UNSUPPORTED_SERVER_EVENT_HANDLER",
  );

  if (fatalDiagnostics.length > 0) {
    throw new Error(
      fatalDiagnostics.map((diagnostic) => formatDiagnostic(options.filename, diagnostic)).join("\n"),
    );
  }

  return output.code;
}

function cloudflareWorkspaceRuntimePlugin(): Plugin {
  const packageFile = (
    monorepoDir: string,
    packageName: string,
    entry: string,
    sourceExtension?: "ts" | "tsx" | undefined,
  ): string =>
    workspacePackageFile({
      currentFileUrl: import.meta.url,
      entry,
      monorepoDir,
      packageName,
      ...(sourceExtension === undefined ? {} : { sourceExtension }),
    });
  const routerCachePath = packageFile("router", "@reckona/mreact-router", "cache");
  const routerCookiesPath = packageFile("router", "@reckona/mreact-router", "cookies");
  const routerI18nPath = packageFile("router", "@reckona/mreact-router", "i18n");
  const routerLinkPath = packageFile("router", "@reckona/mreact-router", "link");
  const routerNavigationPath = packageFile("router", "@reckona/mreact-router", "navigation");
  const runtimePaths = new Map([
    ["@reckona/mreact", packageFile("react", "@reckona/mreact", "index")],
    ["@reckona/mreact/jsx-dev-runtime", packageFile("react", "@reckona/mreact", "jsx-dev-runtime")],
    ["@reckona/mreact/jsx-runtime", packageFile("react", "@reckona/mreact", "jsx-runtime")],
    ["@reckona/mreact-auth", packageFile("auth", "@reckona/mreact-auth", "index")],
    ["@reckona/mreact-compat", packageFile("react-compat", "@reckona/mreact-compat", "index")],
    [
      "@reckona/mreact-compat/event-priority",
      packageFile("react-compat", "@reckona/mreact-compat", "event-priority"),
    ],
    ["@reckona/mreact-compat/flight", packageFile("react-compat", "@reckona/mreact-compat", "flight")],
    ["@reckona/mreact-compat/internal", packageFile("react-compat", "@reckona/mreact-compat", "internal")],
    [
      "@reckona/mreact-compat/jsx-dev-runtime",
      packageFile("react-compat", "@reckona/mreact-compat", "jsx-dev-runtime"),
    ],
    [
      "@reckona/mreact-compat/jsx-runtime",
      packageFile("react-compat", "@reckona/mreact-compat", "jsx-runtime"),
    ],
    ["@reckona/mreact-compat/scheduler", packageFile("react-compat", "@reckona/mreact-compat", "scheduler")],
    ["@reckona/mreact-query", packageFile("query", "@reckona/mreact-query", "index")],
    ["@reckona/mreact-reactive-core", packageFile("reactive-core", "@reckona/mreact-reactive-core", "index")],
    ["@reckona/mreact-router/link", routerLinkPath],
    ["@reckona/mreact-router/session", packageFile("router", "@reckona/mreact-router", "session")],
    ["@reckona/mreact-server", packageFile("server", "@reckona/mreact-server", "index")],
    [
      "@reckona/mreact-shared/html-escape",
      packageFile("shared", "@reckona/mreact-shared", "html-escape"),
    ],
  ]);

  return {
    name: "mreact-cloudflare-workspace-runtime",
    setup(buildApi) {
      buildApi.onResolve({ filter: /^@reckona\/mreact-router\/(?:internal\/)?native-escape$/ }, () => ({
        namespace: "mreact-cloudflare-native-escape",
        path: "native-escape",
      }));
      buildApi.onResolve({ filter: /^@reckona\/mreact-router$/ }, () => ({
        namespace: "mreact-cloudflare-router-index",
        path: "index",
      }));
      buildApi.onResolve({ filter: /^@reckona\/mreact(?:-[\w-]+)?(?:\/[\w/-]+)?$/ }, (args) => {
        const path = runtimePaths.get(args.path);

        return path === undefined ? undefined : { path };
      });
      buildApi.onLoad({ filter: /^native-escape$/, namespace: "mreact-cloudflare-native-escape" }, () => ({
        contents: `function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) =>
    char === "&" ? "&amp;" : char === "<" ? "&lt;" : char === ">" ? "&gt;" : char === '"' ? "&quot;" : "&#39;"
  );
}
export function escapeHtmlBatch(values) {
  return values.map(escapeHtml);
}`,
        loader: "js",
      }));
      buildApi.onLoad({ filter: /^index$/, namespace: "mreact-cloudflare-router-index" }, () => ({
        contents: `export { cacheControl, revalidatePath } from ${JSON.stringify(routerCachePath)};
export { deleteCookie, parseCookieHeader, serializeCookie, setCookie } from ${JSON.stringify(routerCookiesPath)};
export { defineMessages, detectLocale } from ${JSON.stringify(routerI18nPath)};
export { Link, linkProps } from ${JSON.stringify(routerLinkPath)};
export { cookies, headers, html, json, next, notFound, redirect, redirectExternal, rewrite } from ${JSON.stringify(routerNavigationPath)};`,
        loader: "js",
        resolveDir: dirname(routerNavigationPath),
      }));
      buildApi.onLoad({ filter: /(?:^|[/\\])packages[/\\]server[/\\](?:src|dist)[/\\]native-flight\.[jt]s$/ }, () => ({
        contents: `export function getNativeFlight() {
  return undefined;
}`,
        loader: "js",
      }));
    },
  };
}

function cloudflareRouteRequiresGeneratedModule(
  route: AppRoute,
  prerenderedRoutes: Record<string, BuiltPrerenderedRoute>,
): boolean {
  return (
    route.kind === "page" &&
    (route.segments.some((segment) => segment.kind !== "static") ||
      prerenderedRoutes[route.path] === undefined)
  );
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

async function writeClientRouteBundle(options: {
  clientDir: string;
  clientRouteInferenceCache: ClientRouteInferenceCache;
  route: AppRoute;
  sourceMapDir: string;
  sourceMaps: AppRouterClientSourceMapMode;
}): Promise<ClientRouteManifestEntry> {
  const { route } = options;

  if (route.kind === "server") {
    return { path: route.path, kind: route.kind, client: false };
  }

  const source = await readFile(route.file, "utf8");
  const clientSource = stripRouteClientOnlyExports(source);
  const navigation = detectNavigationRuntimeHint(source);

  if (
    !(await isClientRouteModule({
      cache: options.clientRouteInferenceCache,
      code: clientSource,
      filename: route.file,
      routePath: route.path,
    }))
  ) {
    return {
      path: route.path,
      kind: route.kind,
      client: false,
      ...(navigation ? { navigation } : {}),
    };
  }

  let output: Awaited<ReturnType<typeof buildClientRouteOutput>>;

  try {
    output = await buildClientRouteOutput({
      code: clientSource,
      clientNavigation: detectClientNavigationHint(source),
      filename: route.file,
      minify: true,
      routePath: route.path,
      sourceMap: options.sourceMaps !== "none",
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
  const code = applyClientSourceMapReference({
    code: output.code,
    scriptBasename,
    sourceMaps: options.sourceMaps,
  });

  await mkdir(dirname(join(options.clientDir, script)), { recursive: true });
  await writeFile(join(options.clientDir, script), code);
  if (output.map !== undefined) {
    const mapBaseDir =
      options.sourceMaps === "hidden" ? options.sourceMapDir : options.clientDir;

    await mkdir(dirname(join(mapBaseDir, sourceMap)), { recursive: true });
    await writeFile(join(mapBaseDir, sourceMap), output.map);
  }

  return {
    bytes: Buffer.byteLength(code),
    path: route.path,
    kind: route.kind,
    client: true,
    ...(navigation ? { navigation } : {}),
    routeId,
    script,
    ...(options.sourceMaps === "linked" ? { sourceMap } : {}),
    devScript: clientScriptForPath(route.path),
  };
}

function applyClientSourceMapReference(options: {
  code: string;
  scriptBasename: string;
  sourceMaps: AppRouterClientSourceMapMode;
}): string {
  const sourceMappingUrlPattern = /\n?\/\/# sourceMappingURL=route\.js\.map\s*$/;

  if (options.sourceMaps === "none") {
    return options.code;
  }

  if (options.sourceMaps === "hidden") {
    return options.code.replace(sourceMappingUrlPattern, "");
  }

  const code = options.code.replace(
    sourceMappingUrlPattern,
    `\n//# sourceMappingURL=${options.scriptBasename}.map`,
  );

  return code.includes("sourceMappingURL=")
    ? code
    : `${code}\n//# sourceMappingURL=${options.scriptBasename}.map`;
}

async function writeNavigationRuntimeBundle(clientDir: string): Promise<string> {
  const output = await buildNavigationRuntimeBundle({
    minify: true,
    sourceMap: false,
  });
  const hash = createHash("sha256").update(output.code).digest("hex").slice(0, 8);
  const script = `assets/navigation.${hash}.js`;

  await mkdir(dirname(join(clientDir, script)), { recursive: true });
  await writeFile(join(clientDir, script), output.code);

  return script;
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
        fatalDiagnostics.map((diagnostic) => formatDiagnostic(route.file, diagnostic)).join("\n"),
      );
    }
  }
}

async function collectBuildFiles(
  projectRoot: string,
  allowedSourceDirs: readonly string[],
): Promise<Record<string, string>> {
  const files: Record<string, string> = {};

  for (const directory of allowedSourceDirs) {
    for (const file of await collectFiles(directory)) {
      const relativeFile = relative(projectRoot, file);

      if (relativeFile === "" || relativeFile.startsWith("..") || relativeFile.startsWith(sep)) {
        continue;
      }

      files[relativeFile] = await readFile(file, "utf8");
    }
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
