import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, normalize } from "node:path";
import { pathToFileURL } from "node:url";
import type { DehydrateOptions } from "@reckona/mreact-query";
import type {
  BuiltPrerenderedRoute,
  BuiltServerManifest,
  BuiltServerModuleArtifact,
} from "./build.js";
import { builtClientAssetPaths } from "./built-assets.js";
import type { BuiltServerModuleArtifactRuntime } from "./built-server-module-artifacts.js";
import type { ClientRouteManifestEntry } from "./client-route-inference.js";
import type { AppRouterImportPolicy } from "./import-policy.js";
import { dehydrateOptionsFromModule } from "./dehydrate-policy.js";
import { createRouteMatcher, type AppRoute, type RouteMatcher } from "./routes.js";

export interface BuiltRuntime extends BuiltServerModuleArtifactRuntime {
  allowedSourceDirs: readonly string[];
  assetBaseUrl?: string | undefined;
  clientAssetPaths: ReadonlySet<string>;
  clientScripts: ReadonlyMap<string, string>;
  clientScriptPreloads: ReadonlyMap<string, readonly string[]>;
  clientStylesByFile: ReadonlyMap<string, readonly string[]>;
  clientStyles: ReadonlyMap<string, readonly string[]>;
  dehydrateOptions?: DehydrateOptions | undefined;
  generatedImportPolicy?: AppRouterImportPolicy | undefined;
  hasMiddleware: boolean;
  navigationScripts: ReadonlyMap<string, string>;
  projectRoot: string;
  publicAssetBaseUrl?: string | undefined;
  prerenderableRoutes: ReadonlySet<string>;
  prerenderLocks: Map<string, Promise<{ response: Response; shareable: boolean }>>;
  prerenderedRoutes: Map<string, BuiltPrerenderedRoute>;
  routeMatcher: RouteMatcher;
  routes: readonly AppRoute[];
  serverActionReferencesByFile: ReadonlyMap<
    string,
    readonly {
      end: number;
      expression: string;
      expressionEnd: number;
      expressionStart: number;
      moduleId: string;
      exportName: string;
      inferred: boolean;
      sourceHash: string;
      start: number;
    }[]
  >;
  serverActionManifest?:
    | readonly { moduleId: string; exportName: string; inferred?: boolean }[]
    | undefined;
  serverModuleCacheVersion: string;
}

export async function materializeBuiltRuntime(options: {
  clientManifestText: string;
  clientManifestPath: string;
  importPolicyPath: string;
  importPolicyText: string | undefined;
  onMaterialize?: (() => void) | undefined;
  outDir: string;
  runtimeDir: string;
  serverManifestText: string;
  serverManifestPath: string;
}): Promise<BuiltRuntime> {
  options.onMaterialize?.();
  const serverManifest = parseBuiltJsonArtifact<BuiltServerManifest>(
    options.serverManifestText,
    options.serverManifestPath,
    "built app server manifest",
  );
  const clientManifest = parseBuiltJsonArtifact<{
    assets?: readonly string[];
    routes: ClientRouteManifestEntry[];
    styles?: Array<{ css?: readonly string[]; file: string }>;
  }>(options.clientManifestText, options.clientManifestPath, "built app client manifest");
  const appDir = await materializeBuiltServerApp(options.runtimeDir, serverManifest);
  const projectRoot = appDir;
  const routesDir = join(projectRoot, serverManifest.routesDir ?? "");
  const routes = serverManifest.routes.map((route) => ({
    ...route,
    file: join(projectRoot, route.file),
  }));
  const prerenderedRoutes = new Map(Object.entries(serverManifest.prerenderedRoutes ?? {}));
  const prerenderableRoutes = new Set(prerenderedRoutes.keys());
  const prerenderLocks = new Map<string, Promise<{ response: Response; shareable: boolean }>>();
  const serverModules = new Map<string, BuiltServerModuleArtifact>(
    Object.entries(serverManifest.serverModules ?? {}).map(([file, artifact]) => [
      join(appDir, file),
      artifact,
    ]),
  );
  const serverModuleClosureFiles = new Map<string, readonly string[]>(
    Object.entries(serverManifest.serverModuleClosureFiles ?? {}).map(([file, closure]) => [
      join(appDir, safeManifestFilePath(file)),
      closure.map((closureFile) => join(appDir, safeManifestFilePath(closureFile))),
    ]),
  );
  const serverModuleFiles = new Map(
    Object.entries(serverManifest.serverModuleFiles ?? {}).map(([file, artifactFile]) => [
      join(appDir, file),
      join(options.outDir, "server", safeManifestFilePath(artifactFile)),
    ]),
  );
  const serverModuleRequestFiles = new Map(
    Object.entries(serverManifest.serverModuleRequestFiles ?? {}).map(([file, artifactFile]) => [
      join(appDir, file),
      join(options.outDir, "server", safeManifestFilePath(artifactFile)),
    ]),
  );
  const serverModuleRenderFiles = new Map(
    Object.entries(serverManifest.serverModuleRenderFiles ?? {}).map(([file, artifactFile]) => [
      join(appDir, file),
      join(options.outDir, "server", safeManifestFilePath(artifactFile)),
    ]),
  );
  const serverSourceFiles = new Map(
    Object.entries(serverManifest.files).map(([file, source]) => [join(appDir, file), source]),
  );
  const serverActionReferencesByFile = new Map(
    Object.entries(serverManifest.routeServerActionReferences ?? {}).map(([file, references]) => [
      join(appDir, file),
      references,
    ]),
  );
  const routeMatcher = createRouteMatcher(routes, serverManifest.routeMatcher);
  const clientScripts = new Map(
    clientManifest.routes.flatMap((route) =>
      route.client && route.script !== undefined ? [[route.path, route.script]] : [],
    ),
  );
  const clientScriptPreloads = new Map(
    clientManifest.routes.flatMap((route) =>
      route.client && route.script !== undefined && route.modulePreloads !== undefined
        ? [[route.path, route.modulePreloads] as const]
        : [],
    ),
  );
  const clientStyles = new Map(
    clientManifest.routes.flatMap((route) =>
      route.css !== undefined && route.css.length > 0 ? [[route.path, route.css]] : [],
    ),
  );
  const clientStylesByFile = new Map(
    (clientManifest.styles ?? []).flatMap((style) =>
      style.css !== undefined && style.css.length > 0
        ? [[join(routesDir, style.file), style.css] as const]
        : [],
    ),
  );
  const navigationScripts = new Map(
    clientManifest.routes.flatMap((route) =>
      route.navigation === true && route.navigationScript !== undefined
        ? [[route.path, route.navigationScript]]
        : [],
    ),
  );
  const hasMiddleware =
    serverSourceFiles.has(join(routesDir, "middleware.ts")) ||
    serverSourceFiles.has(join(routesDir, "middleware.mreact.ts"));
  const serverModuleCacheVersion = createHash("sha256")
    .update(options.serverManifestText)
    .update("\0")
    .update(options.clientManifestText)
    .digest("hex")
    .slice(0, 16);

  const allowedSourceDirs = (serverManifest.allowedSourceDirs ?? [""]).map((directory) =>
    join(projectRoot, directory),
  );
  const generatedImportPolicy = builtGeneratedImportPolicy(
    options.importPolicyText,
    options.importPolicyPath,
  );
  const dehydrateOptions =
    serverManifest.dehydratePolicyModule === undefined
      ? undefined
      : await loadBuiltDehydratePolicy(
          join(
            options.outDir,
            "server",
            safeManifestFilePath(serverManifest.dehydratePolicyModule),
          ),
          serverManifest.dehydratePolicyModule,
        );

  return {
    appDir: routesDir,
    allowedSourceDirs,
    ...(serverManifest.assetBaseUrl === undefined
      ? {}
      : { assetBaseUrl: serverManifest.assetBaseUrl }),
    clientAssetPaths: builtClientAssetPaths(clientManifest),
    clientScripts,
    clientScriptPreloads,
    clientStylesByFile,
    clientStyles,
    ...(dehydrateOptions === undefined ? {} : { dehydrateOptions }),
    ...(generatedImportPolicy === undefined ? {} : { generatedImportPolicy }),
    hasMiddleware,
    navigationScripts,
    projectRoot,
    ...(serverManifest.publicAssetBaseUrl === undefined
      ? {}
      : { publicAssetBaseUrl: serverManifest.publicAssetBaseUrl }),
    prerenderableRoutes,
    prerenderLocks,
    prerenderedRoutes,
    routeMatcher,
    routes,
    serverActionReferencesByFile,
    ...(serverManifest.serverActionManifest === undefined
      ? {}
      : { serverActionManifest: serverManifest.serverActionManifest }),
    serverModuleArtifactLoads: new Map(),
    serverModuleClosureFiles,
    serverModuleFiles,
    serverModuleRenderFiles,
    serverModuleRequestFiles,
    serverModules,
    serverModuleCacheVersion,
    serverSourceFiles,
  };
}

async function loadBuiltDehydratePolicy(
  policyPath: string,
  manifestPath: string,
): Promise<DehydrateOptions> {
  let policyModule: unknown;
  try {
    policyModule = await import(pathToFileURL(policyPath).href);
  } catch (error) {
    throw builtArtifactReadError("built app dehydration policy", policyPath, error);
  }
  return dehydrateOptionsFromModule(policyModule, `Built dehydration policy ${manifestPath}`);
}

export async function readBuiltImportPolicyText(outDir: string): Promise<string | undefined> {
  const policyPath = join(outDir, "server", "import-policy.json");

  try {
    return await readFile(policyPath, "utf8");
  } catch (error) {
    if (isMissingFileError(error)) {
      return undefined;
    }

    throw builtArtifactReadError("built app import policy", policyPath, error);
  }
}

export function mergeBuiltRuntimeImportPolicy(
  runtime: BuiltRuntime,
  importPolicy: AppRouterImportPolicy | undefined,
): AppRouterImportPolicy | undefined {
  const generatedImportPolicy = runtime.generatedImportPolicy;

  if (generatedImportPolicy === undefined) {
    return importPolicy;
  }

  const allowedPackages = [
    ...new Set([
      ...(generatedImportPolicy.allowedPackages ?? []),
      ...(importPolicy?.allowedPackages ?? []),
    ]),
  ];

  return {
    ...(allowedPackages.length === 0 ? {} : { allowedPackages }),
    ...(importPolicy?.allowedSourceDirs === undefined
      ? {}
      : { allowedSourceDirs: importPolicy.allowedSourceDirs }),
    ...(importPolicy?.projectRoot === undefined ? {} : { projectRoot: importPolicy.projectRoot }),
  };
}

function builtGeneratedImportPolicy(
  importPolicyText: string | undefined,
  importPolicyPath: string,
): AppRouterImportPolicy | undefined {
  if (importPolicyText === undefined) {
    return undefined;
  }

  const artifact = parseBuiltJsonArtifact<{
    runtimePackages?: unknown;
  }>(importPolicyText, importPolicyPath, "built app import policy");
  const runtimePackages = Array.isArray(artifact.runtimePackages)
    ? artifact.runtimePackages.filter((name): name is string => typeof name === "string")
    : [];

  return runtimePackages.length === 0 ? undefined : { allowedPackages: runtimePackages };
}

async function materializeBuiltServerApp(
  runtimeDir: string,
  manifest: BuiltServerManifest,
): Promise<string> {
  const appDir = join(runtimeDir, "app");

  await rm(appDir, { force: true, recursive: true });
  await Promise.all(
    Object.entries(manifest.files).map(async ([file, code]) => {
      const outputFile = join(appDir, safeManifestFilePath(file));

      await mkdir(dirname(outputFile), { recursive: true });
      await writeFile(outputFile, code);
    }),
  );

  return appDir;
}

function isMissingFileError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "ENOENT"
  );
}

function builtArtifactReadError(label: string, artifactPath: string, error: unknown): Error {
  const prefix = isMissingFileError(error) ? "Missing" : "Unable to read";
  const detail = error instanceof Error && error.message !== "" ? `: ${error.message}` : "";

  return new Error(`${prefix} ${label}: ${artifactPath}${detail}`, { cause: error });
}

function parseBuiltJsonArtifact<T>(text: string, artifactPath: string, label: string): T {
  try {
    return JSON.parse(text) as T;
  } catch (error) {
    const detail = error instanceof Error && error.message !== "" ? `: ${error.message}` : "";

    throw new Error(`Invalid ${label}: ${artifactPath}${detail}`, { cause: error });
  }
}

function safeManifestFilePath(pathname: string): string {
  const normalized = normalize(pathname);

  if (isAbsolute(normalized) || normalized === ".." || normalized.startsWith("../")) {
    throw new Error(`Invalid built app manifest file path: ${pathname}`);
  }

  return normalized;
}
