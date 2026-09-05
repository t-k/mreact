import { readFile } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { gzipSync } from "node:zlib";

export type BrowserDeliveryAssetRole =
  | "css"
  | "dynamic-import"
  | "navigation-runtime"
  | "route-entry"
  | "static-import";

export interface BrowserDeliveryChunkManifest {
  dynamicImports?: readonly string[] | undefined;
  file: string;
  imports?: readonly string[] | undefined;
}

export interface BrowserDeliveryRouteManifest {
  css?: readonly string[] | undefined;
  dynamicImports?: readonly string[] | undefined;
  imports?: readonly string[] | undefined;
  navigation?: boolean | undefined;
  navigationScript?: string | undefined;
  path: string;
  script?: string | undefined;
}

export interface BrowserDeliveryManifest {
  chunks?: readonly BrowserDeliveryChunkManifest[] | undefined;
  routes: readonly BrowserDeliveryRouteManifest[];
}

export interface BrowserDeliveryHtmlInput {
  observedTransferBytes?: number | undefined;
  source: string;
}

export interface BrowserDeliveryAssetMeasurement {
  available: boolean;
  gzipEstimateBytes?: number | undefined;
  observedTransferBytes?: number | undefined;
  path: string;
  rawBytes?: number | undefined;
  roles: readonly BrowserDeliveryAssetRole[];
}

export interface BrowserDeliveryClosureMeasurement {
  assets: readonly BrowserDeliveryAssetMeasurement[];
  gzipEstimateBytes: number;
  observedTransferBytes?: number | undefined;
  paths: readonly string[];
  rawBytes: number;
  unavailablePaths: readonly string[];
}

export interface BrowserDeliveryNavigationMeasurement extends BrowserDeliveryClosureMeasurement {
  cachedPaths: readonly string[];
  fetchedPaths: readonly string[];
  from: string;
  reachableDynamicImports: readonly string[];
  to: string;
}

export interface BrowserDeliveryHtmlMeasurement {
  gzipEstimateBytes: number;
  inlineScriptRawBytes: number;
  observedTransferBytes?: number | undefined;
  queryDataRawBytes: number;
  rawBytes: number;
  restorationRawBytes: number;
}

export interface BrowserDeliveryReport {
  html?: BrowserDeliveryHtmlMeasurement | undefined;
  initial: BrowserDeliveryClosureMeasurement;
  navigation?: BrowserDeliveryNavigationMeasurement | undefined;
  version: 1;
}

export interface MeasureBrowserDeliveryOptions {
  clientDir: string;
  html?: BrowserDeliveryHtmlInput | undefined;
  initialIncludesNavigationRuntime?: boolean | undefined;
  initialPath: string;
  manifest: BrowserDeliveryManifest;
  navigation?:
    | {
        from: string;
        fetchedDynamicImports?: readonly string[] | undefined;
        includeNavigationRuntime?: boolean | undefined;
        observedTransfers?: Readonly<Record<string, number>> | undefined;
        to: string;
      }
    | undefined;
  observedTransfers?: Readonly<Record<string, number>> | undefined;
}

/** Measures fetched client assets from the production route manifest without counting a file twice. */
export async function measureBrowserDelivery(
  options: MeasureBrowserDeliveryOptions,
): Promise<BrowserDeliveryReport> {
  const chunks = new Map(options.manifest.chunks?.map((chunk) => [chunk.file, chunk]) ?? []);
  const routes = new Map(options.manifest.routes.map((route) => [route.path, route]));
  const initialRoute = routeForPath(routes, options.initialPath);
  const initial = await measureClosure({
    clientDir: options.clientDir,
    includeNavigationRuntime: options.initialIncludesNavigationRuntime === true,
    manifest: options.manifest,
    observedTransfers: options.observedTransfers,
    route: initialRoute,
    chunks,
  });

  const navigation =
    options.navigation === undefined
      ? undefined
      : await measureNavigation({
          clientDir: options.clientDir,
          chunks,
          from: routeForPath(routes, options.navigation.from),
          fetchedDynamicImports: options.navigation.fetchedDynamicImports ?? [],
          includeNavigationRuntime: options.navigation.includeNavigationRuntime === true,
          manifest: options.manifest,
          observedTransfers: options.navigation.observedTransfers,
          to: routeForPath(routes, options.navigation.to),
        });

  return {
    ...(options.html === undefined ? {} : { html: measureHtml(options.html) }),
    initial,
    ...(navigation === undefined ? {} : { navigation }),
    version: 1,
  };
}

async function measureNavigation(options: {
  clientDir: string;
  chunks: ReadonlyMap<string, BrowserDeliveryChunkManifest>;
  fetchedDynamicImports: readonly string[];
  from: BrowserDeliveryRouteManifest;
  includeNavigationRuntime: boolean;
  manifest: BrowserDeliveryManifest;
  observedTransfers?: Readonly<Record<string, number>> | undefined;
  to: BrowserDeliveryRouteManifest;
}): Promise<BrowserDeliveryNavigationMeasurement> {
  const previous = collectAssetRoles({
    chunks: options.chunks,
    includeNavigationRuntime: options.includeNavigationRuntime,
    route: options.from,
  });
  const next = collectAssetRoles({
    chunks: options.chunks,
    dynamicImports: options.fetchedDynamicImports,
    includeNavigationRuntime: options.includeNavigationRuntime,
    route: options.to,
  });
  const reachableDynamicImports = uniqueSorted(options.to.dynamicImports ?? []);
  const cachedPaths = uniqueSorted([...previous.keys()]);
  const fetchedRoles = new Map<string, Set<BrowserDeliveryAssetRole>>();

  for (const [path, roles] of next) {
    if (previous.has(path)) {
      continue;
    }

    fetchedRoles.set(path, roles);
  }

  const closure = await measureAssetMap(options.clientDir, fetchedRoles, options.observedTransfers);

  return {
    ...closure,
    cachedPaths,
    fetchedPaths: closure.paths,
    from: options.from.path,
    reachableDynamicImports,
    to: options.to.path,
  };
}

async function measureClosure(options: {
  clientDir: string;
  chunks: ReadonlyMap<string, BrowserDeliveryChunkManifest>;
  includeNavigationRuntime: boolean;
  manifest: BrowserDeliveryManifest;
  observedTransfers?: Readonly<Record<string, number>> | undefined;
  route: BrowserDeliveryRouteManifest;
}): Promise<BrowserDeliveryClosureMeasurement> {
  const roles = collectAssetRoles({
    chunks: options.chunks,
    includeNavigationRuntime: options.includeNavigationRuntime,
    route: options.route,
  });

  return await measureAssetMap(options.clientDir, roles, options.observedTransfers);
}

function collectAssetRoles(options: {
  chunks: ReadonlyMap<string, BrowserDeliveryChunkManifest>;
  dynamicImports?: readonly string[] | undefined;
  includeNavigationRuntime: boolean;
  route: BrowserDeliveryRouteManifest;
}): Map<string, Set<BrowserDeliveryAssetRole>> {
  const roles = new Map<string, Set<BrowserDeliveryAssetRole>>();
  const add = (path: string | undefined, role: BrowserDeliveryAssetRole): void => {
    if (path === undefined || path === "") {
      return;
    }

    const current = roles.get(path) ?? new Set<BrowserDeliveryAssetRole>();
    current.add(role);
    roles.set(path, current);
  };

  const visitStatic = (path: string | undefined, role: BrowserDeliveryAssetRole): void => {
    if (path === undefined || path === "" || roles.has(path)) {
      if (path !== undefined && path !== "") {
        add(path, role);
      }
      return;
    }

    add(path, role);
    const chunk = options.chunks.get(path);
    for (const imported of chunk?.imports ?? []) {
      visitStatic(imported, "static-import");
    }
  };

  visitStatic(options.route.script, "route-entry");
  for (const imported of options.route.imports ?? []) {
    visitStatic(imported, "static-import");
  }
  for (const css of options.route.css ?? []) {
    add(css, "css");
  }
  if (options.includeNavigationRuntime && options.route.navigation === true) {
    add(options.route.navigationScript, "navigation-runtime");
  }
  for (const dynamic of options.dynamicImports ?? []) {
    visitStatic(dynamic, "dynamic-import");
  }

  return roles;
}

async function measureAssetMap(
  clientDir: string,
  roles: ReadonlyMap<string, Set<BrowserDeliveryAssetRole>>,
  observedTransfers: Readonly<Record<string, number>> | undefined,
): Promise<BrowserDeliveryClosureMeasurement> {
  const assets = await Promise.all(
    [...roles.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(async ([path, assetRoles]): Promise<BrowserDeliveryAssetMeasurement> => {
        const safePath = safeRelativePath(path);
        if (safePath === undefined) {
          return {
            available: false,
            path,
            roles: [...assetRoles].sort(),
          };
        }

        try {
          const content = await readFile(resolve(clientDir, safePath));
          return {
            available: true,
            gzipEstimateBytes: gzipSync(content).byteLength,
            ...(observedTransfers?.[path] === undefined
              ? {}
              : { observedTransferBytes: observedTransfers[path] }),
            path,
            rawBytes: content.byteLength,
            roles: [...assetRoles].sort(),
          };
        } catch {
          return {
            available: false,
            ...(observedTransfers?.[path] === undefined
              ? {}
              : { observedTransferBytes: observedTransfers[path] }),
            path,
            roles: [...assetRoles].sort(),
          };
        }
      }),
  );
  const available = assets.filter(
    (
      asset,
    ): asset is BrowserDeliveryAssetMeasurement & { gzipEstimateBytes: number; rawBytes: number } =>
      asset.available && asset.gzipEstimateBytes !== undefined && asset.rawBytes !== undefined,
  );
  const observedTransferBytes = assets.reduce(
    (total, asset) => total + (asset.observedTransferBytes ?? 0),
    0,
  );

  return {
    assets,
    gzipEstimateBytes: available.reduce((total, asset) => total + asset.gzipEstimateBytes, 0),
    ...(observedTransferBytes === 0 ? {} : { observedTransferBytes }),
    paths: assets.map((asset) => asset.path),
    rawBytes: available.reduce((total, asset) => total + asset.rawBytes, 0),
    unavailablePaths: assets.filter((asset) => !asset.available).map((asset) => asset.path),
  };
}

function measureHtml(input: BrowserDeliveryHtmlInput): BrowserDeliveryHtmlMeasurement {
  const rawBytes = Buffer.byteLength(input.source);
  let inlineScriptRawBytes = 0;
  let queryDataRawBytes = 0;
  let restorationRawBytes = 0;
  const scriptPattern = /<script\b(?<attributes>[^>]*)>(?<content>[\s\S]*?)<\/script\s*>/giu;

  for (const match of input.source.matchAll(scriptPattern)) {
    const attributes = match.groups?.attributes ?? "";
    const content = match.groups?.content ?? "";
    const bytes = Buffer.byteLength(content);
    const marker = attributes.toLowerCase();

    if (marker.includes("query")) {
      queryDataRawBytes += bytes;
    } else if (marker.includes("mreact-props") || marker.includes("restor")) {
      restorationRawBytes += bytes;
    } else {
      inlineScriptRawBytes += bytes;
    }
  }

  return {
    gzipEstimateBytes: gzipSync(Buffer.from(input.source)).byteLength,
    inlineScriptRawBytes,
    ...(input.observedTransferBytes === undefined
      ? {}
      : { observedTransferBytes: input.observedTransferBytes }),
    queryDataRawBytes,
    rawBytes,
    restorationRawBytes,
  };
}

function routeForPath(
  routes: ReadonlyMap<string, BrowserDeliveryRouteManifest>,
  path: string,
): BrowserDeliveryRouteManifest {
  const route = routes.get(path);
  if (route === undefined) {
    throw new Error(`Browser delivery manifest does not contain route ${JSON.stringify(path)}.`);
  }

  return route;
}

function safeRelativePath(path: string): string | undefined {
  if (path === "" || isAbsolute(path) || path.includes("\\")) {
    return undefined;
  }

  const normalized = resolve(".", path);
  const relativePath = relative(".", normalized);
  return relativePath === "" || relativePath.startsWith(`..${sep}`) || relativePath === ".."
    ? undefined
    : relativePath.split(sep).join("/");
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}
