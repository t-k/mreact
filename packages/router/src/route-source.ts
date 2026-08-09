import { dirname, isAbsolute, join } from "node:path";
import {
  collectIdentifierReferenceNames,
  collectFormActionExpressionReferences,
  collectTopLevelValueExportNames,
  collectJsxComponentRootNames,
  collectStaticImportReferences,
  demoteTopLevelExportDeclarations,
  hasModuleDirective,
  hasTopLevelExportDeclaration,
  stripTopLevelExportDeclarations,
  stripUnusedStaticValueImports,
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

export function stripRouteModuleExports(code: string, filename?: string | undefined): string {
  return demoteRouteHelperExports(stripTopLevelExportDeclarations({
    code,
    filename,
    names: routeModuleExportNames,
  }), routeRenderExportNames, filename);
}

export function stripRouteClientOnlyExports(code: string, filename?: string | undefined): string {
  return stripUnusedStaticValueImports({
    code: demoteRouteHelperExports(
      stripTopLevelExportDeclarations({
        code,
        filename,
        names: routeClientOnlyExportNames,
      }),
      routeRenderExportNames,
      filename,
    ),
    filename,
  });
}

export function stripRouteClientSource(input: {
  code: string;
  filename?: string | undefined;
}): string {
  return stripRouteClientFormActionExpressions({
    code: stripRouteClientOnlyExports(input.code, input.filename),
    filename: input.filename,
  });
}

export function stripRouteClientFormActionExpressions(input: {
  code: string;
  filename?: string | undefined;
}): string {
  const references = collectFormActionExpressionReferences(input);
  let code = input.code;

  for (const reference of [...references].reverse()) {
    code = `${code.slice(0, reference.expressionStart)}undefined${code.slice(reference.expressionEnd)}`;
  }

  return code;
}

export function stripRouteBuildExports(code: string, filename?: string | undefined): string {
  return stripRouteClientOnlyExports(code, filename);
}

export function stripRouteRequestOnlyExports(code: string, filename?: string | undefined): string {
  return demoteRouteHelperExports(
    stripTopLevelExportDeclarations({
      code,
      filename,
      names: routeRequestRenderExportNames,
    }),
    routeRequestExportNames,
    filename,
  );
}

export function stripRouteLoaderOnlyExports(code: string, filename?: string | undefined): string {
  return demoteRouteHelperExports(
    stripTopLevelExportDeclarations({
      code,
      filename,
      names: ["auth", "default", "generateMetadata", "generateStaticParams", "metadata", "middleware", "prerender", "revalidate", "slots", "stream"],
    }),
    routeLoaderOnlyExportNames,
    filename,
  );
}

export function stripRouteMetadataOnlyExports(code: string, filename?: string | undefined): string {
  return demoteRouteHelperExports(
    stripTopLevelExportDeclarations({
      code,
      filename,
      names: ["auth", "default", "generateStaticParams", "loader", "middleware", "prerender", "revalidate", "slots", "stream"],
    }),
    routeMetadataOnlyExportNames,
    filename,
  );
}

export function stripRouteConfigExports(code: string, filename?: string | undefined): string {
  return stripTopLevelExportDeclarations({
    code,
    filename,
    names: ["auth", "prerender", "revalidate", "stream"],
  });
}

export function isStreamRouteSource(code: string, filename?: string | undefined): boolean {
  return hasTopLevelExportDeclaration({ code, filename, names: ["stream"] });
}

export function mayUseAwaitBoundarySource(code: string): boolean {
  return collectJsxComponentRootNames({ code }).includes("Await");
}

export function routeClosureMayUseAwaitBoundary(options: {
  filename: string;
  files: RouteSourceLookup;
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

      if (
        routeClosureMayUseAwaitBoundary({
          filename: resolved.filename,
          files: options.files,
          projectRoot: options.projectRoot,
          seen,
          source: resolved.source,
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

const REQUEST_INPUT_IDENTIFIERS = new Set(["fetch", "request", "Request"]);

/**
 * Conservatively detects route closures that may consume Request inputs which
 * are not represented by the shared route cache key.
 *
 * This deliberately over-approximates: a false positive disables shared HTML
 * reuse, while a false negative can disclose one request's rendered values to
 * another. Local server imports are traversed so helpers that reconstruct a
 * Request from its internal slots are covered before cache lookup.
 */
export function routeClosureMayUseRequestInput(options: {
  filename: string;
  files: RouteSourceLookup;
  projectRoot: string;
  seen?: Set<string> | undefined;
  source: string;
}): boolean {
  const seen = options.seen ?? new Set<string>();
  if (seen.has(options.filename)) {
    return false;
  }

  seen.add(options.filename);

  try {
    if (hasModuleDirective({ code: options.source, directive: "use client" })) {
      return false;
    }

    const sourceFilename = sourceFilenameForCompiler(options.projectRoot, options.filename);
    if (
      collectIdentifierReferenceNames({
        code: options.source,
        filename: sourceFilename,
      }).some((name) => REQUEST_INPUT_IDENTIFIERS.has(name))
    ) {
      return true;
    }

    for (const reference of collectStaticImportReferences({
      code: options.source,
      filename: sourceFilename,
    })) {
      const resolved = resolveLocalSourceImport(options.files, options.filename, reference.source);

      if (
        resolved !== undefined &&
        routeClosureMayUseRequestInput({
          filename: resolved.filename,
          files: options.files,
          projectRoot: options.projectRoot,
          seen,
          source: resolved.source,
        })
      ) {
        return true;
      }
    }

    return false;
  } catch {
    // An analysis parser mismatch must not turn an unknown route into a shared
    // cache candidate. The normal compiler still reports actual source errors.
    return true;
  } finally {
    seen.delete(options.filename);
  }
}

export function hasPrerenderExport(code: string, filename?: string | undefined): boolean {
  return hasTopLevelExportDeclaration({ code, filename, names: ["prerender"] });
}

export function hasGenerateStaticParamsExport(code: string, filename?: string | undefined): boolean {
  return hasTopLevelExportDeclaration({ code, filename, names: ["generateStaticParams"] });
}

export function hasLoaderExport(code: string, filename?: string | undefined): boolean {
  return hasTopLevelExportDeclaration({ code, filename, names: ["loader"] });
}

function demoteRouteHelperExports(
  code: string,
  preservedExportNames: ReadonlySet<string> = routeRenderExportNames,
  filename?: string | undefined,
): string {
  const helperNames = collectTopLevelValueExportNames({ code, filename })
    .filter((name) => !preservedExportNames.has(name) && startsLowercase(name));

  return helperNames.length === 0
    ? code
    : demoteTopLevelExportDeclarations({ code, filename, names: helperNames });
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
  files: RouteSourceLookup,
  importer: string,
  specifier: string,
): { filename: string; source: string } | undefined {
  if (!specifier.startsWith(".")) {
    return undefined;
  }

  const base = join(dirname(importer), specifier);

  for (const candidate of sourceModuleCandidates(base)) {
    const source = readRouteSourceLookup(files, candidate);
    if (source !== undefined) {
      return { filename: candidate, source };
    }
  }

  return undefined;
}

type RouteSourceLookup = Record<string, string> | ((file: string) => string | undefined);

function readRouteSourceLookup(files: RouteSourceLookup, file: string): string | undefined {
  return typeof files === "function" ? files(file) : files[file];
}

function sourceFilenameForCompiler(projectRoot: string, filename: string): string {
  return isAbsolute(filename) ? filename : join(projectRoot, filename);
}
