import { builtinModules } from "node:module";
import { join, relative, sep } from "node:path";

const builtinModuleNames = new Set(
  builtinModules.flatMap((name) => [name, `node:${name}`]),
);
const alwaysAllowedPackages = new Set([
  "@modular-react/app-router",
]);

export interface AppRouterImportPolicy {
  allowedPackages?: readonly string[] | undefined;
}

export interface AppRouterImportPolicyPluginOptions {
  appDir: string;
  importPolicy?: AppRouterImportPolicy | undefined;
  label: string;
}

export function createAppRouterImportPolicyPlugin(
  options: AppRouterImportPolicyPluginOptions,
) {
  const allowedPackages = new Set([
    ...alwaysAllowedPackages,
    ...(options.importPolicy?.allowedPackages ?? []),
  ]);

  return {
    name: `mreact-app-router-${options.label}-import-policy`,
    setup(buildApi: {
      onResolve(
        options: { filter: RegExp },
        callback: (args: { path: string; resolveDir: string }) =>
          | { errors?: Array<{ text: string }>; external?: boolean; path?: string }
          | undefined,
      ): void;
    }) {
      buildApi.onResolve({ filter: /.*/ }, (args) => {
        if (isRelativeImport(args.path)) {
          const baseDir = args.resolveDir === "" ? options.appDir : args.resolveDir;
          if (!isInsideDirectory(options.appDir, baseDir)) {
            return undefined;
          }

          const resolvedPath = join(baseDir, args.path);
          const relativePath = relative(options.appDir, resolvedPath);

          return relativePath === ".." || relativePath.startsWith(`..${sep}`)
            ? {
                errors: [
                  {
                    text: `${options.label} imports must stay inside the app directory: ${args.path}`,
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

        if (args.resolveDir !== "" && !isInsideDirectory(options.appDir, args.resolveDir)) {
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

function isRelativeImport(path: string): boolean {
  return path === "." ||
    path === ".." ||
    path.startsWith("./") ||
    path.startsWith("../");
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
