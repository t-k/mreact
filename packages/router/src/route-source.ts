import {
  collectTopLevelValueExportNames,
  demoteTopLevelExportDeclarations,
  hasTopLevelExportDeclaration,
  stripTopLevelExportDeclarations,
} from "@reckona/mreact-compiler";

const routeModuleExportNames = [
  "auth",
  "generateStaticParams",
  "loader",
  "middleware",
  "prerender",
  "revalidate",
  "stream",
] as const;
const routeClientOnlyExportNames = [...routeModuleExportNames, "metadata"] as const;
const routeRequestRenderExportNames = ["default", "slots"] as const;
const routeRenderExportNames = new Set<string>(["default", "slots"]);
const routeRequestExportNames = new Set<string>([...routeClientOnlyExportNames, "metadata"]);

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

export function stripRouteConfigExports(code: string): string {
  return stripTopLevelExportDeclarations({
    code,
    names: ["auth", "prerender", "revalidate", "stream"],
  });
}

export function isStreamRouteSource(code: string): boolean {
  return hasTopLevelExportDeclaration({ code, names: ["stream"] });
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
