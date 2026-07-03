import { basename, dirname, isAbsolute, relative, resolve } from "node:path";

/**
 * Selects the deployment runtime artifacts emitted by an app-router build.
 */
export type AppRouterBuildTarget = "node" | "cloudflare" | "aws-lambda";
/**
 * Names a browser console method that can be stripped from client bundles.
 */
export type AppRouterClientConsoleMethod = "debug" | "error" | "info" | "log" | "trace" | "warn";
/**
 * Controls how client bundle source maps are generated.
 */
export type AppRouterClientSourceMapMode = "none" | "hidden" | "linked";
/**
 * Configures client source map output with a boolean shortcut or explicit mode.
 */
export type AppRouterClientSourceMapOption = boolean | AppRouterClientSourceMapMode;

/**
 * Configures production-only app-router build behavior.
 */
export interface AppRouterProductionOptions {
  dropClientConsole?: boolean | readonly AppRouterClientConsoleMethod[] | undefined;
}

export interface AppRouterProjectOptions {
  assetBaseUrl?: string | undefined;
  buildConcurrency?: number | undefined;
  buildTargets?: readonly AppRouterBuildTarget[] | undefined;
  clientSourceMaps?: AppRouterClientSourceMapOption | undefined;
  /**
   * Legacy route root. When provided without routesDir/projectRoot, this keeps
   * the historical "appDir is the whole app boundary" behavior.
   *
   * @deprecated Use projectRoot + routesDir instead. The legacy appDir shortcut
   * is kept for direct tests and older programmatic callers and is planned for
   * removal after 0.1.0.
   */
  appDir?: string | undefined;
  allowedSourceDirs?: readonly string[] | undefined;
  projectRoot?: string | undefined;
  production?: AppRouterProductionOptions | undefined;
  publicDir?: string | undefined;
  publicAssetBaseUrl?: string | undefined;
  routesDir?: string | undefined;
}

export interface ResolvedAppRouterProject {
  allowedSourceDirs: readonly string[];
  assetBaseUrl?: string | undefined;
  buildConcurrency?: number | undefined;
  buildTargets: readonly AppRouterBuildTarget[];
  clientSourceMaps: AppRouterClientSourceMapMode;
  clientConsolePureFunctions?: readonly string[] | undefined;
  projectRoot: string;
  publicAssetBaseUrl?: string | undefined;
  publicDir: string;
  routesDir: string;
}

export function resolveAppRouterProjectOptions(
  options: AppRouterProjectOptions,
): ResolvedAppRouterProject {
  const clientConsolePureFunctions = resolveClientConsolePureFunctions(
    options.production?.dropClientConsole,
  );

  if (
    options.appDir !== undefined &&
    options.projectRoot === undefined &&
    options.routesDir === undefined
  ) {
    const appDir = resolve(options.appDir);

    return {
      allowedSourceDirs: (options.allowedSourceDirs ?? [appDir]).map((directory) =>
        resolveProjectPath(appDir, directory, "allowedSourceDirs"),
      ),
      ...(options.assetBaseUrl === undefined ? {} : { assetBaseUrl: options.assetBaseUrl }),
      ...(options.buildConcurrency === undefined
        ? {}
        : { buildConcurrency: options.buildConcurrency }),
      buildTargets: resolveBuildTargets(options.buildTargets),
      clientSourceMaps: resolveClientSourceMapMode(options.clientSourceMaps),
      ...(clientConsolePureFunctions === undefined ? {} : { clientConsolePureFunctions }),
      projectRoot: appDir,
      ...(options.publicAssetBaseUrl === undefined
        ? {}
        : { publicAssetBaseUrl: options.publicAssetBaseUrl }),
      publicDir: resolveProjectPath(appDir, options.publicDir ?? "public", "publicDir"),
      routesDir: appDir,
    };
  }

  const projectRoot = resolve(options.projectRoot ?? process.cwd());
  const routesDir = resolveProjectPath(projectRoot, options.routesDir ?? "src/app", "routesDir");
  const defaultAllowedSourceDirs =
    options.routesDir === undefined ? ["src"] : [defaultAllowedSourceDir(projectRoot, routesDir)];

  return {
    allowedSourceDirs: (options.allowedSourceDirs ?? defaultAllowedSourceDirs).map((directory) =>
      resolveProjectPath(projectRoot, directory, "allowedSourceDirs"),
    ),
    ...(options.assetBaseUrl === undefined ? {} : { assetBaseUrl: options.assetBaseUrl }),
    ...(options.buildConcurrency === undefined
      ? {}
      : { buildConcurrency: options.buildConcurrency }),
    buildTargets: resolveBuildTargets(options.buildTargets),
    clientSourceMaps: resolveClientSourceMapMode(options.clientSourceMaps),
    ...(clientConsolePureFunctions === undefined ? {} : { clientConsolePureFunctions }),
    projectRoot,
    ...(options.publicAssetBaseUrl === undefined
      ? {}
      : { publicAssetBaseUrl: options.publicAssetBaseUrl }),
    publicDir: resolveProjectPath(projectRoot, options.publicDir ?? "public", "publicDir"),
    routesDir,
  };
}

function defaultAllowedSourceDir(projectRoot: string, routesDir: string): string {
  const sourceRoot = dirname(routesDir);
  return basename(routesDir) === "app" && sourceRoot !== projectRoot ? sourceRoot : routesDir;
}

const defaultDroppedClientConsoleMethods = ["debug", "info", "log"] as const;
const supportedClientConsoleMethods = new Set<AppRouterClientConsoleMethod>([
  "debug",
  "error",
  "info",
  "log",
  "trace",
  "warn",
]);

export function resolveClientConsolePureFunctions(
  value: AppRouterProductionOptions["dropClientConsole"],
): readonly string[] | undefined {
  if (value === undefined || value === false) {
    return undefined;
  }

  const methods = value === true ? defaultDroppedClientConsoleMethods : value;
  const uniqueMethods = [...new Set(methods)];

  for (const method of uniqueMethods) {
    if (!supportedClientConsoleMethods.has(method)) {
      throw new Error(
        `Unsupported mreactRouter production.dropClientConsole method ${JSON.stringify(method)}. Expected "debug", "error", "info", "log", "trace", or "warn".`,
      );
    }
  }

  return uniqueMethods.length === 0
    ? undefined
    : uniqueMethods.map((method) => `console.${method}`);
}

export function resolveClientSourceMapMode(
  value: AppRouterClientSourceMapOption | undefined,
): AppRouterClientSourceMapMode {
  if (value === undefined || value === false || value === "none") {
    return "none";
  }

  if (value === true || value === "linked") {
    return "linked";
  }

  if (value === "hidden") {
    return "hidden";
  }

  throw new Error(
    `Unsupported mreactRouter clientSourceMaps value ${JSON.stringify(value)}. Expected false, true, "none", "hidden", or "linked".`,
  );
}

export function resolveBuildTargets(
  targets: readonly AppRouterBuildTarget[] | undefined,
): readonly AppRouterBuildTarget[] {
  if (targets === undefined) {
    return ["node"];
  }

  const uniqueTargets = [...new Set(targets)];

  if (uniqueTargets.length === 0) {
    throw new Error("mreactRouter buildTargets must include at least one target.");
  }

  for (const target of uniqueTargets) {
    if (target !== "node" && target !== "cloudflare" && target !== "aws-lambda") {
      throw new Error(
        `Unsupported mreactRouter build target ${JSON.stringify(target)}. Expected "node", "cloudflare", or "aws-lambda".`,
      );
    }
  }

  return uniqueTargets;
}

function resolveProjectPath(root: string, path: string, optionName: string): string {
  const resolvedPath = resolvePath(root, path);

  if (!isInsideDirectory(root, resolvedPath)) {
    throw new Error(
      `mreactRouter ${optionName} must resolve inside projectRoot. projectRoot: ${root}; ${optionName}: ${resolvedPath}`,
    );
  }

  return resolvedPath;
}

function resolvePath(root: string, path: string): string {
  return isAbsolute(path) ? resolve(path) : resolve(root, path);
}

function isInsideDirectory(root: string, path: string): boolean {
  const relativePath = relative(root, path);

  return relativePath === "" || (!relativePath.startsWith("..") && !isAbsolute(relativePath));
}
