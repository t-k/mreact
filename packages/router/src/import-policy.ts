import { builtinModules, createRequire } from "node:module";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolveWorkspacePackageFile } from "./workspace-packages.js";

const builtinModuleNames = new Set(builtinModules.flatMap((name) => [name, `node:${name}`]));
const alwaysAllowedPackages = new Set([
  "@reckona/mreact",
  "@reckona/mreact-auth",
  "@reckona/mreact-query",
  "@reckona/mreact-reactive-core",
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
  externalizeAllowedPackages?: boolean | undefined;
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
                text: importPolicyPackageError(options.label, packageName),
              },
            ],
          };
        }

        const resolvedPackage = resolvePackageSpecifier(args.path, args.resolveDir, options.appDir);

        if (resolvedPackage === undefined) {
          return undefined;
        }

        return options.externalizeAllowedPackages === false
          ? undefined
          : {
              external: true,
              path: pathToFileURL(resolvedPackage).href,
            };
      });
    },
  };
}

function resolvePackageSpecifier(
  specifier: string,
  resolveDir: string,
  appDir: string,
): string | undefined {
  const baseDir = resolveDir === "" ? appDir : resolveDir;

  try {
    return createRequire(join(baseDir, "__mreact_resolve__.cjs")).resolve(specifier);
  } catch {
    return undefined;
  }
}

function importPolicyPackageError(label: string, packageName: string): string {
  const normalizedLabel = label.toLowerCase();
  const moduleKind =
    normalizedLabel.includes("loader") ||
    normalizedLabel.includes("middleware") ||
    normalizedLabel.includes("route") ||
    normalizedLabel.includes("metadata") ||
    normalizedLabel.includes("action")
      ? normalizedLabel
      : `${normalizedLabel} module`;
  const aliasHint =
    packageName === "~" || packageName === "@"
      ? [
          "",
          'This looks like an app-local alias import. Use a relative import such as "./" or "../" in server-side route code, or move the import behind a supported client boundary.',
        ]
      : [];

  return [
    `"${packageName}" is imported by a ${moduleKind} but is not allowed by the app-router import policy.`,
    "",
    "The policy blocks server-side static imports from loader, middleware, route handler, metadata, and server action modules unless the package is explicitly allowed.",
    ...aliasHint,
    "",
    "Allow it in the Vite plugin config:",
    "  mreactRouter({",
    `    importPolicy: { allowedPackages: [${JSON.stringify(packageName)}] },`,
    "  })",
    "",
    "For production builds, also declare the package in package.json dependencies so mreact-router build can derive the generated policy and the package is installed in the runtime artifact.",
  ].join("\n");
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
      "@reckona/mreact-router/app-router-globals",
      join(
        packageRoot,
        currentDir.endsWith(`${sep}dist`)
          ? "dist/app-router-globals.js"
          : "src/app-router-globals.ts",
      ),
    ],
    [
      "@reckona/mreact-router/link",
      join(packageRoot, currentDir.endsWith(`${sep}dist`) ? "dist/link.js" : "src/link.ts"),
    ],
    [
      "@reckona/mreact-router/navigation-state",
      join(
        packageRoot,
        currentDir.endsWith(`${sep}dist`) ? "dist/navigation-state.js" : "src/navigation-state.ts",
      ),
    ],
    [
      "@reckona/mreact-router/stream-list",
      join(
        packageRoot,
        currentDir.endsWith(`${sep}dist`) ? "dist/stream-list.js" : "src/stream-list.ts",
      ),
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
