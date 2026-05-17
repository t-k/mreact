import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  collectIdentifierReferenceNames,
  collectJsxComponentRootNames,
  collectStaticExportReferences,
  collectStaticImportReferences,
  formatDiagnostic,
  hasClientRuntimeSyntax,
  transform,
  type ClientReferenceMetadata,
  type StaticExportReference,
  type StaticImportReference,
} from "@reckona/mreact-compiler";
import { build } from "esbuild";
import { assetPath } from "./assets.js";
import type { AppRoute } from "./routes.js";
import { stripRouteClientOnlyExports } from "./route-source.js";
import { escapeHtmlQuotedAttribute as escapeHtmlAttribute } from "@reckona/mreact-shared/html-escape";

export interface ClientRouteManifestEntry {
  bytes?: number;
  path: string;
  kind: AppRoute["kind"];
  client: boolean;
  devScript?: string;
  routeId?: string;
  script?: string;
  sourceMap?: string;
}

export interface ClientRouteInferenceCache {
  exportsByFile: Map<string, Promise<StaticExportReference[]>>;
  importsByFile: Map<string, Promise<StaticImportReference[]>>;
  resolvedByImport: Map<string, Promise<string | undefined>>;
  sourceByFile: Map<string, Promise<string>>;
}

export interface ClientRouteInferenceResult {
  client: boolean;
  clientBoundaryImports: string[];
  diagnostics: ClientRouteInferenceDiagnostic[];
}

export interface ClientRouteInferenceDiagnostic {
  code: "MR_CLIENT_BOUNDARY_INFERENCE_UNSUPPORTED_REFERENCE";
  filename: string;
  level: "warn";
  localNames: string[];
  message: string;
  source: string;
}

export async function routeToClientManifestEntry(
  route: AppRoute,
): Promise<ClientRouteManifestEntry> {
  if (route.kind === "server") {
    return { path: route.path, kind: route.kind, client: false };
  }

  const code = await readFile(route.file, "utf8");
  const inference = await inferClientRouteModule({
    code: stripRouteClientOnlyExports(code),
    filename: route.file,
    routePath: route.path,
  });

  return inference.client
    ? {
        path: route.path,
        kind: route.kind,
        client: true,
        routeId: routeIdForPath(route.path),
        script: clientScriptForPath(route.path),
      }
    : { path: route.path, kind: route.kind, client: false };
}

export function createClientRouteInferenceCache(): ClientRouteInferenceCache {
  return {
    exportsByFile: new Map(),
    importsByFile: new Map(),
    resolvedByImport: new Map(),
    sourceByFile: new Map(),
  };
}

export async function isClientRouteModule(options: {
  cache?: ClientRouteInferenceCache | undefined;
  code: string;
  filename: string;
  routePath?: string | undefined;
}): Promise<boolean> {
  return (await inferClientRouteModule(options)).client;
}

export async function inferClientRouteModule(options: {
  cache?: ClientRouteInferenceCache | undefined;
  code: string;
  filename: string;
  routePath?: string | undefined;
}): Promise<ClientRouteInferenceResult> {
  const cache = options.cache ?? createClientRouteInferenceCache();

  try {
    return await inferClientRouteModuleSource({
      cache,
      code: options.code,
      filename: options.filename,
      root: true,
      seen: new Set(),
    });
  } catch (error) {
    throw new Error(
      `Failed to infer client route for ${options.routePath ?? "<unknown>"} (${options.filename}).\n${errorMessage(error)}`,
      { cause: error },
    );
  }
}

export function isClientRouteSource(code: string): boolean {
  return hasClientRuntimeSyntax({ code });
}

async function inferClientRouteModuleSource(options: {
  cache: ClientRouteInferenceCache;
  code: string;
  filename: string;
  root: boolean;
  seen: Set<string>;
}): Promise<ClientRouteInferenceResult> {
  if (isClientRouteSource(options.code)) {
    return { client: true, clientBoundaryImports: [], diagnostics: [] };
  }

  if (options.seen.has(options.filename)) {
    return { client: false, clientBoundaryImports: [], diagnostics: [] };
  }

  options.seen.add(options.filename);

  try {
    const clientBoundaryImports: string[] = [];
    const diagnostics: ClientRouteInferenceDiagnostic[] = [];
    let clientProxy = false;
    const jsxComponentRoots = new Set(
      collectJsxComponentRootNames({
        code: options.code,
        filename: options.filename,
      }),
    );
    const identifierReferences = new Set(
      collectIdentifierReferenceNames({
        code: options.code,
        filename: options.filename,
      }),
    );

    for (const reference of await staticImportReferencesForSource(options)) {
      const resolved = await resolveAppLocalModule({
        cache: options.cache,
        importer: options.filename,
        specifier: reference.source,
      });

      if (resolved === undefined) {
        continue;
      }

      const source = await readCachedFile(options.cache, resolved);
      const imported = await inferClientRouteModuleSource({
        cache: options.cache,
        code: source,
        filename: resolved,
        root: false,
        seen: options.seen,
      });
      diagnostics.push(...imported.diagnostics);

      if (!imported.client) {
        continue;
      }

      if (isRenderedImportReference(reference, jsxComponentRoots)) {
        clientBoundaryImports.push(reference.source);
        continue;
      }

      const diagnostic = unsupportedClientImportReferenceDiagnostic({
        filename: options.filename,
        identifierReferences,
        reference,
      });

      if (diagnostic !== undefined) {
        diagnostics.push(diagnostic);
      }
    }

    if (!options.root) {
      for (const reference of await staticExportReferencesForSource(options)) {
        const resolved = await resolveAppLocalModule({
          cache: options.cache,
          importer: options.filename,
          specifier: reference.source,
        });

        if (resolved === undefined) {
          continue;
        }

        const source = await readCachedFile(options.cache, resolved);
        const exported = await inferClientRouteModuleSource({
          cache: options.cache,
          code: source,
          filename: resolved,
          root: false,
          seen: options.seen,
        });
        diagnostics.push(...exported.diagnostics);

        if (exported.client) {
          clientProxy = true;
        }
      }
    }

    return {
      client: clientBoundaryImports.length > 0 || clientProxy,
      clientBoundaryImports,
      diagnostics,
    };
  } finally {
    options.seen.delete(options.filename);
  }
}

async function staticImportReferencesForSource(options: {
  cache: ClientRouteInferenceCache;
  code: string;
  filename: string;
}): Promise<StaticImportReference[]> {
  const cached = options.cache.importsByFile.get(options.filename);

  if (cached !== undefined) {
    return cached;
  }

  const imports = Promise.resolve().then(() =>
    collectStaticImportReferences({
      code: options.code,
      filename: options.filename,
    }),
  );
  options.cache.importsByFile.set(options.filename, imports);
  return imports;
}

async function staticExportReferencesForSource(options: {
  cache: ClientRouteInferenceCache;
  code: string;
  filename: string;
}): Promise<StaticExportReference[]> {
  const cached = options.cache.exportsByFile.get(options.filename);

  if (cached !== undefined) {
    return cached;
  }

  const exports = Promise.resolve().then(() =>
    collectStaticExportReferences({
      code: options.code,
      filename: options.filename,
    }),
  );
  options.cache.exportsByFile.set(options.filename, exports);
  return exports;
}

function isRenderedImportReference(
  reference: StaticImportReference,
  jsxComponentRoots: ReadonlySet<string>,
): boolean {
  return (
    reference.sideEffect ||
    reference.localNames.some((localName) => jsxComponentRoots.has(localName))
  );
}

function unsupportedClientImportReferenceDiagnostic(options: {
  filename: string;
  identifierReferences: ReadonlySet<string>;
  reference: StaticImportReference;
}): ClientRouteInferenceDiagnostic | undefined {
  if (options.reference.sideEffect) {
    return undefined;
  }

  const localNames = options.reference.localNames.filter((name) =>
    options.identifierReferences.has(name),
  );

  if (localNames.length === 0) {
    return undefined;
  }

  return {
    code: "MR_CLIENT_BOUNDARY_INFERENCE_UNSUPPORTED_REFERENCE",
    filename: options.filename,
    level: "warn",
    localNames,
    message:
      `${options.filename}: client component import ${JSON.stringify(options.reference.source)} ` +
      `is referenced as ${localNames.map((name) => JSON.stringify(name)).join(", ")} but ` +
      "was not rendered through a supported static JSX pattern. Automatic client boundary " +
      "detection supports direct JSX such as <Counter />, JSX member roots such as " +
      "<components.Counter />, and simple aliases such as const Alias = Counter. For dynamic " +
      `registries or computed component selection, add ${JSON.stringify(options.reference.source)} ` +
      "to clientBoundaryImports.",
    source: options.reference.source,
  };
}

export function formatClientRouteInferenceDiagnostic(
  diagnostic: ClientRouteInferenceDiagnostic,
): string {
  return `${diagnostic.code}: ${diagnostic.message}`;
}

async function resolveAppLocalModule(options: {
  cache: ClientRouteInferenceCache;
  importer: string;
  specifier: string;
}): Promise<string | undefined> {
  if (!options.specifier.startsWith(".")) {
    return undefined;
  }

  const cacheKey = `${options.importer}\0${options.specifier}`;
  const cached = options.cache.resolvedByImport.get(cacheKey);

  if (cached !== undefined) {
    return cached;
  }

  const resolved = resolveAppLocalModuleUncached(options.importer, options.specifier);
  options.cache.resolvedByImport.set(cacheKey, resolved);
  return resolved;
}

async function resolveAppLocalModuleUncached(
  importer: string,
  specifier: string,
): Promise<string | undefined> {
  const base = join(dirname(importer), specifier);
  const candidates = sourceModuleCandidates(base);

  if (candidates.length === 0) {
    return undefined;
  }

  for (const candidate of candidates) {
    if (await isFile(candidate)) {
      return candidate;
    }
  }

  throw new Error(`${importer}: could not resolve app-local import ${JSON.stringify(specifier)}.`);
}

function sourceModuleCandidates(base: string): string[] {
  if (hasSourceModuleExtension(base)) {
    return [base, ...typescriptSourceModuleCandidates(base)];
  }

  if (extname(base) !== "") {
    return [];
  }

  return [
    `${base}.ts`,
    `${base}.tsx`,
    `${base}.mreact.tsx`,
    `${base}.js`,
    `${base}.jsx`,
    `${base}.mjs`,
    `${base}.mts`,
    `${base}.cjs`,
    `${base}.cts`,
    join(base, "index.ts"),
    join(base, "index.tsx"),
    join(base, "index.mreact.tsx"),
    join(base, "index.js"),
    join(base, "index.jsx"),
    join(base, "index.mjs"),
    join(base, "index.mts"),
    join(base, "index.cjs"),
    join(base, "index.cts"),
  ];
}

function hasSourceModuleExtension(path: string): boolean {
  return /\.(?:mreact\.tsx|tsx?|jsx?|mjs|mts|cjs|cts)$/.test(path);
}

function typescriptSourceModuleCandidates(path: string): string[] {
  if (path.endsWith(".js")) {
    return [`${path.slice(0, -3)}.ts`, `${path.slice(0, -3)}.tsx`];
  }

  if (path.endsWith(".jsx")) {
    return [`${path.slice(0, -4)}.tsx`];
  }

  if (path.endsWith(".mjs")) {
    return [`${path.slice(0, -4)}.mts`];
  }

  if (path.endsWith(".cjs")) {
    return [`${path.slice(0, -4)}.cts`];
  }

  return [];
}

async function isFile(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

function readCachedFile(cache: ClientRouteInferenceCache, filename: string): Promise<string> {
  const cached = cache.sourceByFile.get(filename);

  if (cached !== undefined) {
    return cached;
  }

  const source = readFile(filename, "utf8");
  cache.sourceByFile.set(filename, source);
  return source;
}

export function routeIdForPath(path: string): string {
  if (path === "/") {
    return "index";
  }

  return path
    .slice(1)
    .replaceAll("/", "_")
    .replaceAll(":", "_")
    .replace(/[^A-Za-z0-9_$-]/g, "_");
}

export function clientScriptForPath(path: string): string {
  return `routes/${routeIdForPath(path)}.js`;
}

export function withHydrationMarkers(options: {
  assetBaseUrl?: string | undefined;
  clientReferenceManifest?: readonly ClientReferenceMetadata[] | undefined;
  html: string;
  props: unknown;
  routePath: string;
  script?: string | undefined;
}): string {
  const marker = hydrationMarkerParts({
    assetBaseUrl: options.assetBaseUrl,
    clientReferenceManifest: options.clientReferenceManifest,
    props: options.props,
    routePath: options.routePath,
    script: options.script,
  });

  return `${marker.prefix}${options.html}${marker.suffix}`;
}

export function withRouteMarkers(options: { html: string; routePath: string }): string {
  const routeId = routeIdForPath(options.routePath);

  return `<div data-mreact-route-id="${escapeHtmlAttribute(routeId)}">${options.html}</div>`;
}

export function hydrationMarkerParts(options: {
  assetBaseUrl?: string | undefined;
  clientReferenceManifest?: readonly ClientReferenceMetadata[] | undefined;
  props: unknown;
  routePath: string;
  script?: string | undefined;
}): { prefix: string; suffix: string } {
  const routeId = routeIdForPath(options.routePath);
  const escapedRouteId = escapeHtmlAttribute(routeId);
  const propsJson = escapeScriptJson(JSON.stringify(options.props));
  const script = options.script ?? clientScriptForPath(options.routePath);
  const scriptSrc = assetPath(script, options.assetBaseUrl ?? "/_mreact/client/");
  const clientReferencesJson =
    options.clientReferenceManifest === undefined || options.clientReferenceManifest.length === 0
      ? undefined
      : escapeScriptJson(JSON.stringify(options.clientReferenceManifest));

  return {
    prefix: `<div data-mreact-route-id="${escapedRouteId}">`,
    suffix: [
      "</div>",
      `<script type="application/json" id="mreact-props-${escapedRouteId}">${propsJson}</script>`,
      clientReferencesJson === undefined
        ? undefined
        : `<script type="application/json" id="mreact-client-references-${escapedRouteId}">${clientReferencesJson}</script>`,
      `<script type="module" src="${escapeHtmlAttribute(scriptSrc)}"></script>`,
    ].filter((part): part is string => part !== undefined).join(""),
  };
}

export async function buildClientRouteBundle(options: {
  code: string;
  clientReferenceManifest?: readonly ClientReferenceMetadata[] | undefined;
  filename: string;
  routePath: string;
}): Promise<string> {
  return (await buildClientRouteOutput(options)).code;
}

export async function buildClientRouteOutput(options: {
  code: string;
  clientReferenceManifest?: readonly ClientReferenceMetadata[] | undefined;
  filename: string;
  minify?: boolean;
  routePath: string;
  sourceMap?: boolean;
  /**
   * When `false`, omit the SPA navigation runtime (`__mreactPrefetch`,
   * `__mreactNavigate`, prefetch hover handlers, history integration, etc.)
   * from the emitted client bundle. The page can still hydrate and react to
   * `cell` / event bindings — only cross-route SPA navigation is disabled.
   * Useful for static / single-page interactive routes where the navigation
   * runtime is dead code.
   *
   * Default: `true` (preserve current behavior).
   *
   * If unset, the source code is also inspected for a top-level
   * `export const clientNavigation = false` hint and that takes precedence.
   * See `docs/issues/open/2026-05-12-058-client-navigation-runtime-opt-in.md`.
   */
  clientNavigation?: boolean;
}): Promise<{ code: string; map?: string }> {
  const compiled = transform({
    code: options.code,
    filename: options.filename,
    target: "client",
    dev: options.minify !== true,
  });

  if (compiled.diagnostics.length > 0) {
    throw new Error(
      compiled.diagnostics
        .map((diagnostic) => formatDiagnostic(options.filename, diagnostic))
        .join("\n"),
    );
  }

  const clientNavigation = options.clientNavigation ?? detectClientNavigationHint(options.code);
  const clientReferenceManifest =
    options.clientReferenceManifest ?? await inferClientReferenceManifestForBundle(options);
  const clientReferenceRegistry = emitClientReferenceRegistry(clientReferenceManifest);

  const routeId = routeIdForPath(options.routePath);
  const routeUsesCells = detectRouteCellStateHint(compiled.code);
  const routeStateSignature = routeUsesCells ? routeStateSignatureForSource(compiled.code) : "";
  const navigationStateDeclaration = clientNavigation
    ? `const __mreactNavigationState = __mreactGlobal.__mreactNavigationState ??= {
  cache: new Map(),
  installed: false,
};`
    : "";
  const routeCellStateDeclaration = routeUsesCells
    ? `const __mreactRouteStates = __mreactGlobal.__mreactRouteStates ??= new Map();
let __mreactActiveCellRecords = undefined;
let __mreactActiveCellIndex = 0;`
    : "";
  const routeCellHook = routeUsesCells
    ? `
__mreactGlobal.__mreactRouteCell = (nativeCell, initial) => {
  if (__mreactActiveCellRecords === undefined) {
    return nativeCell(initial);
  }

  const cellKey = String(__mreactActiveCellIndex);
  __mreactActiveCellIndex += 1;
  const existingRecord = __mreactActiveCellRecords.get(cellKey);
  const record = existingRecord ?? { value: initial };
  const stateCell = nativeCell(record.value);
  const setStateCell = stateCell.set;

  stateCell.set = (next) => {
    setStateCell((previous) => {
      const resolved = typeof next === "function" ? next(previous) : next;
      record.value = resolved;
      return resolved;
    });
  };

  __mreactActiveCellRecords.set(cellKey, record);
  return stateCell;
};`
    : "";
  const routeCellHydrationStart = routeUsesCells
    ? `  const __mreactPreviousState = __mreactRouteStates.get(__mreactRouteId);
  const __mreactState = __mreactPreviousState?.marker === __mreactMarker &&
    __mreactPreviousState?.signature === __mreactRouteStateSignature
    ? __mreactPreviousState
    : {
        cells: new Map(),
        marker: __mreactMarker,
        signature: __mreactRouteStateSignature,
      };
  __mreactDropMismatchedRouteState(__mreactPreviousState, __mreactState);
  __mreactRouteStates.set(__mreactRouteId, __mreactState);
  __mreactActiveCellRecords = __mreactState.cells;
  __mreactActiveCellIndex = 0;

  try {
`
    : "";
  const routeCellHydrationEnd = routeUsesCells
    ? `  } finally {
    __mreactActiveCellRecords = undefined;
    __mreactActiveCellIndex = 0;
  }
`
    : "";
  const routeCellHydrationIndent = routeUsesCells ? "    " : "  ";
  const routeCellDropFunction = routeUsesCells
    ? `
function __mreactDropMismatchedRouteState(previousState, nextState) {
  if (previousState === undefined || previousState === nextState) {
    return;
  }

  if (previousState.signature !== nextState.signature && typeof console !== "undefined") {
    console.warn("mreact: dropping stale route state after route cell signature changed");
  }
}
`
    : "";
  const entry = `${compiled.code}

const __mreactRouteId = ${JSON.stringify(routeId)};
const __mreactRouteStateSignature = ${JSON.stringify(routeStateSignature)};
const __mreactGlobal = globalThis;
${navigationStateDeclaration}
${routeCellStateDeclaration}
${routeCellHook}
${clientReferenceRegistry}

export function __mreactHydrateRoute() {
  __mreactApplyOutOfOrderFragments(document);
  const __mreactMarker = document.querySelector(\`[data-mreact-route-id="\${__mreactRouteId}"]\`);
  const __mreactPropsElement = document.getElementById(\`mreact-props-\${__mreactRouteId}\`);
  const __mreactClientReferencesElement = document.getElementById(\`mreact-client-references-\${__mreactRouteId}\`);
  const __mreactProps = __mreactPropsElement?.textContent === undefined
    ? {}
    : JSON.parse(__mreactPropsElement.textContent);
  const __mreactClientReferences = __mreactClientReferencesElement?.textContent === undefined
    ? []
    : JSON.parse(__mreactClientReferencesElement.textContent);
  const __mreactClientReferenceManifests = __mreactGlobal.__mreactClientReferenceManifests ??= new Map();
  __mreactClientReferenceManifests.set(__mreactRouteId, __mreactClientReferences);
  const __mreactComponent = typeof Page === "function"
    ? Page
    : typeof DefaultExport === "function"
      ? DefaultExport
      : undefined;

  if (__mreactMarker === null || __mreactComponent === undefined) {
    return;
  }
${routeCellHydrationStart}${routeCellHydrationIndent}if (__mreactHydrateClientBoundaries(__mreactMarker, __mreactClientReferences, __mreactClientReferenceComponents)) {
${routeCellHydrationIndent}  __mreactMarker.setAttribute("data-mreact-hydrated", "true");
${routeCellHydrationIndent}  return;
${routeCellHydrationIndent}}
${routeCellHydrationIndent}const __mreactNode = __mreactComponent(__mreactProps);
${routeCellHydrationIndent}__mreactResumeRoute(__mreactMarker, __mreactNode);
${routeCellHydrationIndent}__mreactMarker.setAttribute("data-mreact-hydrated", "true");
${routeCellHydrationEnd}}
${routeCellDropFunction}

__mreactHydrateRoute();
${clientNavigation ? "__mreactInstallNavigation();" : ""}

${
  clientNavigation
    ? `export function __mreactNavigateToHtml(html, url) {
  __mreactSaveCurrentHistoryState();
  const applied = __mreactApplyNavigationHtml(html, url);

  if (!applied) {
    return false;
  }

  __mreactPushHistoryState(url);
  __mreactScrollTo(0, 0);
  return true;
}

export async function __mreactPrefetch(url) {
  const href = __mreactNormalizeNavigationUrl(url);

  if (href === undefined) {
    return false;
  }

  if (__mreactNavigationState.cache.has(href)) {
    return true;
  }

  const response = await fetch(href, {
    headers: { "x-mreact-navigation": "1" },
  });
  __mreactApplyRevalidationHeader(response);
  const html = await response.text();
  __mreactNavigationState.cache.set(href, html);
  return true;
}

export async function __mreactNavigate(url) {
  const href = __mreactNormalizeNavigationUrl(url);

  if (href === undefined) {
    return false;
  }

  document.documentElement.setAttribute("data-mreact-navigation-pending", "true");

  try {
    const cachedHtml = __mreactNavigationState.cache.get(href);
    const html = cachedHtml ?? await __mreactFetchNavigationHtml(href);

    __mreactNavigationState.cache.set(href, html);
    return __mreactNavigateToHtml(html, href);
  } finally {
    document.documentElement.removeAttribute("data-mreact-navigation-pending");
  }
}

export function __mreactInvalidateNavigationCache(path) {
  const normalizedPath = __mreactNormalizeNavigationPath(path);

  if (normalizedPath === undefined) {
    return;
  }

  for (const href of Array.from(__mreactNavigationState.cache.keys())) {
    if (__mreactNormalizeNavigationPath(href) === normalizedPath) {
      __mreactNavigationState.cache.delete(href);
    }
  }
}

function __mreactFetchNavigationHtml(href) {
  return fetch(href, {
    headers: { "x-mreact-navigation": "1" },
  }).then((response) => {
    __mreactApplyRevalidationHeader(response);
    return response.text();
  });
}

function __mreactApplyRevalidationHeader(response) {
  const header = response.headers.get("x-mreact-revalidate");

  if (header === null || header.trim() === "") {
    return;
  }

  for (const path of header.split(",")) {
    __mreactInvalidateNavigationCache(path.trim());
  }
}

function __mreactNormalizeNavigationPath(path) {
  if (typeof location === "undefined") {
    return typeof path === "string" && path.length > 0 ? path : undefined;
  }

  try {
    const url = new URL(path, location.href);
    const pathname = url.pathname.replace(/\\/+$/, "");

    return pathname === "" ? "/" : pathname;
  } catch {
    return undefined;
  }
}

export function __mreactRestoreHistoryState(state) {
  if (state === null || state === undefined || state.__mreact !== true || typeof state.html !== "string") {
    return false;
  }

  const applied = __mreactApplyNavigationHtml(state.html, state.url);

  if (!applied) {
    return false;
  }

  __mreactScrollTo(Number(state.scrollX ?? 0), Number(state.scrollY ?? 0));
  return true;
}

function __mreactApplyNavigationHtml(html, url) {
  const template = document.createElement("template");
  template.innerHTML = html.replace(/^\\s*<!doctype html>/i, "");
  __mreactApplyOutOfOrderFragments(template.content);
  const nextMarker = template.content.querySelector("[data-mreact-route-id]");
  const currentMarker = document.querySelector("[data-mreact-route-id]");

  if (nextMarker === null || currentMarker === null) {
    return false;
  }

  __mreactResumeNode(currentMarker, nextMarker);

  for (const propsElement of Array.from(document.querySelectorAll('script[type="application/json"][id^="mreact-props-"], script[type="application/json"][id^="mreact-client-references-"]'))) {
    propsElement.remove();
  }

  for (const propsElement of Array.from(template.content.querySelectorAll('script[type="application/json"][id^="mreact-props-"], script[type="application/json"][id^="mreact-client-references-"]'))) {
    document.body.appendChild(propsElement);
  }

  const script = template.content.querySelector('script[type="module"][src]')?.getAttribute("src");
  if (script !== null && script !== undefined) {
    void import(/* @vite-ignore */ script).then((module) => module.__mreactHydrateRoute?.());
  }

  __mreactApplyOutOfOrderFragments(document);

  return true;
}

function __mreactCurrentHistoryState(url) {
  return {
    __mreact: true,
    html: document.body.innerHTML,
    scrollX: Number(globalThis.scrollX ?? 0),
    scrollY: Number(globalThis.scrollY ?? 0),
    url,
  };
}

function __mreactPushHistoryState(url) {
  if (typeof history === "undefined" || url === undefined) {
    return;
  }

  try {
    history.pushState(__mreactCurrentHistoryState(url), "", url);
  } catch {
    // Ignore invalid URLs in non-browser test environments.
  }
}

function __mreactSaveCurrentHistoryState() {
  if (typeof history === "undefined" || typeof location === "undefined") {
    return;
  }

  try {
    history.replaceState(__mreactCurrentHistoryState(location.href), "", location.href);
  } catch {
    // Ignore invalid URLs in non-browser test environments.
  }
}

function __mreactNormalizeNavigationUrl(url) {
  if (typeof location === "undefined") {
    return typeof url === "string" ? url : undefined;
  }

  try {
    return new URL(url, location.href).href;
  } catch {
    return undefined;
  }
}

function __mreactScrollTo(x, y) {
  if (typeof scrollTo === "function") {
    scrollTo(x, y);
  }
}

function __mreactInstallNavigation() {
  if (__mreactNavigationState.installed || typeof document === "undefined") {
    return;
  }

  __mreactNavigationState.installed = true;
  __mreactSaveCurrentHistoryState();
  addEventListener("popstate", (event) => {
    if (!__mreactRestoreHistoryState(event.state)) {
      location.reload();
    }
  });
  document.addEventListener("pointerenter", (event) => {
    const anchor = __mreactAnchorFromEvent(event);

    if (anchor !== null && anchor.dataset.mreactPrefetch !== "false") {
      void __mreactPrefetch(anchor.href);
    }
  }, true);
  document.addEventListener("focusin", (event) => {
    const anchor = __mreactAnchorFromEvent(event);

    if (anchor !== null && anchor.dataset.mreactPrefetch !== "false") {
      void __mreactPrefetch(anchor.href);
    }
  });
  document.addEventListener("click", (event) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return;
    }

    const anchor = __mreactAnchorFromEvent(event);

    if (anchor === null) {
      return;
    }

    const nextUrl = new URL(anchor.href, location.href);

    if (nextUrl.origin !== location.origin) {
      return;
    }

    event.preventDefault();
    void __mreactNavigate(nextUrl.href)
      .then((navigated) => {
        if (!navigated) {
          location.href = nextUrl.href;
        }
      }).catch(() => {
        location.href = nextUrl.href;
      });
  });
}

function __mreactAnchorFromEvent(event) {
  const target = event.target;
  const anchor = target instanceof Element ? target.closest("a[href]") : null;

  if (!(anchor instanceof HTMLAnchorElement) || anchor.target !== "" || anchor.hasAttribute("download")) {
    return null;
  }

  return anchor;
}
`
    : ""
}

function __mreactApplyOutOfOrderFragments(root) {
  const fragments = Array.from(root.querySelectorAll("template[data-mreact-oob-fragment]"));

  for (const fragment of fragments) {
    const id = fragment.getAttribute("data-mreact-oob-fragment");

    if (id === null) {
      continue;
    }

    const placeholder = Array.from(root.querySelectorAll("[data-mreact-oob-placeholder]"))
      .find((candidate) => candidate.getAttribute("data-mreact-oob-placeholder") === id);

    if (placeholder === undefined) {
      continue;
    }

    placeholder.replaceWith(fragment.content.cloneNode(true));
    fragment.remove();
  }
}

function __mreactHydrateClientBoundaries(marker, references, components) {
  if (!Array.isArray(references) || references.length === 0) {
    return false;
  }

  const placeholders = Array.from(marker.querySelectorAll("template[data-mreact-client-boundary]"));

  if (placeholders.length === 0) {
    return false;
  }

  for (const placeholder of placeholders) {
    const name = placeholder.getAttribute("data-mreact-client-boundary");
    const component = name === null ? undefined : components.get(name);

    if (typeof component !== "function") {
      return false;
    }

    const propsElement = __mreactClientBoundaryPropsElement(placeholder, name);
    const props = propsElement?.textContent === undefined || propsElement.textContent === ""
      ? {}
      : JSON.parse(propsElement.textContent);
    const node = component(props);

    placeholder.replaceWith(node);
    propsElement?.remove();
  }

  return true;
}

function __mreactClientBoundaryPropsElement(placeholder, name) {
  let next = placeholder.nextSibling;

  while (next !== null) {
    if (
      next.nodeType === Node.ELEMENT_NODE &&
      next.tagName === "SCRIPT" &&
      next.getAttribute("type") === "application/json" &&
      next.getAttribute("data-mreact-client-boundary-props") === name
    ) {
      return next;
    }

    if (next.nodeType === Node.ELEMENT_NODE) {
      return undefined;
    }

    next = next.nextSibling;
  }

  return undefined;
}

function __mreactResumeRoute(marker, nextNode) {
  const current = __mreactRouteResumeTarget(marker, nextNode);

  if (current === null) {
    marker.appendChild(nextNode);
    return;
  }

  __mreactResumeNode(current, nextNode);

  if (current.parentNode !== marker) {
    return;
  }

  while (marker.childNodes.length > 1) {
    marker.lastChild?.remove();
  }
}

function __mreactRouteResumeTarget(marker, nextNode) {
  const current = marker.firstChild;

  if (
    current === null ||
    current.nodeType !== Node.ELEMENT_NODE ||
    nextNode.nodeType !== Node.ELEMENT_NODE ||
    current.tagName === nextNode.tagName ||
    !current.hasAttribute("data-mreact-layout-boundary")
  ) {
    return current;
  }

  return __mreactFindLayoutPageTarget(current, nextNode) ?? current;
}

function __mreactFindLayoutPageTarget(current, nextNode) {
  for (const child of Array.from(current.childNodes)) {
    if (child.nodeType !== Node.ELEMENT_NODE) {
      continue;
    }

    if (
      child.tagName === nextNode.tagName &&
      !child.hasAttribute("data-mreact-layout-boundary") &&
      !child.hasAttribute("data-mreact-template-boundary")
    ) {
      return child;
    }

    if (child.hasAttribute("data-mreact-layout-boundary")) {
      const nested = __mreactFindLayoutPageTarget(child, nextNode);

      if (nested !== null) {
        return nested;
      }
    }
  }

  return null;
}

function __mreactResumeNode(current, next) {
  if (
    next.nodeType === Node.COMMENT_NODE &&
    next.nodeValue === "mreact-async-boundary"
  ) {
    // Server stream emits the resolved <Await> content; preserve the existing
    // DOM instead of replacing it with the client placeholder comment.
    return;
  }

  if (__mreactShouldReplaceNode(current, next)) {
    current.replaceWith(next);
    return;
  }

  if (current.nodeType === Node.TEXT_NODE && next.nodeType === Node.TEXT_NODE) {
    if (current.nodeValue !== next.nodeValue) {
      current.nodeValue = next.nodeValue;
    }
    return;
  }

  if (current.nodeType !== Node.ELEMENT_NODE || next.nodeType !== Node.ELEMENT_NODE) {
    current.replaceWith(next);
    return;
  }

  __mreactSyncEventBindings(current, next);
  __mreactSyncAttributes(current, next);
  __mreactResumeChildren(current, next);
}

function __mreactShouldReplaceNode(current, next) {
  if (
    next.nodeType === Node.ELEMENT_NODE &&
    next.hasAttribute("data-mreact-template-boundary")
  ) {
    return true;
  }

  if (current.nodeType !== next.nodeType) {
    return true;
  }

  return current.nodeType === Node.ELEMENT_NODE &&
    current.tagName !== next.tagName;
}

function __mreactSyncEventBindings(current, next) {
  const previousDisposers = current.__mreactEventDisposers;

  if (Array.isArray(previousDisposers)) {
    for (const dispose of previousDisposers) {
      dispose();
    }
  }

  const bindings = next.__mreactEventBindings;

  if (!Array.isArray(bindings) || bindings.length === 0) {
    current.__mreactEventDisposers = [];
    current.__mreactHasEvents = false;
    return;
  }

  const disposers = [];

  for (const binding of bindings) {
    current.addEventListener(binding.type, binding.listener);
    disposers.push(() => current.removeEventListener(binding.type, binding.listener));
  }

  current.__mreactEventDisposers = disposers;
  current.__mreactHasEvents = true;
}

function __mreactSyncAttributes(current, next) {
  for (const attribute of Array.from(current.attributes)) {
    if (!next.hasAttribute(attribute.name)) {
      current.removeAttribute(attribute.name);
    }
  }

  for (const attribute of Array.from(next.attributes)) {
    if (current.getAttribute(attribute.name) !== attribute.value) {
      current.setAttribute(attribute.name, attribute.value);
    }
  }
}

function __mreactResumeChildren(current, next) {
  const nextChildren = Array.from(next.childNodes);
  const refreshTextBindings = next.__mreactHasEvents === true;
  let index = 0;

  while (index < nextChildren.length) {
    const currentChild = current.childNodes[index];
    const nextChild = nextChildren[index];

    if (currentChild === undefined) {
      current.appendChild(nextChild);
      index += 1;
      continue;
    }

    // Text nodes that the client bound reactively must replace the
    // server's static text so subsequent updates land in the live DOM.
    const isReactiveText =
      nextChild.nodeType === Node.TEXT_NODE &&
      nextChild.__mreactReactiveText === true;

    if (
      (refreshTextBindings || isReactiveText) &&
      currentChild.nodeType === Node.TEXT_NODE &&
      nextChild.nodeType === Node.TEXT_NODE
    ) {
      currentChild.replaceWith(nextChild);
    } else {
      __mreactResumeNode(currentChild, nextChild);
    }
    index += 1;
  }

  while (current.childNodes.length > nextChildren.length) {
    current.lastChild?.remove();
  }
}
`;
  const bundled = await build({
    bundle: true,
    format: "esm",
    logLevel: "silent",
    minify: options.minify === true,
    define: {
      __MREACT_CLIENT_DEVTOOLS__: "false",
    },
    // issue 059: rename a strictly internal set of reactive-core / DOM scope
    // properties to single-character names. Each name in the allow-list is
    // reserved for cross-file internal state (not part of any public API
    // and not used by browser host objects), so global mangling is safe.
    // See packages/reactive-core/src/state.ts and reactive-dom/src/scope.ts.
    ...(options.minify === true
      ? {
          mangleProps:
            /^(singleSubscriber|subscribers|trackedBy|trackedVersion|markDirty|trackSource|pendingComputed|flushingComputed|nextComputationId|notificationDepth|batchDepth|activeTracker|deps|trackingAddedDeps|trackingCount|trackingVersion|queued|disposed|disposers)$/,
        }
      : {}),
    outfile: "route.js",
    platform: "browser",
    plugins: [workspaceRuntimePlugin({ routeFile: options.filename })],
    sourcemap: options.sourceMap === true ? "external" : false,
    write: false,
    stdin: {
      contents: entry,
      loader: "tsx",
      resolveDir: dirname(options.filename),
      sourcefile: options.filename,
    },
  });

  const codeFile = bundled.outputFiles.find((file) => file.path.endsWith(".js"));
  const mapFile = bundled.outputFiles.find((file) => file.path.endsWith(".js.map"));

  return {
    code: codeFile?.text ?? bundled.outputFiles[0]?.text ?? "",
    ...(mapFile === undefined ? {} : { map: mapFile.text }),
  };
}

function workspaceRuntimePlugin(options: { routeFile: string }) {
  const rootDir = join(dirname(fileURLToPath(import.meta.url)), "../../..");
  const routeDir = dirname(options.routeFile);
  const reactiveCorePath = join(rootDir, "packages/reactive-core/src/index.ts");
  const packageFile = (packageName: string, basename: string): string =>
    join(rootDir, "packages", packageName, "src", `${basename}.ts`);
  const runtimePaths = new Map([
    ["@reckona/mreact-compat", packageFile("react-compat", "index")],
    ["@reckona/mreact-compat/event-priority", packageFile("react-compat", "event-priority")],
    ["@reckona/mreact-compat/flight", packageFile("react-compat", "flight")],
    ["@reckona/mreact-compat/internal", packageFile("react-compat", "internal")],
    ["@reckona/mreact-compat/jsx-dev-runtime", packageFile("react-compat", "jsx-dev-runtime")],
    ["@reckona/mreact-compat/jsx-runtime", packageFile("react-compat", "jsx-runtime")],
    ["@reckona/mreact-compat/scheduler", packageFile("react-compat", "scheduler")],
    ["@reckona/mreact-reactive-dom", join(rootDir, "packages/reactive-dom/src/index.ts")],
  ]);

  return {
    name: "mreact-workspace-runtime",
    setup(buildApi: {
      onResolve(
        options: { filter: RegExp },
        callback: (args: {
          importer?: string;
          path: string;
        }) => { namespace?: string; path: string } | undefined,
      ): void;
      onLoad(
        options: { filter: RegExp; namespace?: string },
        callback: (args: {
          path: string;
        }) =>
          | Promise<{ contents: string; loader: "ts" | "tsx"; resolveDir?: string } | undefined>
          | { contents: string; loader: "ts" | "tsx"; resolveDir?: string }
          | undefined,
      ): void;
    }) {
      buildApi.onResolve({ filter: /^\.\/devtools\.js$/ }, (args) =>
        args.importer?.startsWith(join(rootDir, "packages/reactive-core/src/")) === true
          ? { namespace: "mreact-devtools-stub", path: "devtools" }
          : undefined,
      );
      buildApi.onResolve({ filter: /^@reckona\/mreact-reactive-core$/ }, () => ({
        namespace: "mreact-hot-runtime",
        path: "reactive-core",
      }));
      buildApi.onResolve(
        {
          filter:
            /^@reckona\/mreact-(?:compat|reactive-dom)(?:\/(?:event-priority|flight|internal|jsx-dev-runtime|jsx-runtime|scheduler))?$/,
        },
        (args) => {
          const path = runtimePaths.get(args.path);

          return path === undefined ? undefined : { path };
        },
      );
      buildApi.onLoad({ filter: /^reactive-core$/, namespace: "mreact-hot-runtime" }, () => ({
        contents: `import { cell as nativeCell } from ${JSON.stringify(reactiveCorePath)};
export * from ${JSON.stringify(reactiveCorePath)};
export function cell(initial) {
  const routeCell = globalThis.__mreactRouteCell;
  return typeof routeCell === "function" ? routeCell(nativeCell, initial) : nativeCell(initial);
}`,
        loader: "ts",
        resolveDir: rootDir,
      }));
      buildApi.onLoad({ filter: /^devtools$/, namespace: "mreact-devtools-stub" }, () => ({
        contents: `export function emitReactiveDevtoolsEvent() {}
export function hasReactiveDevtoolsEmitter() { return false; }
export function currentDevtoolsEmitter() { return undefined; }`,
        loader: "ts",
      }));
      buildApi.onLoad({ filter: /\.(?:mreact\.)?[cm]?[jt]sx$/ }, async (args) => {
        if (!isAppLocalSourcePath(args.path, routeDir) || args.path === options.routeFile) {
          return undefined;
        }

        const source = await readFile(args.path, "utf8");
        const output = transform({
          code: source,
          dev: true,
          filename: args.path,
          target: "client",
        });

        if (output.diagnostics.length > 0) {
          throw new Error(
            output.diagnostics
              .map((diagnostic) => formatDiagnostic(args.path, diagnostic))
              .join("\n"),
          );
        }

        return {
          contents: output.code,
          loader: "tsx",
          resolveDir: dirname(args.path),
        };
      });
    },
  };
}

function isAppLocalSourcePath(path: string, routeDir: string): boolean {
  return path === routeDir || path.startsWith(`${routeDir}/`);
}

/**
 * Detects the `export const clientNavigation = false` hint in a page module
 * source. Returns the hinted value, or `true` when no hint is present (i.e.,
 * preserve the historical "navigation runtime is always present" behavior).
 *
 * Regex-based to avoid pulling the JS parser into the build path. The pattern
 * accepts the common formatting variants:
 *   export const clientNavigation = false
 *   export const   clientNavigation   =  false ;
 *   export const clientNavigation: boolean = false
 */
export function detectClientNavigationHint(source: string): boolean {
  const match = source.match(
    /export\s+const\s+clientNavigation\s*(?::\s*[^=]+)?=\s*(true|false)\s*;?/,
  );
  return match === null ? true : match[1] === "true";
}

function detectRouteCellStateHint(code: string): boolean {
  const callExpression = routeCellCallExpressionSource(code);

  return callExpression === undefined
    ? /\bcell\d*\s*\(/.test(code)
    : new RegExp(`(?:${callExpression})\\s*\\(`).test(code);
}

async function inferClientReferenceManifestForBundle(options: {
  code: string;
  filename: string;
  routePath: string;
}): Promise<readonly ClientReferenceMetadata[]> {
  const inference = await inferClientRouteModule({
    code: options.code,
    filename: options.filename,
    routePath: options.routePath,
  });

  if (inference.clientBoundaryImports.length === 0) {
    return [];
  }

  const output = transform({
    code: options.code,
    clientBoundaryImports: inference.clientBoundaryImports,
    dev: true,
    filename: options.filename,
    target: "server",
  });

  return output.metadata.clientReferenceManifest ?? [];
}

function emitClientReferenceRegistry(
  manifest: readonly ClientReferenceMetadata[],
): string {
  const entries = manifest.flatMap((reference) => {
    const expression = clientReferenceExpression(reference.name);

    return expression === undefined
      ? []
      : [`  [${JSON.stringify(reference.name)}, ${expression}],`];
  });

  return [
    "const __mreactClientReferenceComponents = new Map([",
    ...entries,
    "]);",
  ].join("\n");
}

function clientReferenceExpression(name: string): string | undefined {
  return /^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*$/.test(name) ? name : undefined;
}

function routeStateSignatureForSource(code: string): string {
  const callExpression = routeCellCallExpressionSource(code);
  const callsitePattern =
    callExpression === undefined
      ? /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(cell\d*|cell)\s*\(/g
      : new RegExp(
          `\\b(?:const|let|var)\\s+([A-Za-z_$][\\w$]*)\\s*=\\s*(${callExpression})\\s*\\(`,
          "g",
        );
  const cellCallsites = Array.from(
    code.matchAll(callsitePattern),
    (match) => `${match[1]}:${match[2]}`,
  );
  const countPattern =
    callExpression === undefined
      ? /\bcell\d*\s*\(/g
      : new RegExp(`(?:${callExpression})\\s*\\(`, "g");
  const signature =
    cellCallsites.length > 0
      ? cellCallsites.join("\n")
      : `cell-count:${(code.match(countPattern) ?? []).length}`;

  return createHash("sha256").update(signature).digest("hex").slice(0, 16);
}

function routeCellCallExpressionSource(code: string): string | undefined {
  const namedImports = new Set<string>();
  const namespaceImports = new Set<string>();
  const namedImportPattern =
    /import\s+\{(?<imports>[^}]*)\}\s+from\s+["']@reckona\/mreact-reactive-core["']/g;

  for (const match of code.matchAll(namedImportPattern)) {
    const imports = match.groups?.imports;

    if (imports === undefined) {
      continue;
    }

    for (const part of imports.split(",")) {
      const specifier = part.trim();
      const alias = /^cell\s+as\s+([A-Za-z_$][\w$]*)$/.exec(specifier);

      if (specifier === "cell") {
        namedImports.add("cell");
      } else if (alias?.[1] !== undefined) {
        namedImports.add(alias[1]);
      }
    }
  }

  const namespaceImportPattern =
    /import\s+\*\s+as\s+([A-Za-z_$][\w$]*)\s+from\s+["']@reckona\/mreact-reactive-core["']/g;

  for (const match of code.matchAll(namespaceImportPattern)) {
    if (match[1] !== undefined) {
      namespaceImports.add(match[1]);
    }
  }

  const alternatives = [
    ...Array.from(namedImports, (name) => `\\b${escapeRegExp(name)}`),
    ...Array.from(namespaceImports, (name) => `\\b${escapeRegExp(name)}\\.cell`),
  ];

  return alternatives.length === 0 ? undefined : `(?:${alternatives.join("|")})`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function escapeScriptJson(value: string): string {
  return value.replaceAll("<", "\\u003c");
}
