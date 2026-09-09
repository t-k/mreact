import { readFile } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import {
  brotliEstimateBytes,
  deliveryCompressionSettings,
  gzipEstimateBytes,
  type DeliveryCompressionSettings,
} from "./compression.js";

export type BrowserDeliveryAssetRole =
  | "css"
  | "dynamic-import"
  | "navigation-runtime"
  | "preload"
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
  brotliEstimateBytes?: number | undefined;
  gzipEstimateBytes?: number | undefined;
  observedTransferBytes?: number | undefined;
  path: string;
  rawBytes?: number | undefined;
  roles: readonly BrowserDeliveryAssetRole[];
}

export interface BrowserDeliveryClosureMeasurement {
  assets: readonly BrowserDeliveryAssetMeasurement[];
  brotliEstimateBytes: number;
  gzipEstimateBytes: number;
  observedTransferBytes?: number | undefined;
  paths: readonly string[];
  rawBytes: number;
  unavailablePaths: readonly string[];
}

/** A closure fetched after some bytes are already in the browser cache. */
export interface BrowserDeliveryFetchPhaseMeasurement extends BrowserDeliveryClosureMeasurement {
  cachedPaths: readonly string[];
  fetchedPaths: readonly string[];
  reachableDynamicImports: readonly string[];
}

export interface BrowserDeliveryNavigationMeasurement extends BrowserDeliveryFetchPhaseMeasurement {
  from: string;
  to: string;
}

export interface BrowserDeliverySessionVisitMeasurement
  extends BrowserDeliveryFetchPhaseMeasurement {
  path: string;
}

export interface BrowserDeliverySessionMeasurement {
  cumulative: BrowserDeliveryClosureMeasurement;
  routeVisitCount: number;
  visits: readonly BrowserDeliverySessionVisitMeasurement[];
}

export interface BrowserDeliveryHtmlMeasurement {
  brotliEstimateBytes: number;
  gzipEstimateBytes: number;
  inlineScriptRawBytes: number;
  observedTransferBytes?: number | undefined;
  queryDataRawBytes: number;
  rawBytes: number;
  restorationRawBytes: number;
  routerMetadataRawBytes: number;
}

export interface BrowserDeliveryReport {
  compression: DeliveryCompressionSettings;
  firstInteraction?: BrowserDeliveryFetchPhaseMeasurement | undefined;
  html?: BrowserDeliveryHtmlMeasurement | undefined;
  initial: BrowserDeliveryClosureMeasurement;
  navigation?: BrowserDeliveryNavigationMeasurement | undefined;
  preload?: BrowserDeliveryFetchPhaseMeasurement | undefined;
  session?: BrowserDeliverySessionMeasurement | undefined;
  version: 2;
}

export interface BrowserDeliverySessionVisitInput {
  fetchedDynamicImports?: readonly string[] | undefined;
  path: string;
}

export interface MeasureBrowserDeliveryOptions {
  clientDir: string;
  /** Dynamic imports the browser fetches for the initial route after the first user interaction. */
  firstInteraction?:
    | {
        fetchedDynamicImports: readonly string[];
        observedTransfers?: Readonly<Record<string, number>> | undefined;
      }
    | undefined;
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
  /** Assets the browser actually fetched from `modulepreload`/prefetch hints, with their closure. */
  preload?:
    | {
        fetchedPreloads: readonly string[];
        observedTransfers?: Readonly<Record<string, number>> | undefined;
      }
    | undefined;
  /** Route visits after the initial page, used for cumulative unique JavaScript accounting. */
  session?:
    | {
        includeNavigationRuntime?: boolean | undefined;
        observedTransfers?: Readonly<Record<string, number>> | undefined;
        visits: readonly BrowserDeliverySessionVisitInput[];
      }
    | undefined;
}

/** Measures fetched client assets from the production route manifest without counting a file twice. */
export async function measureBrowserDelivery(
  options: MeasureBrowserDeliveryOptions,
): Promise<BrowserDeliveryReport> {
  const chunks = new Map(options.manifest.chunks?.map((chunk) => [chunk.file, chunk]) ?? []);
  const routes = new Map(options.manifest.routes.map((route) => [route.path, route]));
  const initialRoute = routeForPath(routes, options.initialPath);
  const initialRoles = collectAssetRoles({
    chunks,
    includeNavigationRuntime: options.initialIncludesNavigationRuntime === true,
    route: initialRoute,
  });
  const initial = await measureAssetMap(
    options.clientDir,
    initialRoles,
    options.observedTransfers,
  );
  const fetched = new Map(initialRoles);
  const initialReachableDynamicImports = uniqueSorted(initialRoute.dynamicImports ?? []);

  const preload =
    options.preload === undefined
      ? undefined
      : await measureFetchPhase({
          chunks,
          clientDir: options.clientDir,
          fetched,
          observedTransfers: options.preload.observedTransfers,
          reachableDynamicImports: initialReachableDynamicImports,
          requested: collectPathRoles({
            chunks,
            paths: options.preload.fetchedPreloads,
            role: "preload",
          }),
        });

  const firstInteraction =
    options.firstInteraction === undefined
      ? undefined
      : await measureFetchPhase({
          chunks,
          clientDir: options.clientDir,
          fetched,
          observedTransfers: options.firstInteraction.observedTransfers,
          reachableDynamicImports: initialReachableDynamicImports,
          requested: collectPathRoles({
            chunks,
            paths: options.firstInteraction.fetchedDynamicImports,
            role: "dynamic-import",
          }),
        });

  const navigation =
    options.navigation === undefined
      ? undefined
      : await measureNavigation({
          chunks,
          clientDir: options.clientDir,
          fetched,
          from: routeForPath(routes, options.navigation.from),
          fetchedDynamicImports: options.navigation.fetchedDynamicImports ?? [],
          includeNavigationRuntime: options.navigation.includeNavigationRuntime === true,
          observedTransfers: options.navigation.observedTransfers,
          to: routeForPath(routes, options.navigation.to),
        });

  const session =
    options.session === undefined
      ? undefined
      : await measureSession({
          chunks,
          clientDir: options.clientDir,
          fetched,
          includeNavigationRuntime:
            options.session.includeNavigationRuntime ??
            options.initialIncludesNavigationRuntime === true,
          observedTransfers: options.session.observedTransfers,
          routes,
          visits: options.session.visits,
        });

  return {
    compression: deliveryCompressionSettings,
    ...(firstInteraction === undefined ? {} : { firstInteraction }),
    ...(options.html === undefined ? {} : { html: measureHtml(options.html) }),
    initial,
    ...(navigation === undefined ? {} : { navigation }),
    ...(preload === undefined ? {} : { preload }),
    ...(session === undefined ? {} : { session }),
    version: 2,
  };
}

async function measureFetchPhase(options: {
  chunks: ReadonlyMap<string, BrowserDeliveryChunkManifest>;
  clientDir: string;
  fetched: Map<string, Set<BrowserDeliveryAssetRole>>;
  observedTransfers?: Readonly<Record<string, number>> | undefined;
  reachableDynamicImports: readonly string[];
  requested: ReadonlyMap<string, Set<BrowserDeliveryAssetRole>>;
}): Promise<BrowserDeliveryFetchPhaseMeasurement> {
  const cachedPaths = uniqueSorted([...options.fetched.keys()]);
  const newRoles = subtractFetched(options.requested, options.fetched);
  const closure = await measureAssetMap(options.clientDir, newRoles, options.observedTransfers);
  recordFetched(options.fetched, options.requested);

  return {
    ...closure,
    cachedPaths,
    fetchedPaths: closure.paths,
    reachableDynamicImports: options.reachableDynamicImports,
  };
}

async function measureNavigation(options: {
  chunks: ReadonlyMap<string, BrowserDeliveryChunkManifest>;
  clientDir: string;
  fetched: Map<string, Set<BrowserDeliveryAssetRole>>;
  fetchedDynamicImports: readonly string[];
  from: BrowserDeliveryRouteManifest;
  includeNavigationRuntime: boolean;
  observedTransfers?: Readonly<Record<string, number>> | undefined;
  to: BrowserDeliveryRouteManifest;
}): Promise<BrowserDeliveryNavigationMeasurement> {
  const previous = collectAssetRoles({
    chunks: options.chunks,
    includeNavigationRuntime: options.includeNavigationRuntime,
    route: options.from,
  });
  const cached = new Map(previous);
  recordFetched(cached, options.fetched);
  const next = collectAssetRoles({
    chunks: options.chunks,
    dynamicImports: options.fetchedDynamicImports,
    includeNavigationRuntime: options.includeNavigationRuntime,
    route: options.to,
  });
  const phase = await measureFetchPhase({
    chunks: options.chunks,
    clientDir: options.clientDir,
    fetched: cached,
    observedTransfers: options.observedTransfers,
    reachableDynamicImports: uniqueSorted(options.to.dynamicImports ?? []),
    requested: next,
  });
  recordFetched(options.fetched, next);

  return { ...phase, from: options.from.path, to: options.to.path };
}

async function measureSession(options: {
  chunks: ReadonlyMap<string, BrowserDeliveryChunkManifest>;
  clientDir: string;
  fetched: Map<string, Set<BrowserDeliveryAssetRole>>;
  includeNavigationRuntime: boolean;
  observedTransfers?: Readonly<Record<string, number>> | undefined;
  routes: ReadonlyMap<string, BrowserDeliveryRouteManifest>;
  visits: readonly BrowserDeliverySessionVisitInput[];
}): Promise<BrowserDeliverySessionMeasurement> {
  const cumulativeRoles = new Map(options.fetched);
  const visits: BrowserDeliverySessionVisitMeasurement[] = [];

  for (const visit of options.visits) {
    const route = routeForPath(options.routes, visit.path);
    const requested = collectAssetRoles({
      chunks: options.chunks,
      dynamicImports: visit.fetchedDynamicImports,
      includeNavigationRuntime: options.includeNavigationRuntime,
      route,
    });
    const phase = await measureFetchPhase({
      chunks: options.chunks,
      clientDir: options.clientDir,
      fetched: options.fetched,
      observedTransfers: options.observedTransfers,
      reachableDynamicImports: uniqueSorted(route.dynamicImports ?? []),
      requested,
    });
    recordFetched(cumulativeRoles, requested);
    visits.push({ ...phase, path: visit.path });
  }

  return {
    cumulative: await measureAssetMap(
      options.clientDir,
      cumulativeRoles,
      options.observedTransfers,
    ),
    routeVisitCount: options.visits.length + 1,
    visits,
  };
}

function subtractFetched(
  requested: ReadonlyMap<string, Set<BrowserDeliveryAssetRole>>,
  fetched: ReadonlyMap<string, Set<BrowserDeliveryAssetRole>>,
): Map<string, Set<BrowserDeliveryAssetRole>> {
  const remaining = new Map<string, Set<BrowserDeliveryAssetRole>>();

  for (const [path, roles] of requested) {
    if (fetched.has(path)) {
      continue;
    }

    remaining.set(path, roles);
  }

  return remaining;
}

function recordFetched(
  target: Map<string, Set<BrowserDeliveryAssetRole>>,
  source: ReadonlyMap<string, Set<BrowserDeliveryAssetRole>>,
): void {
  for (const [path, roles] of source) {
    const current = target.get(path) ?? new Set<BrowserDeliveryAssetRole>();
    for (const role of roles) {
      current.add(role);
    }
    target.set(path, current);
  }
}

function collectPathRoles(options: {
  chunks: ReadonlyMap<string, BrowserDeliveryChunkManifest>;
  paths: readonly string[];
  role: BrowserDeliveryAssetRole;
}): Map<string, Set<BrowserDeliveryAssetRole>> {
  const roles = new Map<string, Set<BrowserDeliveryAssetRole>>();

  for (const path of options.paths) {
    visitStaticClosure({ chunks: options.chunks, path, role: options.role, roles });
  }

  return roles;
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
    if (path === undefined) {
      return;
    }

    visitStaticClosure({ chunks: options.chunks, path, role, roles });
  };

  visitStatic(options.route.script, "route-entry");
  for (const imported of options.route.imports ?? []) {
    visitStatic(imported, "static-import");
  }
  for (const css of options.route.css ?? []) {
    add(css, "css");
  }
  if (options.includeNavigationRuntime && options.route.navigation === true) {
    visitStatic(options.route.navigationScript, "navigation-runtime");
  }
  for (const dynamic of options.dynamicImports ?? []) {
    visitStatic(dynamic, "dynamic-import");
  }

  return roles;
}

function visitStaticClosure(options: {
  chunks: ReadonlyMap<string, BrowserDeliveryChunkManifest>;
  path: string;
  role: BrowserDeliveryAssetRole;
  roles: Map<string, Set<BrowserDeliveryAssetRole>>;
}): void {
  if (options.path === "") {
    return;
  }

  const known = options.roles.get(options.path);
  const current = known ?? new Set<BrowserDeliveryAssetRole>();
  current.add(options.role);
  options.roles.set(options.path, current);

  if (known !== undefined) {
    return;
  }

  for (const imported of options.chunks.get(options.path)?.imports ?? []) {
    visitStaticClosure({ ...options, path: imported, role: "static-import" });
  }
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
            brotliEstimateBytes: brotliEstimateBytes(content),
            gzipEstimateBytes: gzipEstimateBytes(content),
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
    ): asset is BrowserDeliveryAssetMeasurement & {
      brotliEstimateBytes: number;
      gzipEstimateBytes: number;
      rawBytes: number;
    } =>
      asset.available &&
      asset.brotliEstimateBytes !== undefined &&
      asset.gzipEstimateBytes !== undefined &&
      asset.rawBytes !== undefined,
  );
  const observedTransferBytes = assets.reduce(
    (total, asset) => total + (asset.observedTransferBytes ?? 0),
    0,
  );

  return {
    assets,
    brotliEstimateBytes: available.reduce((total, asset) => total + asset.brotliEstimateBytes, 0),
    gzipEstimateBytes: available.reduce((total, asset) => total + asset.gzipEstimateBytes, 0),
    ...(observedTransferBytes === 0 ? {} : { observedTransferBytes }),
    paths: assets.map((asset) => asset.path),
    rawBytes: available.reduce((total, asset) => total + asset.rawBytes, 0),
    unavailablePaths: assets.filter((asset) => !asset.available).map((asset) => asset.path),
  };
}

const queryStateScriptId = "__mreact_query_state";
const restorationScriptIdPrefixes = ["mreact-props-", "mreact-client-references-"] as const;
const routerMetadataScriptIds = ["mreact-navigation-runtime", "mreact-route-prefetch-manifest"];

function measureHtml(input: BrowserDeliveryHtmlInput): BrowserDeliveryHtmlMeasurement {
  const rawBytes = Buffer.byteLength(input.source);
  let inlineScriptRawBytes = 0;
  let queryDataRawBytes = 0;
  let restorationRawBytes = 0;
  let routerMetadataRawBytes = 0;
  const scriptPattern = /<script\b(?<attributes>[^>]*)>(?<content>[\s\S]*?)<\/script\s*>/giu;

  for (const match of input.source.matchAll(scriptPattern)) {
    const scriptId = parseScriptId(match.groups?.attributes ?? "");
    const bytes = Buffer.byteLength(match.groups?.content ?? "");

    if (scriptId === queryStateScriptId) {
      queryDataRawBytes += bytes;
    } else if (restorationScriptIdPrefixes.some((prefix) => scriptId.startsWith(prefix))) {
      restorationRawBytes += bytes;
    } else if (routerMetadataScriptIds.includes(scriptId)) {
      routerMetadataRawBytes += bytes;
    } else {
      inlineScriptRawBytes += bytes;
    }
  }

  return {
    brotliEstimateBytes: brotliEstimateBytes(Buffer.from(input.source)),
    gzipEstimateBytes: gzipEstimateBytes(Buffer.from(input.source)),
    inlineScriptRawBytes,
    ...(input.observedTransferBytes === undefined
      ? {}
      : { observedTransferBytes: input.observedTransferBytes }),
    queryDataRawBytes,
    rawBytes,
    restorationRawBytes,
    routerMetadataRawBytes,
  };
}

function parseScriptId(attributes: string): string {
  const match = /\bid\s*=\s*(?:"(?<double>[^"]*)"|'(?<single>[^']*)'|(?<bare>[^\s"'=<>`]+))/iu.exec(
    attributes,
  );
  return match?.groups?.double ?? match?.groups?.single ?? match?.groups?.bare ?? "";
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
