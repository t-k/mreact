import { randomUUID } from "node:crypto";
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

const csrfCookieName = "mreact.csrf";
const formFieldModuleId = "__mreact_module_id";
const formFieldExportName = "__mreact_export_name";
const formFieldCsrf = "__mreact_csrf";
const formFieldNonce = "__mreact_action_nonce";
const usedFormActionNonces = new Set<string>();

export interface AppRouterServerActionOptions {
  authorize?: ServerActionHandlerOptions["authorize"] | undefined;
  replayStore?: ServerActionReplayStore | undefined;
}

export interface PreparedRouteActions {
  actionNonce?: string;
  code: string;
  csrfToken?: string;
  hasFormActions: boolean;
}

interface ActionReference {
  exportName: string;
  moduleId: string;
}

export async function prepareRouteServerActions(options: {
  appDir: string;
  code: string;
  pageFile: string;
}): Promise<PreparedRouteActions> {
  const references = await collectImportedServerActions(options);

  if (references.size === 0) {
    return { code: options.code, hasFormActions: false };
  }

  const csrfToken = randomUUID();
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
        hasFormActions: true,
      };
}

export async function dispatchServerActionRequest(options: {
  appDir: string;
  request: Request;
  routeCache?: AppRouterCache | undefined;
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
  request: Request;
  serverActions?: AppRouterServerActionOptions | undefined;
}): Promise<Response> {
  if (options.request.method !== "POST") {
    return jsonResponse({ ok: false, error: "Method not allowed." }, 405);
  }
  const registry = await loadServerActionRegistry(options.appDir);
  const contentType = options.request.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
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
  return `${csrfCookieName}=${encodeURIComponent(csrfToken)}; Path=/; SameSite=Lax`;
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

async function loadServerActionRegistry(appDir: string): Promise<ServerActionRegistry> {
  const files = await collectFiles(appDir);
  const registry: ServerActionRegistry = {};

  for (const file of files) {
    if (!(await isUseServerFile(file))) {
      continue;
    }

    const module = await importServerActionModule(file);
    const moduleId = moduleIdForFile(appDir, file);

    for (const [exportName, value] of Object.entries(module)) {
      if (typeof value === "function") {
        registry[`${moduleId}#${exportName}`] = value as (...args: unknown[]) => unknown;
      }
    }
  }

  return registry;
}

async function importServerActionModule(file: string): Promise<Record<string, unknown>> {
  const bundled = await bundle({
    bundle: true,
    format: "esm",
    platform: "node",
    plugins: [serverActionRuntimePlugin()],
    write: false,
    entryPoints: [file],
  });
  const code = bundled.outputFiles[0]?.text;

  if (code === undefined) {
    throw new Error(`Failed to compile server action module ${file}.`);
  }

  return (await import(
    `data:text/javascript;base64,${Buffer.from(code).toString("base64")}#${Date.now()}`
  )) as Record<string, unknown>;
}

function serverActionRuntimePlugin() {
  const cachePath = join(dirname(fileURLToPath(import.meta.url)), "cache.ts");

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
  const cookieToken = readCookie(request.headers.get("cookie"), csrfCookieName);

  return formToken !== undefined && cookieToken !== undefined && formToken === cookieToken
    ? undefined
    : jsonResponse({ ok: false, error: "Invalid CSRF token." }, 403);
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
