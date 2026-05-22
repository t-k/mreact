import { dirname, isAbsolute, join } from "node:path";
import {
  collectTopLevelValueExportNames,
  collectJsxComponentRootNames,
  collectStaticImportReferences,
  demoteTopLevelExportDeclarations,
  hasModuleDirective,
  hasTopLevelExportDeclaration,
  stripTopLevelExportDeclarations,
} from "@reckona/mreact-compiler";
import type { StaticImportReference } from "@reckona/mreact-compiler";
import { sourceModuleCandidates } from "./source-modules.js";

const routeModuleExportNames = [
  "auth",
  "generateStaticParams",
  "loader",
  "middleware",
  "prerender",
  "revalidate",
  "stream",
] as const;
const routeClientOnlyExportNames = [
  ...routeModuleExportNames,
  "generateMetadata",
  "metadata",
] as const;
const routeRequestRenderExportNames = ["default", "slots"] as const;
const routeRenderExportNames = new Set<string>(["default", "slots"]);
const routeRequestExportNames = new Set<string>([
  ...routeClientOnlyExportNames,
  "generateMetadata",
  "metadata",
]);
const routeLoaderOnlyExportNames = new Set<string>(["loader"]);
const routeMetadataOnlyExportNames = new Set<string>(["generateMetadata", "metadata"]);

export function stripRouteModuleExports(code: string): string {
  return demoteRouteHelperExports(stripTopLevelExportDeclarations({
    code,
    names: routeModuleExportNames,
  }));
}

export function stripRouteClientOnlyExports(code: string): string {
  return demoteRouteHelperExports(stripTopLevelExportDeclarations({
    code,
    names: routeClientOnlyExportNames,
  }));
}

export function stripRouteBuildExports(code: string): string {
  return stripRouteClientOnlyExports(code);
}

export function stripRouteRequestOnlyExports(code: string): string {
  return demoteRouteHelperExports(
    stripTopLevelExportDeclarations({
      code,
      names: routeRequestRenderExportNames,
    }),
    routeRequestExportNames,
  );
}

export function stripRouteLoaderOnlyExports(code: string): string {
  return demoteRouteHelperExports(
    stripTopLevelExportDeclarations({
      code,
      names: ["auth", "default", "generateMetadata", "generateStaticParams", "metadata", "middleware", "prerender", "revalidate", "slots", "stream"],
    }),
    routeLoaderOnlyExportNames,
  );
}

export function stripRouteMetadataOnlyExports(code: string): string {
  return demoteRouteHelperExports(
    stripTopLevelExportDeclarations({
      code,
      names: ["auth", "default", "generateStaticParams", "loader", "middleware", "prerender", "revalidate", "slots", "stream"],
    }),
    routeMetadataOnlyExportNames,
  );
}

export function stripRouteConfigExports(code: string): string {
  return stripTopLevelExportDeclarations({
    code,
    names: ["auth", "prerender", "revalidate", "stream"],
  });
}

export function isStreamRouteSource(code: string): boolean {
  return hasTopLevelExportDeclaration({ code, names: ["stream"] });
}

export function mayUseAwaitBoundarySource(code: string): boolean {
  return collectJsxComponentRootNames({ code }).includes("Await");
}

export function routeClosureMayUseAwaitBoundary(options: {
  filename: string;
  files: Record<string, string>;
  projectRoot: string;
  seen?: Set<string> | undefined;
  source: string;
}): boolean {
  const seen = options.seen ?? new Set<string>();
  if (
    seen.has(options.filename) ||
    hasModuleDirective({ code: options.source, directive: "use client" })
  ) {
    return false;
  }

  seen.add(options.filename);

  try {
    if (mayUseAwaitBoundarySource(options.source)) {
      return true;
    }

    const sourceFilename = sourceFilenameForCompiler(options.projectRoot, options.filename);
    const jsxComponentRoots = new Set(
      collectJsxComponentRootNames({
        code: options.source,
        filename: sourceFilename,
      }),
    );

    for (const reference of collectStaticImportReferences({
      code: options.source,
      filename: sourceFilename,
    })) {
      if (!isRenderedStaticImportReference(reference, jsxComponentRoots)) {
        continue;
      }

      const resolved = resolveLocalSourceImport(options.files, options.filename, reference.source);

      if (resolved === undefined) {
        continue;
      }

      const importedSource = options.files[resolved];

      if (
        importedSource !== undefined &&
        routeClosureMayUseAwaitBoundary({
          filename: resolved,
          files: options.files,
          projectRoot: options.projectRoot,
          seen,
          source: importedSource,
        })
      ) {
        return true;
      }
    }

    return false;
  } finally {
    seen.delete(options.filename);
  }
}

export function hasPrerenderExport(code: string): boolean {
  return hasTopLevelExportDeclaration({ code, names: ["prerender"] });
}

export function hasGenerateStaticParamsExport(code: string): boolean {
  return hasTopLevelExportDeclaration({ code, names: ["generateStaticParams"] });
}

export function hasLoaderExport(code: string): boolean {
  return hasTopLevelExportDeclaration({ code, names: ["loader"] });
}

function demoteRouteHelperExports(
  code: string,
  preservedExportNames: ReadonlySet<string> = routeRenderExportNames,
): string {
  const helperNames = collectTopLevelValueExportNames({ code })
    .filter((name) => !preservedExportNames.has(name) && startsLowercase(name));

  return helperNames.length === 0
    ? code
    : demoteTopLevelExportDeclarations({ code, names: helperNames });
}

function startsLowercase(value: string): boolean {
  return /^[a-z]/.test(value);
}

function isRenderedStaticImportReference(
  reference: StaticImportReference,
  jsxComponentRoots: ReadonlySet<string>,
): boolean {
  return reference.localNames.some((localName) => jsxComponentRoots.has(localName));
}

function resolveLocalSourceImport(
  files: Record<string, string>,
  importer: string,
  specifier: string,
): string | undefined {
  if (!specifier.startsWith(".")) {
    return undefined;
  }

  const base = join(dirname(importer), specifier);

  for (const candidate of sourceModuleCandidates(base)) {
    if (files[candidate] !== undefined) {
      return candidate;
    }
  }

  return undefined;
}

function sourceFilenameForCompiler(projectRoot: string, filename: string): string {
  return isAbsolute(filename) ? filename : join(projectRoot, filename);
}
