export function stripRouteModuleExports(code: string): string {
  return stripGenerateStaticParamsExport(stripLoaderExport(stripRouteConfigExports(code)));
}

export function stripRouteClientOnlyExports(code: string): string {
  return stripMetadataExport(stripRouteModuleExports(code));
}

export function stripRouteBuildExports(code: string): string {
  return stripRouteClientOnlyExports(code);
}

export function stripRouteConfigExports(code: string): string {
  return stripAuthExport(stripPrerenderExport(stripRevalidateExport(stripStreamExport(code))));
}

export function isStreamRouteSource(code: string): boolean {
  return /^\s*export\s+const\s+stream\s*=\s*true\s*;?/m.test(code);
}

export function hasPrerenderExport(code: string): boolean {
  return /^\s*export\s+const\s+prerender\s*=\s*true\s*;?/m.test(code);
}

export function hasGenerateStaticParamsExport(code: string): boolean {
  return (
    /^\s*export\s+(?:async\s+)?function\s+generateStaticParams\s*\(/m.test(code) ||
    /^\s*export\s+const\s+generateStaticParams\s*=/m.test(code)
  );
}

export function hasLoaderExport(code: string): boolean {
  return (
    /\bexport\s+(?:async\s+)?function\s+loader\s*\(/.test(code) ||
    /\bexport\s+const\s+loader\s*=/.test(code)
  );
}

function stripStreamExport(code: string): string {
  return code.replace(/^\s*export\s+const\s+stream\s*=\s*true\s*;?\s*/m, "");
}

function stripRevalidateExport(code: string): string {
  return code.replace(/^\s*export\s+const\s+revalidate\s*=\s*\d+\s*;?\s*$/m, "");
}

function stripPrerenderExport(code: string): string {
  return code.replace(/^\s*export\s+const\s+prerender\s*=\s*true\s*;?\s*/m, "");
}

function stripAuthExport(code: string): string {
  return code.replace(/^\s*export\s+const\s+auth\s*=\s*["']include-claims["']\s*;?\s*/m, "");
}

function stripMetadataExport(code: string): string {
  return code.replace(
    /export\s+const\s+metadata\s*(?::\s*[^=]+)?=\s*[\s\S]*?;?\s*(?=\n\s*(?:export|import)|\n\s*$)/m,
    "",
  );
}

function stripGenerateStaticParamsExport(code: string): string {
  return code
    .replace(
      /export\s+(?:async\s+)?function\s+generateStaticParams\s*\([^)]*\)(?:\s*:\s*[^{]+)?\s*\{[\s\S]*?^\}\s*/m,
      "",
    )
    .replace(
      /export\s+const\s+generateStaticParams\s*=\s*(?:async\s+)?\([^)]*\)(?:\s*:\s*[^=]+)?\s*=>\s*[\s\S]*?;?\s*(?=\nexport|\n$)/m,
      "",
    );
}

function stripLoaderExport(code: string): string {
  return code
    .replace(
      /export\s+(?:async\s+)?function\s+loader\s*\([^)]*\)(?:\s*:\s*[^{]+)?\s*\{[\s\S]*?^\}\s*/m,
      "",
    )
    .replace(
      /export\s+const\s+loader\s*=\s*(?:async\s+)?\([^)]*\)(?:\s*:\s*[^=]+)?\s*=>\s*[\s\S]*?;?\s*(?=\nexport|\n$)/m,
      "",
    );
}
