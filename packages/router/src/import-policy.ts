import { builtinModules } from "node:module";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveWorkspacePackageFile } from "./workspace-packages.js";

const builtinModuleNames = new Set(builtinModules.flatMap((name) => [name, `node:${name}`]));
const alwaysAllowedPackages = new Set([
  "@reckona/mreact-auth",
  "@reckona/mreact-query",
  "@reckona/mreact-router",
]);

export interface AppRouterImportPolicy {
  allowedPackages?: readonly string[] | undefined;
  allowedSourceDirs?: readonly string[] | undefined;
  projectRoot?: string | undefined;
}

export interface AppRouterImportPolicyPluginOptions {
  allowedSourceDirs?: readonly string[] | undefined;
  appDir: string;
  importPolicy?: AppRouterImportPolicy | undefined;
  label: string;
  projectRoot?: string | undefined;
}

export function createAppRouterImportPolicyPlugin(options: AppRouterImportPolicyPluginOptions) {
  const projectRoot = resolve(
    options.importPolicy?.projectRoot ?? options.projectRoot ?? options.appDir,
  );
  const configuredAllowedSourceDirs =
    options.importPolicy?.allowedSourceDirs ?? options.allowedSourceDirs;
  const allowedSourceDirs = (configuredAllowedSourceDirs ?? [options.appDir]).map((directory) =>
    resolve(projectRoot, directory),
  );
  const allowedPackages = new Set([
    ...alwaysAllowedPackages,
    ...(options.importPolicy?.allowedPackages ?? []),
  ]);
  const customAllowedSourceDirs = configuredAllowedSourceDirs !== undefined;

  return {
    name: `mreact-router-${options.label}-import-policy`,
    setup(buildApi: {
      onResolve(
        options: { filter: RegExp },
        callback: (args: {
          path: string;
          resolveDir: string;
        }) => { errors?: Array<{ text: string }>; external?: boolean; path?: string } | undefined,
      ): void;
    }) {
      buildApi.onResolve({ filter: /.*/ }, (args) => {
        if (isRelativeImport(args.path)) {
          const baseDir = args.resolveDir === "" ? options.appDir : args.resolveDir;
          if (!isInsideAnyDirectory(allowedSourceDirs, baseDir)) {
            return undefined;
          }

          const resolvedPath = resolve(baseDir, args.path);

          return !isInsideDirectory(projectRoot, resolvedPath) ||
            !isInsideAnyDirectory(allowedSourceDirs, resolvedPath)
            ? {
                errors: [
                  {
                    text: customAllowedSourceDirs
                      ? `${options.label} imports must stay inside allowed source directories: ${args.path}`
                      : `${options.label} imports must stay inside the app directory: ${args.path}`,
                  },
                ],
              }
            : undefined;
        }

        if (isAbsoluteOrProtocolImport(args.path)) {
          return undefined;
        }

        if (builtinModuleNames.has(args.path)) {
          return { external: true, path: args.path };
        }

        const workspacePath = workspacePackagePath(args.path, args.resolveDir);
        if (workspacePath !== undefined) {
          return { path: workspacePath };
        }

        if (args.resolveDir !== "" && !isInsideAnyDirectory(allowedSourceDirs, args.resolveDir)) {
          return undefined;
        }

        const packageName = packageNameForSpecifier(args.path);

        if (!allowedPackages.has(packageName)) {
          return {
            errors: [
              {
                text: `${options.label} package imports are not allowed by default: "${packageName}"`,
              },
            ],
          };
        }

        return undefined;
      });
    },
  };
}

function workspacePackagePath(specifier: string, resolveDir: string): string | undefined {
  const currentDir = dirname(fileURLToPath(import.meta.url));
  const packageRoot = dirname(currentDir);
  const entries = new Map<
    string,
    string | { entry: string; monorepoDir: string; packageName: string }
  >([
    [
      "@reckona/mreact-auth",
      { entry: "index", monorepoDir: "auth", packageName: "@reckona/mreact-auth" },
    ],
    [
      "@reckona/mreact-compiler",
      { entry: "index", monorepoDir: "compiler", packageName: "@reckona/mreact-compiler" },
    ],
    [
      "@reckona/mreact-query",
      { entry: "index", monorepoDir: "query", packageName: "@reckona/mreact-query" },
    ],
    [
      "@reckona/mreact-reactive-core",
      {
        entry: "index",
        monorepoDir: "reactive-core",
        packageName: "@reckona/mreact-reactive-core",
      },
    ],
    [
      "@reckona/mreact-router",
      join(packageRoot, currentDir.endsWith(`${sep}dist`) ? "dist/index.js" : "src/index.ts"),
    ],
    [
      "@reckona/mreact-server",
      { entry: "index", monorepoDir: "server", packageName: "@reckona/mreact-server" },
    ],
  ]);
  const entry = entries.get(specifier);

  if (entry === undefined || typeof entry === "string") {
    return entry;
  }

  return resolveWorkspacePackageFile({
    currentFileUrl: import.meta.url,
    entry: entry.entry,
    monorepoDir: entry.monorepoDir,
    packageName: entry.packageName,
    resolveDir,
    specifier,
  });
}

function isRelativeImport(path: string): boolean {
  return path === "." || path === ".." || path.startsWith("./") || path.startsWith("../");
}

function isAbsoluteOrProtocolImport(path: string): boolean {
  return path.startsWith("/") || /^[A-Za-z][A-Za-z0-9+.-]*:/.test(path);
}

function packageNameForSpecifier(specifier: string): string {
  if (!specifier.startsWith("@")) {
    return specifier.split("/")[0] ?? specifier;
  }

  const [scope, name] = specifier.split("/");

  return scope !== undefined && name !== undefined ? `${scope}/${name}` : specifier;
}

function isInsideDirectory(directory: string, candidate: string): boolean {
  const relativePath = relative(directory, candidate);

  return relativePath === "" || (!relativePath.startsWith("..") && !relativePath.startsWith(sep));
}

function isInsideAnyDirectory(directories: readonly string[], candidate: string): boolean {
  return directories.some((directory) => isInsideDirectory(directory, candidate));
}
