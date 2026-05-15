import { isAbsolute, relative, resolve } from "node:path";

export interface AppRouterProjectOptions {
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
        resolveProjectPath(appDir, directory, "allowedSourceDirs"),
      ),
      projectRoot: appDir,
      publicDir: resolveProjectPath(appDir, options.publicDir ?? "public", "publicDir"),
      routesDir: appDir,
    };
  }

  const projectRoot = resolve(options.projectRoot ?? process.cwd());

  return {
    allowedSourceDirs: (options.allowedSourceDirs ?? ["src"]).map((directory) =>
      resolveProjectPath(projectRoot, directory, "allowedSourceDirs"),
    ),
    projectRoot,
    publicDir: resolveProjectPath(projectRoot, options.publicDir ?? "public", "publicDir"),
    routesDir: resolveProjectPath(projectRoot, options.routesDir ?? "src/app", "routesDir"),
  };
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
