import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { transform } from "@modular-react/compiler";
import { build } from "esbuild";
import type { AppRoute } from "./routes.js";

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

export async function routeToClientManifestEntry(
  route: AppRoute,
): Promise<ClientRouteManifestEntry> {
  if (route.kind === "server") {
    return { path: route.path, kind: route.kind, client: false };
  }

  const code = await readFile(route.file, "utf8");
  const client = isClientRouteSource(code);

  return client
    ? {
        path: route.path,
        kind: route.kind,
        client,
        routeId: routeIdForPath(route.path),
        script: clientScriptForPath(route.path),
      }
    : { path: route.path, kind: route.kind, client };
}

export function isClientRouteSource(code: string): boolean {
  return /\bon[A-Z][A-Za-z0-9_]*=|\bcell\s*\(|\bwindow\b|\bdocument\b|\blocalStorage\b/.test(
    code,
  );
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
  html: string;
  props: unknown;
  routePath: string;
  script?: string | undefined;
}): string {
  const marker = hydrationMarkerParts({
    props: options.props,
    routePath: options.routePath,
    script: options.script,
  });

  return `${marker.prefix}${options.html}${marker.suffix}`;
}

export function withRouteMarkers(options: {
  html: string;
  routePath: string;
}): string {
  const routeId = routeIdForPath(options.routePath);

  return `<div data-mreact-route-id="${escapeHtmlAttribute(routeId)}">${options.html}</div>`;
}

export function hydrationMarkerParts(options: {
  props: unknown;
  routePath: string;
  script?: string | undefined;
}): { prefix: string; suffix: string } {
  const routeId = routeIdForPath(options.routePath);
  const escapedRouteId = escapeHtmlAttribute(routeId);
  const propsJson = escapeScriptJson(JSON.stringify(options.props));
  const script = options.script ?? clientScriptForPath(options.routePath);

  return {
    prefix: `<div data-mreact-route-id="${escapedRouteId}">`,
    suffix: [
      "</div>",
      `<script type="application/json" id="mreact-props-${escapedRouteId}">${propsJson}</script>`,
      `<script type="module" src="/_mreact/client/${escapeHtmlAttribute(script)}"></script>`,
    ].join(""),
  };
}

export async function buildClientRouteBundle(options: {
  code: string;
  filename: string;
  routePath: string;
}): Promise<string> {
  return (await buildClientRouteOutput(options)).code;
}

export async function buildClientRouteOutput(options: {
  code: string;
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
      `${options.filename}: ${compiled.diagnostics
        .map((diagnostic) => `${diagnostic.code}: ${diagnostic.message}`)
        .join("\n")}`,
    );
  }

  const clientNavigation =
    options.clientNavigation ?? detectClientNavigationHint(options.code);

  const routeId = routeIdForPath(options.routePath);
  const routeUsesCells = detectRouteCellStateHint(compiled.code);
  const routeStateSignature = routeUsesCells
    ? routeStateSignatureForSource(compiled.code)
    : "";
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

export function __mreactHydrateRoute() {
  __mreactApplyOutOfOrderFragments(document);
  const __mreactMarker = document.querySelector(\`[data-mreact-route-id="\${__mreactRouteId}"]\`);
  const __mreactPropsElement = document.getElementById(\`mreact-props-\${__mreactRouteId}\`);
  const __mreactProps = __mreactPropsElement?.textContent === undefined
    ? {}
    : JSON.parse(__mreactPropsElement.textContent);
  const __mreactComponent = typeof Page === "function"
    ? Page
    : typeof DefaultExport === "function"
      ? DefaultExport
      : undefined;

  if (__mreactMarker === null || __mreactComponent === undefined) {
    return;
  }
${routeCellHydrationStart}${routeCellHydrationIndent}const __mreactNode = __mreactComponent(__mreactProps);
${routeCellHydrationIndent}__mreactResumeRoute(__mreactMarker, __mreactNode);
${routeCellHydrationIndent}__mreactMarker.setAttribute("data-mreact-hydrated", "true");
${routeCellHydrationEnd}}
${routeCellDropFunction}

__mreactHydrateRoute();
${clientNavigation ? "__mreactInstallNavigation();" : ""}

${clientNavigation ? `export function __mreactNavigateToHtml(html, url) {
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

  for (const propsElement of Array.from(document.querySelectorAll('script[type="application/json"][id^="mreact-props-"]'))) {
    propsElement.remove();
  }

  for (const propsElement of Array.from(template.content.querySelectorAll('script[type="application/json"][id^="mreact-props-"]'))) {
    document.body.appendChild(propsElement);
  }

  const script = template.content.querySelector('script[type="module"][src^="/_mreact/client/"]')?.getAttribute("src");
  if (script !== null && script !== undefined) {
    void import(script).then((module) => module.__mreactHydrateRoute?.());
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
` : ""}

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
    minify: options.minify === true,
    // issue 059: rename a strictly internal set of reactive-core / DOM scope
    // properties to single-character names. Each name in the allow-list is
    // reserved for cross-file internal state (not part of any public API
    // and not used by browser host objects), so global mangling is safe.
    // See packages/reactive-core/src/state.ts and reactive-dom/src/scope.ts.
    ...(options.minify === true
      ? {
          mangleProps:
            /^(subscribers|markDirty|pendingComputed|flushingComputed|nextComputationId|notificationDepth|batchDepth|activeTracker|deps|queued|disposed|disposers)$/,
        }
      : {}),
    outfile: "route.js",
    platform: "browser",
    plugins: [workspaceRuntimePlugin()],
    sourcemap: options.sourceMap === true ? "external" : false,
    write: false,
    stdin: {
      contents: entry,
      loader: "tsx",
      resolveDir: process.cwd(),
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

function workspaceRuntimePlugin() {
  const rootDir = join(dirname(fileURLToPath(import.meta.url)), "../../..");
  const reactiveCorePath = join(rootDir, "packages/reactive-core/src/index.ts");
  const runtimePaths = new Map([
    ["@modular-react/reactive-dom", join(rootDir, "packages/reactive-dom/src/index.ts")],
  ]);

  return {
    name: "mreact-workspace-runtime",
    setup(buildApi: {
      onResolve(
        options: { filter: RegExp },
        callback: (args: { path: string }) => { namespace?: string; path: string } | undefined,
      ): void;
      onLoad(
        options: { filter: RegExp; namespace?: string },
        callback: (args: { path: string }) =>
          | { contents: string; loader: "ts"; resolveDir?: string }
          | undefined,
      ): void;
    }) {
      buildApi.onResolve({ filter: /^@modular-react\/reactive-core$/ }, () => ({
        namespace: "mreact-hot-runtime",
        path: "reactive-core",
      }));
      buildApi.onResolve({ filter: /^@modular-react\/reactive-dom$/ }, (args) => {
        const path = runtimePaths.get(args.path);

        return path === undefined ? undefined : { path };
      });
      buildApi.onLoad(
        { filter: /^reactive-core$/, namespace: "mreact-hot-runtime" },
        () => ({
          contents: `import { cell as nativeCell } from ${JSON.stringify(reactiveCorePath)};
export * from ${JSON.stringify(reactiveCorePath)};
export function cell(initial) {
  const routeCell = globalThis.__mreactRouteCell;
  return typeof routeCell === "function" ? routeCell(nativeCell, initial) : nativeCell(initial);
}`,
          loader: "ts",
          resolveDir: rootDir,
        }),
      );
    },
  };
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

function routeStateSignatureForSource(code: string): string {
  const callExpression = routeCellCallExpressionSource(code);
  const callsitePattern = callExpression === undefined
    ? /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(cell\d*|cell)\s*\(/g
    : new RegExp(
        `\\b(?:const|let|var)\\s+([A-Za-z_$][\\w$]*)\\s*=\\s*(${callExpression})\\s*\\(`,
        "g",
      );
  const cellCallsites = Array.from(
    code.matchAll(callsitePattern),
    (match) => `${match[1]}:${match[2]}`,
  );
  const countPattern = callExpression === undefined
    ? /\bcell\d*\s*\(/g
    : new RegExp(`(?:${callExpression})\\s*\\(`, "g");
  const signature = cellCallsites.length > 0
    ? cellCallsites.join("\n")
    : `cell-count:${(code.match(countPattern) ?? []).length}`;

  return createHash("sha256")
    .update(signature)
    .digest("hex")
    .slice(0, 16);
}

function routeCellCallExpressionSource(code: string): string | undefined {
  const namedImports = new Set<string>();
  const namespaceImports = new Set<string>();
  const namedImportPattern =
    /import\s+\{(?<imports>[^}]*)\}\s+from\s+["']@modular-react\/reactive-core["']/g;

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
    /import\s+\*\s+as\s+([A-Za-z_$][\w$]*)\s+from\s+["']@modular-react\/reactive-core["']/g;

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

function escapeScriptJson(value: string): string {
  return value.replaceAll("<", "\\u003c");
}

function escapeHtmlAttribute(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;");
}
