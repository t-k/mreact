import { isAbsolute, join, resolve } from "node:path";

export interface AppRouterProjectOptions {
  /**
   * Legacy route root. When provided without routesDir/projectRoot, this keeps
   * the historical "appDir is the whole app boundary" behavior.
   */
  appDir?: string | undefined;
  allowedSourceDirs?: readonly string[] | undefined;
  projectRoot?: string | undefined;
  publicDir?: string | undefined;
  routesDir?: string | undefined;
}

export interface ResolvedAppRouterProject {
  allowedSourceDirs: readonly string[];
  projectRoot: string;
  publicDir: string;
  routesDir: string;
}

export function resolveAppRouterProjectOptions(
  options: AppRouterProjectOptions,
): ResolvedAppRouterProject {
  if (
    options.appDir !== undefined &&
    options.projectRoot === undefined &&
    options.routesDir === undefined
  ) {
    const appDir = resolve(options.appDir);

    return {
      allowedSourceDirs: (options.allowedSourceDirs ?? [appDir]).map((directory) =>
        resolvePath(appDir, directory),
      ),
      projectRoot: appDir,
      publicDir: resolvePath(appDir, options.publicDir ?? "public"),
      routesDir: appDir,
    };
  }

  const projectRoot = resolve(options.projectRoot ?? process.cwd());

  return {
    allowedSourceDirs: (options.allowedSourceDirs ?? ["src"]).map((directory) =>
      resolvePath(projectRoot, directory),
    ),
    projectRoot,
    publicDir: resolvePath(projectRoot, options.publicDir ?? "public"),
    routesDir: resolvePath(projectRoot, options.routesDir ?? "src/app"),
  };
}

function resolvePath(root: string, path: string): string {
  return isAbsolute(path) ? resolve(path) : join(root, path);
}
