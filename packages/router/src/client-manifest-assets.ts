export interface ClientManifestAssetRoute {
  css?: readonly string[] | undefined;
  imports?: readonly string[] | undefined;
  modulePreloads?: readonly string[] | undefined;
  navigationScript?: string | undefined;
  script?: string | undefined;
  sourceMap?: string | undefined;
}

export interface ClientManifestAssetSource {
  assets?: readonly string[] | undefined;
  routes: readonly ClientManifestAssetRoute[];
}

export function clientManifestAssetPaths(
  manifest: ClientManifestAssetSource,
  options: {
    extraPaths?: readonly string[] | undefined;
    prefix?: string | undefined;
  } = {},
): Set<string> {
  const prefix = normalizeClientManifestAssetPrefix(options.prefix ?? "");
  const paths = new Set<string>([`${prefix}manifest.json`]);

  for (const route of manifest.routes) {
    for (const asset of [
      route.script,
      route.sourceMap,
      route.navigationScript,
      ...(route.css ?? []),
      ...(route.imports ?? []),
      ...(route.modulePreloads ?? []),
    ]) {
      const path = safeClientManifestAssetPath(asset);

      if (path !== undefined) {
        paths.add(`${prefix}${path}`);
      }
    }
  }

  for (const asset of manifest.assets ?? []) {
    const path = safeClientManifestAssetPath(asset);

    if (path !== undefined) {
      paths.add(`${prefix}${path}`);
    }
  }

  for (const asset of options.extraPaths ?? []) {
    const path = safeClientManifestAssetPath(asset);

    if (path !== undefined) {
      paths.add(`${prefix}${path}`);
    }
  }

  return paths;
}

function normalizeClientManifestAssetPrefix(prefix: string): string {
  if (prefix === "") {
    return "";
  }

  const withLeadingSlash = prefix.startsWith("/") ? prefix : `/${prefix}`;

  return withLeadingSlash.endsWith("/") ? withLeadingSlash : `${withLeadingSlash}/`;
}

export function safeClientManifestAssetPath(asset: string | undefined): string | undefined {
  if (asset === undefined || asset === "" || asset.startsWith("/") || asset.includes("\\")) {
    return undefined;
  }

  const segments = asset.split("/");

  return segments.some((segment) => unsafeClientManifestAssetSegment(segment))
    ? undefined
    : segments.join("/");
}

function unsafeClientManifestAssetSegment(segment: string): boolean {
  if (segment === "" || segment === "." || segment === "..") {
    return true;
  }

  try {
    const decoded = decodeURIComponent(segment);
    return decoded === "." || decoded === ".." || decoded.includes("/") || decoded.includes("\\");
  } catch {
    return true;
  }
}
