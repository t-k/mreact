import { randomUUID, timingSafeEqual } from "node:crypto";
import { access, readdir, readFile } from "node:fs/promises";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createServerActionHandler,
  type ServerActionHandlerOptions,
  type ServerActionRegistry,
  type ServerActionReplayStore,
  type ServerActionRequestReference,
  type ServerActionValidationResult,
} from "@modular-react/server";
import { build as bundle } from "esbuild";
import {
  type AppRouterCache,
  withRouteCacheContext,
} from "./cache.js";
import { importAppRouterSourceModule } from "./module-runner.js";
import {
  createAppRouterImportPolicyPlugin,
  type AppRouterImportPolicy,
} from "./import-policy.js";

// Production cookies use the `__Host-` prefix to lock the cookie to
// `Path=/`, no Domain, and Secure. Local dev (HTTP) cannot send Secure
// cookies, so we fall back to a non-prefixed name + drop Secure when
// NODE_ENV !== "production". The HttpOnly flag is unconditional because
// the SSR layer also emits the token as a hidden form input, so client
// JavaScript never needs to read the cookie.
//
// Both names are checked on the read path to keep production rotations
// safe (a build flipping NODE_ENV should not invalidate in-flight forms).
const csrfCookieNameProduction = "__Host-mreact.csrf";
const csrfCookieNameDevelopment = "mreact.csrf";
const csrfCookieNamesRead = [csrfCookieNameProduction, csrfCookieNameDevelopment];

function isProductionEnvironment(): boolean {
  return process.env.NODE_ENV === "production";
}

function currentCsrfCookieName(): string {
  return isProductionEnvironment()
    ? csrfCookieNameProduction
    : csrfCookieNameDevelopment;
}
const formFieldModuleId = "__mreact_module_id";
const formFieldExportName = "__mreact_export_name";
const formFieldCsrf = "__mreact_csrf";
const formFieldNonce = "__mreact_action_nonce";
// Bounded default replay store for form-action nonces. The previous
// implementation was an unbounded Set that grew with every successful
// submission (Issue 069). Production callers should still pass a shared
// store (Redis / KV) via `serverActions.replayStore` for multi-instance
// deployments -- this default only guarantees replay protection within
// a single process and is the safe fallback for dev / single-node setups.
//
// Retention model:
// - TTL: 10 minutes. Form nonces are minted at SSR time and the user
//   has to submit before the cookie's SameSite=Lax window anyway; this
//   is generous for any realistic submit cadence.
// - Max size: 50_000 entries. Old entries are evicted FIFO once the cap
//   is reached so a flood cannot trigger OOM.
//
// Both bounds are intentional defaults -- tight enough that a single
// process cannot leak unbounded RSS, loose enough that legitimate
// traffic does not trip false-positive 409s.
const DEFAULT_REPLAY_TTL_MS = 10 * 60 * 1000;
const DEFAULT_REPLAY_MAX_ENTRIES = 50_000;

class BoundedReplayStore {
  private readonly entries = new Map<string, number>();

  constructor(
    private readonly ttlMs: number,
    private readonly maxEntries: number,
  ) {}

  has(value: string): boolean {
    const expiresAt = this.entries.get(value);
    if (expiresAt === undefined) return false;
    if (expiresAt < Date.now()) {
      this.entries.delete(value);
      return false;
    }
    return true;
  }

  add(value: string): void {
    const now = Date.now();
    // Cheap opportunistic sweep: drop the oldest expired entries first,
    // then enforce the hard cap with FIFO eviction.
    if (this.entries.size >= this.maxEntries) {
      for (const [key, expiresAt] of this.entries) {
        if (expiresAt < now) {
          this.entries.delete(key);
        }
        if (this.entries.size < this.maxEntries) break;
      }
      while (this.entries.size >= this.maxEntries) {
        const oldest = this.entries.keys().next().value;
        if (oldest === undefined) break;
        this.entries.delete(oldest);
      }
    }
    this.entries.set(value, now + this.ttlMs);
  }

  // Exposed for tests; not part of the ServerActionReplayStore interface.
  size(): number {
    return this.entries.size;
  }
}

const usedFormActionNonces = new BoundedReplayStore(
  DEFAULT_REPLAY_TTL_MS,
  DEFAULT_REPLAY_MAX_ENTRIES,
);

// Test helpers: drop all entries between cases / expose the bounded store
// so tests can drive its eviction semantics directly. Not part of the
// public surface (prefixed with `__`).
export function __clearDefaultReplayStore(): void {
  (usedFormActionNonces as unknown as { entries: Map<string, number> })
    .entries.clear();
}

export function __readDefaultReplayStore(): BoundedReplayStore {
  return usedFormActionNonces;
}

export interface AppRouterServerActionOptions {
  authorize?: ServerActionHandlerOptions["authorize"] | undefined;
  replayStore?: ServerActionReplayStore | undefined;
}

export interface PreparedRouteActions {
  actionNonce?: string;
  code: string;
  csrfToken?: string;
  // True when the cookie should be (re)set on the response. False means
  // the incoming request already carried a valid CSRF cookie that the
  // render is reusing -- skipping Set-Cookie avoids cookie thrash across
  // concurrent tabs (Issue 070).
  csrfTokenIsNew?: boolean;
  hasFormActions: boolean;
}

interface ActionReference {
  exportName: string;
  moduleId: string;
}

// Validates the cookie shape the caller might have set so we don't reuse
// a manipulated token. randomUUID() is hex + dashes, length 36.
const CSRF_TOKEN_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function readExistingCsrfToken(request: Request | undefined): string | undefined {
  if (request === undefined) return undefined;
  const cookieHeader = request.headers.get("cookie");
  for (const name of csrfCookieNamesRead) {
    const token = readCookie(cookieHeader, name);
    if (token !== undefined && CSRF_TOKEN_SHAPE.test(token)) {
      return token;
    }
  }
  return undefined;
}

export async function prepareRouteServerActions(options: {
  appDir: string;
  code: string;
  pageFile: string;
  request?: Request | undefined;
}): Promise<PreparedRouteActions> {
  const references = await collectImportedServerActions(options);

  if (references.size === 0) {
    return { code: options.code, hasFormActions: false };
  }

  // Reuse the existing CSRF token when the browser already sent one.
  // Rotating the cookie on every render (Issue 070) broke concurrent
  // forms because the older tab's hidden input no longer matched the
  // cookie value. The actionNonce stays per-render -- that is the field
  // tied to a specific submission via replay protection.
  const existingToken = readExistingCsrfToken(options.request);
  const csrfToken = existingToken ?? randomUUID();
  const csrfTokenIsNew = existingToken === undefined;
  const actionNonce = randomUUID();
  const lowered = lowerFormActions({
    actionNonce,
    code: options.code,
    csrfToken,
    references,
  });

  return lowered === options.code
    ? { code: options.code, hasFormActions: false }
    : {
        actionNonce,
        code: lowered,
        csrfToken,
        csrfTokenIsNew,
        hasFormActions: true,
      };
}

export async function dispatchServerActionRequest(options: {
  appDir: string;
  importPolicy?: AppRouterImportPolicy | undefined;
  request: Request;
  routeCache?: AppRouterCache | undefined;
  serverActionCacheVersion?: string | undefined;
  serverActions?: AppRouterServerActionOptions | undefined;
}): Promise<Response> {
  const { revalidatedPaths, value } = await withRouteCacheContext(
    options.routeCache,
    () => dispatchServerActionRequestWithoutCacheContext(options),
  );

  return withRevalidationHeader(value, revalidatedPaths);
}

async function dispatchServerActionRequestWithoutCacheContext(options: {
  appDir: string;
  importPolicy?: AppRouterImportPolicy | undefined;
  request: Request;
  serverActionCacheVersion?: string | undefined;
  serverActions?: AppRouterServerActionOptions | undefined;
}): Promise<Response> {
  // Validate everything we can statically before touching the filesystem
  // / esbuild. A flood of malformed POSTs must not pay the registry-load
  // cost (Issue 067).
  if (options.request.method !== "POST") {
    return jsonResponse({ ok: false, error: "Method not allowed." }, 405);
  }

  const contentType = options.request.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    // JSON path delegates CSRF/replay to createServerActionHandler. The
    // registry is still needed here, but the handler short-circuits on
    // CSRF mismatch before invoking the action.
    let registry: ServerActionRegistry;
    try {
      registry = await loadServerActionRegistry({
        appDir: options.appDir,
        cacheVersion: options.serverActionCacheVersion,
        importPolicy: options.importPolicy,
      });
    } catch (error) {
      return jsonResponse(
        { ok: false, error: error instanceof Error ? error.message : String(error) },
        500,
      );
    }

    const replayStore = options.serverActions?.replayStore ?? usedFormActionNonces;
    const handle = createServerActionHandler(registry, {
      ...(options.serverActions?.authorize === undefined
        ? {}
        : { authorize: options.serverActions.authorize }),
      csrf: true,
      replayProtection: { seen: replayStore },
    });

    return handle(options.request);
  }

  if (
    !contentType.includes("application/x-www-form-urlencoded") &&
    !contentType.includes("multipart/form-data")
  ) {
    return jsonResponse({ ok: false, error: "Unsupported server action content type." }, 415);
  }

  const formData = await options.request.formData();
  const csrfResponse = validateFormCsrf(options.request, formData);

  if (csrfResponse !== undefined) {
    return csrfResponse;
  }

  const nonceResponse = validateFormNonce(
    formData,
    options.serverActions?.replayStore ?? usedFormActionNonces,
  );

  if (nonceResponse !== undefined) {
    return nonceResponse;
  }

  const moduleId = stringFormValue(formData.get(formFieldModuleId));
  const exportName = stringFormValue(formData.get(formFieldExportName));

  if (moduleId === undefined || exportName === undefined) {
    return jsonResponse({ ok: false, error: "Invalid server action reference." }, 400);
  }

  let registry: ServerActionRegistry;
  try {
    registry = await loadServerActionRegistry({
      appDir: options.appDir,
      cacheVersion: options.serverActionCacheVersion,
      importPolicy: options.importPolicy,
    });
  } catch (error) {
    return jsonResponse(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      500,
    );
  }

  const action = registry[`${moduleId}#${exportName}`];

  if (typeof action !== "function") {
    return jsonResponse({ ok: false, error: "Unknown server action." }, 404);
  }

  const actionFormData = cleanActionFormData(formData);
  const authorizationResponse = await authorizeFormAction({
    args: [actionFormData],
    authorize: options.serverActions?.authorize,
    exportName,
    moduleId,
    request: options.request,
  });

  if (authorizationResponse !== undefined) {
    return authorizationResponse;
  }

  try {
    const value = await action(actionFormData);

    return value instanceof Response
      ? value
      : jsonResponse({ ok: true, value }, 200);
  } catch (error) {
    return jsonResponse(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      500,
    );
  }
}

function withRevalidationHeader(response: Response, paths: string[]): Response {
  if (paths.length > 0) {
    response.headers.set("x-mreact-revalidate", paths.join(","));
  }

  return response;
}

async function authorizeFormAction(options: {
  args: unknown[];
  authorize?: ServerActionHandlerOptions["authorize"];
  exportName: string;
  moduleId: string;
  request: Request;
}): Promise<Response | undefined> {
  const reference: ServerActionRequestReference = {
    exportName: options.exportName,
    moduleId: options.moduleId,
  };
  const authorizationResult = await options.authorize?.(
    options.request,
    reference,
    options.args,
  );

  return authorizationResult !== undefined && authorizationResult !== true
    ? jsonResponse(
        {
          ok: false,
          error: authorizationError(authorizationResult),
        },
        403,
      )
    : undefined;
}

function authorizationError(result: Exclude<ServerActionValidationResult, true>): string {
  return typeof result === "string" ? result : "Server action not authorized.";
}

export function serverActionCookie(csrfToken: string): string {
  const production = isProductionEnvironment();
  const parts = [
    `${currentCsrfCookieName()}=${encodeURIComponent(csrfToken)}`,
    "Path=/",
    "SameSite=Lax",
    "HttpOnly",
  ];

  if (production) {
    parts.push("Secure");
  }

  return parts.join("; ");
}

function lowerFormActions(options: {
  actionNonce: string;
  code: string;
  csrfToken: string;
  references: Map<string, ActionReference>;
}): string {
  return options.code.replace(
    /<form(?<before>[^>]*)\saction=\{(?<name>[A-Za-z_$][\w$]*)\}(?<after>[^>]*)>/g,
    (match, before: string, name: string, after: string) => {
      const reference = options.references.get(name);

      if (reference === undefined) {
        return match;
      }

      const attrs = `${before}${after}`.replace(/\s+method=(?:"[^"]*"|'[^']*'|\{[^}]*\})/g, "");
      const hidden = [
        hiddenInput(formFieldModuleId, reference.moduleId),
        hiddenInput(formFieldExportName, reference.exportName),
        hiddenInput(formFieldCsrf, options.csrfToken),
        hiddenInput(formFieldNonce, options.actionNonce),
      ].join("");

      return `<form${attrs} method="post" action="/_mreact/actions">${hidden}`;
    },
  );
}

function hiddenInput(name: string, value: string): string {
  return `<input type="hidden" name="${escapeAttribute(name)}" value="${escapeAttribute(value)}" />`;
}

async function collectImportedServerActions(options: {
  appDir: string;
  code: string;
  pageFile: string;
}): Promise<Map<string, ActionReference>> {
  const references = new Map<string, ActionReference>();
  const imports = options.code.matchAll(
    /^import\s+\{\s*(?<specifiers>[^}]+)\s*\}\s+from\s+["'](?<source>[^"']+)["'];?/gm,
  );

  for (const match of imports) {
    const source = match.groups?.source;
    const specifiers = match.groups?.specifiers;

    if (source === undefined || specifiers === undefined || !source.startsWith(".")) {
      continue;
    }

    const file = await resolveSourceFile(dirname(options.pageFile), source);

    if (file === undefined || !(await isUseServerFile(file))) {
      continue;
    }

    const moduleId = moduleIdForFile(options.appDir, file);

    for (const specifier of specifiers.split(",")) {
      const [exportName, localName] = specifier.trim().split(/\s+as\s+/);
      const imported = exportName?.trim();

      if (imported !== undefined && imported.length > 0) {
        references.set(localName?.trim() ?? imported, {
          exportName: imported,
          moduleId,
        });
      }
    }
  }

  return references;
}

// Cache the (expensive) collect+esbuild+evaluate work keyed by appDir +
// caller-supplied version. Production callers pass the build-time hash
// (serverModuleCacheVersion) so the registry is reused for the lifetime
// of one deployment. Dev callers omit the version; the entry is then
// keyed on "dev" so the work happens once per process — restarts handle
// invalidation. Concurrent callers share a single in-flight promise.
const serverActionRegistryCache = new Map<string, Promise<ServerActionRegistry>>();

async function loadServerActionRegistry(options: {
  appDir: string;
  cacheVersion?: string | undefined;
  importPolicy?: AppRouterImportPolicy | undefined;
}): Promise<ServerActionRegistry> {
  const cacheKey = `${options.appDir}::${options.cacheVersion ?? "dev"}`;
  const cached = serverActionRegistryCache.get(cacheKey);

  if (cached !== undefined) {
    return cached;
  }

  const pending = buildServerActionRegistry(options).catch((error) => {
    // Drop the failed promise so a retry can re-run the load.
    serverActionRegistryCache.delete(cacheKey);
    throw error;
  });
  serverActionRegistryCache.set(cacheKey, pending);
  return pending;
}

async function buildServerActionRegistry(options: {
  appDir: string;
  importPolicy?: AppRouterImportPolicy | undefined;
}): Promise<ServerActionRegistry> {
  const files = await collectFiles(options.appDir);
  const registry: ServerActionRegistry = {};

  for (const file of files) {
    if (!(await isUseServerFile(file))) {
      continue;
    }

    const module = await importServerActionModule({
      appDir: options.appDir,
      file,
      importPolicy: options.importPolicy,
    });
    const moduleId = moduleIdForFile(options.appDir, file);

    for (const [exportName, value] of Object.entries(module)) {
      if (typeof value === "function") {
        registry[`${moduleId}#${exportName}`] = value as (...args: unknown[]) => unknown;
      }
    }
  }

  return registry;
}

// Exposed for tests that need a clean slate between cases (in-process state).
export function __clearServerActionRegistryCache(): void {
  serverActionRegistryCache.clear();
}

async function importServerActionModule(options: {
  appDir: string;
  file: string;
  importPolicy?: AppRouterImportPolicy | undefined;
}): Promise<Record<string, unknown>> {
  const bundled = await bundle({
    bundle: true,
    format: "esm",
    logLevel: "silent",
    platform: "node",
    plugins: [
      serverActionRuntimePlugin(),
      createAppRouterImportPolicyPlugin({
        appDir: options.appDir,
        importPolicy: options.importPolicy,
        label: "Server action",
      }),
    ],
    write: false,
    entryPoints: [options.file],
  });
  const code = bundled.outputFiles[0]?.text;

  if (code === undefined) {
    throw new Error(`Failed to compile server action module ${options.file}.`);
  }

  return importAppRouterSourceModule<Record<string, unknown>>({
    code,
    label: `server-action:${options.file}`,
  });
}

function serverActionRuntimePlugin() {
  const currentDir = dirname(fileURLToPath(import.meta.url));
  const cachePath = join(currentDir, currentDir.endsWith(`${sep}dist`) ? "cache.js" : "cache.ts");

  return {
    name: "mreact-app-router-server-action-runtime",
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
      buildApi.onResolve({ filter: /^@modular-react\/app-router$/ }, () => ({
        namespace: "mreact-app-router-server-api",
        path: "index",
      }));
      buildApi.onLoad(
        { filter: /^index$/, namespace: "mreact-app-router-server-api" },
        () => ({
          contents: `export { revalidatePath } from ${JSON.stringify(cachePath)};`,
          loader: "ts",
          resolveDir: dirname(cachePath),
        }),
      );
    },
  };
}

async function collectFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const path = join(directory, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await collectFiles(path)));
      continue;
    }

    if (entry.isFile() && /\.(?:mreact\.tsx|tsx|ts)$/.test(entry.name)) {
      files.push(path);
    }
  }

  return files;
}

async function resolveSourceFile(directory: string, source: string): Promise<string | undefined> {
  const base = join(directory, source);
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}.mreact.tsx`,
    join(base, "index.ts"),
    join(base, "index.tsx"),
  ];

  for (const candidate of candidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Try the next candidate.
    }
  }

  return undefined;
}

async function isUseServerFile(file: string): Promise<boolean> {
  const code = await readFile(file, "utf8");

  return /^\s*["']use server["'];?/.test(code);
}

function moduleIdForFile(appDir: string, file: string): string {
  return relative(appDir, file).split(sep).join("/");
}

function validateFormCsrf(request: Request, formData: FormData): Response | undefined {
  const formToken = stringFormValue(formData.get(formFieldCsrf));
  const cookieHeader = request.headers.get("cookie");
  const cookieToken = csrfCookieNamesRead
    .map((name) => readCookie(cookieHeader, name))
    .find((token) => token !== undefined);

  if (formToken === undefined || cookieToken === undefined) {
    return jsonResponse({ ok: false, error: "Invalid CSRF token." }, 403);
  }

  return timingSafeStringEqual(formToken, cookieToken)
    ? undefined
    : jsonResponse({ ok: false, error: "Invalid CSRF token." }, 403);
}

function timingSafeStringEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

function validateFormNonce(
  formData: FormData,
  replayStore: ServerActionReplayStore,
): Response | undefined {
  const nonce = stringFormValue(formData.get(formFieldNonce));

  if (nonce === undefined || nonce.length === 0) {
    return jsonResponse({ ok: false, error: "Missing server action nonce." }, 400);
  }

  if (replayStore.has(nonce)) {
    return jsonResponse({ ok: false, error: "Server action nonce was already used." }, 409);
  }

  replayStore.add(nonce);
  return undefined;
}

function cleanActionFormData(formData: FormData): FormData {
  const cleaned = new FormData();

  for (const [name, value] of formData.entries()) {
    if (
      name !== formFieldModuleId &&
      name !== formFieldExportName &&
      name !== formFieldCsrf &&
      name !== formFieldNonce
    ) {
      cleaned.append(name, value);
    }
  }

  return cleaned;
}

function stringFormValue(value: FormDataEntryValue | null): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function readCookie(cookieHeader: string | null, name: string): string | undefined {
  if (cookieHeader === null) {
    return undefined;
  }

  for (const part of cookieHeader.split(";")) {
    const [rawKey, ...rawValue] = part.trim().split("=");

    if (rawKey === name) {
      return decodeURIComponent(rawValue.join("="));
    }
  }

  return undefined;
}

function jsonResponse(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), {
    headers: { "content-type": "application/json; charset=utf-8" },
    status,
  });
}

function escapeAttribute(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
