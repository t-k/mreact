import {
  hasTopLevelExportDeclaration,
  stripTopLevelExportDeclarations,
} from "@modular-react/compiler";

const routeModuleExportNames = [
  "auth",
  "generateStaticParams",
  "loader",
  "prerender",
  "revalidate",
  "stream",
] as const;
const routeClientOnlyExportNames = [...routeModuleExportNames, "metadata"] as const;

export function stripRouteModuleExports(code: string): string {
  return stripTopLevelExportDeclarations({
    code,
    names: routeModuleExportNames,
  });
}

export function stripRouteClientOnlyExports(code: string): string {
  return stripTopLevelExportDeclarations({
    code,
    names: routeClientOnlyExportNames,
  });
}

export function stripRouteBuildExports(code: string): string {
  return stripRouteClientOnlyExports(code);
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
