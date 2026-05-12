import { pathToFileURL } from "node:url";
import { access, readFile } from "node:fs/promises";
import { dirname, join, relative, sep } from "node:path";
import { transform } from "@modular-react/compiler";
import { build as bundle } from "esbuild";
import {
  createStringSink,
  type HtmlSink,
  renderAsyncBoundary,
  renderOutOfOrderBoundary,
  renderOutOfOrderReorderScript,
  renderReactSuspenseBoundary,
  renderReactSuspenseOutOfOrderBoundary,
  renderToReadableStream,
} from "@modular-react/server";
import {
  hydrationMarkerParts,
  isClientRouteSource,
  withHydrationMarkers,
  withRouteMarkers,
} from "./client.js";
import { matchRoute, scanAppRoutes } from "./routes.js";
import {
  type AppRouterServerActionOptions,
  dispatchServerActionRequest,
  prepareRouteServerActions,
  serverActionCookie,
} from "./actions.js";
import {
  type AppRouterCache,
  cachedRouteResponse,
  cacheRouteResponse,
  routeCacheKey,
  routeCachePolicyFromSource,
  stripRevalidateExport,
} from "./cache.js";

export interface RenderAppRequestOptions {
  appDir: string;
  clientScripts?: ReadonlyMap<string, string>;
  request: Request;
  routeCache?: AppRouterCache | undefined;
  serverActions?: AppRouterServerActionOptions | undefined;
}

interface ServerComponentProps {
  params: Record<string, string>;
  request: Request;
  data: unknown;
}

export async function renderAppRequest(
  options: RenderAppRequestOptions,
): Promise<Response> {
  const routes = await scanAppRoutes({ appDir: options.appDir });
  const url = new URL(options.request.url);

  if (url.pathname === "/_mreact/actions") {
    return dispatchServerActionRequest({
      appDir: options.appDir,
      request: options.request,
      routeCache: options.routeCache,
      serverActions: options.serverActions,
    });
  }

  const matched = matchRoute(routes, url.pathname);

  if (matched === undefined) {
    const notFoundFile = await nearestBoundaryFileForPath({
      appDir: options.appDir,
      filename: "not-found.mreact.tsx",
      pathname: url.pathname,
    });

    return renderSpecialRoute({
      appDir: options.appDir,
      error: undefined,
      request: options.request,
      routeFile: notFoundFile,
      status: 404,
      textFallback: "Not Found",
    });
  }

  let recoveryRoute:
    | {
        clientRoute: boolean;
        props: unknown;
        routePath: string;
        script: string | undefined;
      }
    | undefined;

  try {
    if (matched.route.kind === "server") {
      return await dispatchServerRoute(matched.route.file, options.request);
    }

    const clientScript = options.clientScripts?.get(matched.route.path);
    const originalCode = await readFile(matched.route.file, "utf8");
    const cachePolicy = routeCachePolicyFromSource(originalCode);
    const cacheKey = routeCacheKey(options.appDir, matched.route.path, url);
    const cachedResponse = cachePolicy?.revalidateSeconds === 0
      ? undefined
      : await cachedRouteResponse({
          cache: options.routeCache,
          key: cacheKey,
        });

    if (cachedResponse !== undefined) {
      return cachedResponse;
    }

    const preparedActions = await prepareRouteServerActions({
      appDir: options.appDir,
      code: originalCode,
      pageFile: matched.route.file,
    });
    const code = preparedActions.code;
    const dataPromise = loadRouteData({
      code,
      context: {
        params: matched.params,
        request: options.request,
      },
      filename: matched.route.file,
    });
    const routeCode = stripRouteModuleExports(code);
    const streamRoute = isStreamRouteSource(code);
    const clientRoute = isClientRouteSource(routeCode);
    recoveryRoute = {
      clientRoute,
      props: {
        params: matched.params,
        request: { url: options.request.url },
      },
      routePath: matched.route.path,
      script: clientScript,
    };
    const output = transform({
      code: routeCode,
      filename: matched.route.file,
      target: "server",
      serverOutput: streamRoute ? "stream" : "string",
      dev: true,
    });
    const fatalDiagnostics = output.diagnostics.filter(
      (diagnostic) => diagnostic.code !== "MR_UNSUPPORTED_SERVER_EVENT_HANDLER",
    );

    if (fatalDiagnostics.length > 0) {
      return new Response(fatalDiagnostics.map((diagnostic) => diagnostic.message).join("\n"), {
        status: 500,
        headers: { "content-type": "text/plain; charset=utf-8" },
      });
    }

    if (streamRoute) {
      const loadingFile = await nearestExistingBoundaryFileForPage({
        appDir: options.appDir,
        filename: "loading.mreact.tsx",
        pageFile: matched.route.file,
      });
      const streamShellResponseHeaders = {
        "content-type": "text/html; charset=utf-8",
        "x-mreact-stream": "1",
      };

      if (loadingFile !== undefined) {
        const stream = await runServerStreamModuleWithLoading(output.code, {
          appDir: options.appDir,
          clientRoute: isClientRouteSource(routeCode),
          data: dataPromise,
          loadingFile,
          pageFile: matched.route.file,
          params: matched.params,
          request: options.request,
          routePath: matched.route.path,
          script: clientScript,
        });

        return withOptionalActionCookie(
          new Response(stream, {
            headers: streamShellResponseHeaders,
          }),
          preparedActions.csrfToken,
        );
      }

      const data = await dataPromise;
      const props = {
        params: matched.params,
        request: options.request,
        data,
      };
      const stream = await runServerStreamModule(output.code, {
        appDir: options.appDir,
        pageFile: matched.route.file,
        props,
        routePath: matched.route.path,
        clientRoute: isClientRouteSource(routeCode),
        script: clientScript,
      });

      return withOptionalActionCookie(
        new Response(stream, {
          headers: streamShellResponseHeaders,
        }),
        preparedActions.csrfToken,
      );
    }

    const data = await dataPromise;
    const pageHtml = runServerModule(output.code, {
      params: matched.params,
      request: options.request,
      data,
    });
    let html = await applyLayouts({
      appDir: options.appDir,
      pageFile: matched.route.file,
      html: pageHtml,
      props: {
        params: matched.params,
        request: options.request,
        data,
      },
    });
    if (clientRoute) {
      html = withHydrationMarkers({
        html,
        routePath: matched.route.path,
        script: clientScript,
        props: {
          params: matched.params,
          request: { url: options.request.url },
          data,
        },
      });
    } else if (isNavigationRequest(options.request)) {
      html = withRouteMarkers({
        html,
        routePath: matched.route.path,
      });
    }

    const response = withOptionalActionCookie(
      new Response(`<!DOCTYPE html>${modulePreloadTags(clientRoute ? clientScript : undefined)}${html}`, {
        headers: { "content-type": "text/html; charset=utf-8" },
      }),
      preparedActions.csrfToken,
    );

    return preparedActions.hasFormActions
      ? withRouteCacheHeader(response, cachePolicy)
      : await cacheRouteResponse({
          key: cacheKey,
          cache: options.routeCache,
          path: matched.route.path,
          policy: cachePolicy,
          response,
        });
  } catch (error) {
    const errorFile = await nearestBoundaryFileForPage({
      appDir: options.appDir,
      filename: "error.mreact.tsx",
      pageFile: matched.route.file,
    });

    return renderSpecialRoute({
      appDir: options.appDir,
      error,
      request: options.request,
      routeFile: errorFile,
      navigation: recoveryRoute,
      status: 500,
      textFallback: error instanceof Error ? error.message : String(error),
    });
  }
}

function withOptionalActionCookie(response: Response, csrfToken: string | undefined): Response {
  if (csrfToken !== undefined) {
    response.headers.append("set-cookie", serverActionCookie(csrfToken));
  }

  return response;
}

function modulePreloadTags(script: string | undefined): string {
  return script === undefined
    ? ""
    : `<link rel="modulepreload" href="/_mreact/client/${escapeHtmlAttribute(script)}">`;
}

function isNavigationRequest(request: Request): boolean {
  return request.headers.get("x-mreact-navigation") === "1";
}

function escapeHtmlAttribute(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;");
}

async function nearestBoundaryFileForPage(options: {
  appDir: string;
  filename: string;
  pageFile: string;
}): Promise<string> {
  const relativeDir = relative(options.appDir, dirname(options.pageFile));
  const parts = relativeDir === "" ? [] : relativeDir.split(sep);

  return nearestBoundaryFileFromParts({
    appDir: options.appDir,
    filename: options.filename,
    parts,
  });
}

async function nearestExistingBoundaryFileForPage(options: {
  appDir: string;
  filename: string;
  pageFile: string;
}): Promise<string | undefined> {
  const relativeDir = relative(options.appDir, dirname(options.pageFile));
  const parts = relativeDir === "" ? [] : relativeDir.split(sep);

  return nearestExistingBoundaryFileFromParts({
    appDir: options.appDir,
    filename: options.filename,
    parts,
  });
}

async function nearestBoundaryFileForPath(options: {
  appDir: string;
  filename: string;
  pathname: string;
}): Promise<string> {
  const parts = options.pathname
    .replace(/^\/+|\/+$/g, "")
    .split("/")
    .filter((part) => part.length > 0);

  return nearestBoundaryFileFromParts({
    appDir: options.appDir,
    filename: options.filename,
    parts,
  });
}

async function nearestBoundaryFileFromParts(options: {
  appDir: string;
  filename: string;
  parts: string[];
}): Promise<string> {
  for (let count = options.parts.length; count >= 0; count -= 1) {
    for (const filename of boundaryFilenameCandidates(options.filename)) {
      const candidate = join(options.appDir, ...options.parts.slice(0, count), filename);

      try {
        await access(candidate);
        return candidate;
      } catch {
        // Keep walking toward the root boundary.
      }
    }
  }

  return join(options.appDir, boundaryFilenameCandidates(options.filename)[0] ?? options.filename);
}

async function nearestExistingBoundaryFileFromParts(options: {
  appDir: string;
  filename: string;
  parts: string[];
}): Promise<string | undefined> {
  for (let count = options.parts.length; count >= 0; count -= 1) {
    for (const filename of boundaryFilenameCandidates(options.filename)) {
      const candidate = join(options.appDir, ...options.parts.slice(0, count), filename);

      try {
        await access(candidate);
        return candidate;
      } catch {
        // Keep walking toward the root boundary.
      }
    }
  }

  return undefined;
}

function boundaryFilenameCandidates(filename: string): string[] {
  if (!filename.endsWith(".mreact.tsx")) {
    return [filename];
  }

  const standardFilename = filename.replace(".mreact.tsx", ".tsx");

  return [standardFilename, filename];
}

async function renderSpecialRoute(options: {
  appDir: string;
  error: unknown;
  navigation?:
    | {
        clientRoute: boolean;
        props: unknown;
        routePath: string;
        script: string | undefined;
      }
    | undefined;
  request: Request;
  routeFile: string;
  status: number;
  textFallback: string;
}): Promise<Response> {
  try {
    await access(options.routeFile);
  } catch {
    return new Response(options.textFallback, { status: options.status });
  }

  const props = {
    data: undefined,
    error: normalizeErrorForProps(options.error),
    params: {},
    request: options.request,
  };
  const pageHtml = await renderServerFileToHtml(options.routeFile, props);
  const html = await applyLayouts({
    appDir: options.appDir,
    pageFile: options.routeFile,
    html: pageHtml,
    props,
  });
  const wrappedHtml = options.navigation?.clientRoute === true
    ? withHydrationMarkers({
        html,
        props: options.navigation.props,
        routePath: options.navigation.routePath,
        script: options.navigation.script,
      })
    : html;

  return new Response(
    `<!DOCTYPE html>${modulePreloadTags(
      options.navigation?.clientRoute === true ? options.navigation.script : undefined,
    )}${wrappedHtml}`,
    {
    headers: { "content-type": "text/html; charset=utf-8" },
    status: options.status,
    },
  );
}

async function renderServerFileToHtml(
  file: string,
  props: ServerComponentProps,
): Promise<string> {
  const code = await readFile(file, "utf8");
  const output = transform({
    code,
    filename: file,
    target: "server",
    serverOutput: "string",
    dev: true,
  });
  const fatalDiagnostics = output.diagnostics.filter(
    (diagnostic) => diagnostic.code !== "MR_UNSUPPORTED_SERVER_EVENT_HANDLER",
  );

  if (fatalDiagnostics.length > 0) {
    throw new Error(fatalDiagnostics.map((diagnostic) => diagnostic.message).join("\n"));
  }

  return runServerModule(output.code, props);
}

function normalizeErrorForProps(error: unknown): { message: string } {
  if (error instanceof Error) {
    return { message: error.message };
  }

  return { message: String(error) };
}

async function dispatchServerRoute(file: string, request: Request): Promise<Response> {
  const module = (await import(`${pathToFileURL(file).href}?mtime=${Date.now()}`)) as Record<
    string,
    unknown
  >;
  const handler = module[request.method];

  if (typeof handler !== "function") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const response = await handler(request);

  return response instanceof Response
    ? response
    : new Response("Invalid route response", { status: 500 });
}

function runServerModule(code: string, props: ServerComponentProps): string {
  const exports = extractFunctionExports(code);
  const runnableCode = stripFunctionExports(stripImports(code));
  const returnEntries = exports
    .map((entry) => `${JSON.stringify(entry.exportName)}: ${entry.localName}`)
    .join(", ");
  const module = new Function(
    "cell",
    `${runnableCode}\nreturn { ${returnEntries} };`,
  )(createServerCell) as Record<string, (props: ServerComponentProps) => string>;
  const component = module.default ?? module.App ?? Object.values(module)[0];

  if (component === undefined) {
    throw new Error("No page component export was found.");
  }

  return component(props);
}

async function runServerStreamModule(
  code: string,
  options: {
    appDir: string;
    pageFile: string;
    props: ServerComponentProps;
    routePath: string;
    clientRoute: boolean;
    script?: string | undefined;
  },
): Promise<ReadableStream<Uint8Array>> {
  const layoutShells = await layoutShellsForPage(options.appDir, options.pageFile, options.props);
  const marker = options.clientRoute
    ? hydrationMarkerParts({
        routePath: options.routePath,
        script: options.script,
        props: {
          params: options.props.params,
          request: { url: options.props.request.url },
          data: options.props.data,
        },
      })
    : undefined;

  return renderToReadableStream((sink) => {
    sink.append("<!DOCTYPE html>");
    sink.append(modulePreloadTags(options.clientRoute ? options.script : undefined));
    sink.append(marker?.prefix ?? "");

    for (const shell of layoutShells) {
      sink.append(shell.prefix);
    }

    const result = appendServerStreamModule(code, sink, options.props);

    for (const shell of [...layoutShells].reverse()) {
      sink.append(shell.suffix);
    }

    sink.append(marker?.suffix ?? "");

    return isPromiseLikeVoid(result) ? result : undefined;
  });
}

async function runServerStreamModuleWithLoading(
  code: string,
  options: {
    appDir: string;
    clientRoute: boolean;
    data: Promise<unknown>;
    loadingFile: string;
    pageFile: string;
    params: Record<string, string>;
    request: Request;
    routePath: string;
    script?: string | undefined;
  },
): Promise<ReadableStream<Uint8Array>> {
  const loadingProps = {
    data: undefined,
    params: options.params,
    request: options.request,
  };
  const layoutShells = await layoutShellsForPage(options.appDir, options.pageFile, loadingProps);
  const loadingHtml = await renderServerFileToHtml(options.loadingFile, loadingProps);
  const marker = options.clientRoute
    ? hydrationMarkerParts({
        routePath: options.routePath,
        script: options.script,
        props: {
          params: options.params,
          request: { url: options.request.url },
        },
      })
    : undefined;

  return renderToReadableStream((sink) => {
    sink.append("<!DOCTYPE html>");
    sink.append(modulePreloadTags(options.clientRoute ? options.script : undefined));
    sink.append(marker?.prefix ?? "");

    for (const shell of layoutShells) {
      sink.append(shell.prefix);
    }

    renderVisibleOutOfOrderBoundary(
      sink,
      "mreact-route",
      options.data,
      (boundarySink, data) => {
        const result = appendServerStreamModule(code, boundarySink, {
          data,
          params: options.params,
          request: options.request,
        });

        return isPromiseLikeVoid(result) ? result : undefined;
      },
      {
        placeholder(boundarySink) {
          boundarySink.append(loadingHtml);
        },
      },
    );

    for (const shell of [...layoutShells].reverse()) {
      sink.append(shell.suffix);
    }

    renderOutOfOrderReorderScript(sink);
    sink.append(marker?.suffix ?? "");
  });
}

function renderVisibleOutOfOrderBoundary<T>(
  sink: HtmlSink,
  id: string,
  value: T,
  render: (sink: HtmlSink, value: Awaited<T>) => void | PromiseLike<void>,
  options: {
    catch?: (sink: HtmlSink, error: unknown) => void | PromiseLike<void>;
    placeholder?: (sink: HtmlSink) => void | PromiseLike<void>;
  } = {},
): void {
  const placeholderSink = createStringSink();
  void options.placeholder?.(placeholderSink);
  sink.append(
    `<span data-mreact-oob-placeholder="${escapeHtmlAttribute(id)}">${placeholderSink.toString()}</span>`,
  );

  const task = renderVisibleOutOfOrderFragment(sink, id, value, render, options);

  if (sink.defer === undefined) {
    void task;
    return;
  }

  sink.defer(task);
}

async function renderVisibleOutOfOrderFragment<T>(
  sink: HtmlSink,
  id: string,
  value: T,
  render: (sink: HtmlSink, value: Awaited<T>) => void | PromiseLike<void>,
  options: {
    catch?: (sink: HtmlSink, error: unknown) => void | PromiseLike<void>;
  },
): Promise<void> {
  const fragmentSink = createStringSink();

  await renderAsyncBoundary(
    fragmentSink,
    value,
    render,
    options.catch === undefined ? {} : { catch: options.catch },
  );

  sink.append(
    `<template data-mreact-oob-fragment="${escapeHtmlAttribute(id)}">${fragmentSink.toString()}</template>`,
  );
}

function appendServerStreamModule(
  code: string,
  sink: HtmlSink,
  props: ServerComponentProps,
): unknown {
  const exports = extractFunctionExports(code);
  const runnableCode = stripFunctionExports(stripImports(code));
  const runtimeEntries = extractServerRuntimeEntries(code);
  const returnEntries = exports
    .map((entry) => `${JSON.stringify(entry.exportName)}: ${entry.localName}`)
    .join(", ");
  const module = new Function(
    "cell",
    ...runtimeEntries.map((entry) => entry.localName),
    `${runnableCode}\nreturn { ${returnEntries} };`,
  )(
    createServerCell,
    ...runtimeEntries.map((entry) => entry.value),
  ) as Record<string, (sink: unknown, props: ServerComponentProps) => unknown>;
  const component = module.default ?? module.App ?? Object.values(module)[0];

  if (component === undefined) {
    throw new Error("No page component export was found.");
  }

  return component(sink, props);
}

function createServerCell<T>(initial: T): { get(): T; set(): void } {
  return {
    get: () => initial,
    set: () => {},
  };
}

function isPromiseLikeVoid(value: unknown): value is PromiseLike<void> {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { then?: unknown }).then === "function"
  );
}

function isStreamRouteSource(code: string): boolean {
  return /^\s*export\s+const\s+stream\s*=\s*true\s*;?/m.test(code);
}

function stripRouteConfigExports(code: string): string {
  return stripRevalidateExport(
    code.replace(/^\s*export\s+const\s+stream\s*=\s*true\s*;?\s*/m, ""),
  );
}

function stripRouteModuleExports(code: string): string {
  return stripLoaderExport(stripRouteConfigExports(code));
}

async function applyLayouts(options: {
  appDir: string;
  pageFile: string;
  html: string;
  props: ServerComponentProps;
}): Promise<string> {
  const layoutFiles = await shellFilesForPage(options.appDir, options.pageFile);
  let html = options.html;

  for (const shell of layoutFiles.reverse()) {
    const code = await readFile(shell.file, "utf8");
    const output = transform({
      code,
      filename: shell.file,
      target: "server",
      serverOutput: "string",
      dev: true,
    });
    const fatalDiagnostics = output.diagnostics.filter(
      (diagnostic) => diagnostic.code !== "MR_UNSUPPORTED_SERVER_EVENT_HANDLER",
    );

    if (fatalDiagnostics.length > 0) {
      throw new Error(fatalDiagnostics.map((diagnostic) => diagnostic.message).join("\n"));
    }

    html = replaceLayoutSlot(markShellBoundary(runServerModule(output.code, options.props), shell), html);
  }

  return html;
}

async function layoutShellsForPage(
  appDir: string,
  pageFile: string,
  props: ServerComponentProps,
): Promise<Array<{ prefix: string; suffix: string }>> {
  const layoutFiles = await shellFilesForPage(appDir, pageFile);
  const shells: Array<{ prefix: string; suffix: string }> = [];

  for (const shell of layoutFiles) {
    const code = await readFile(shell.file, "utf8");
    const output = transform({
      code,
      filename: shell.file,
      target: "server",
      serverOutput: "string",
      dev: true,
    });
    const fatalDiagnostics = output.diagnostics.filter(
      (diagnostic) => diagnostic.code !== "MR_UNSUPPORTED_SERVER_EVENT_HANDLER",
    );

    if (fatalDiagnostics.length > 0) {
      throw new Error(fatalDiagnostics.map((diagnostic) => diagnostic.message).join("\n"));
    }

    shells.push(splitLayoutSlot(markShellBoundary(runServerModule(output.code, props), shell)));
  }

  return shells;
}

function splitLayoutSlot(layoutHtml: string): { prefix: string; suffix: string } {
  const slotPattern = /<slot><\/slot>|<slot><\/slot\s*>|<slot\s*\/>/;
  const match = slotPattern.exec(layoutHtml);

  if (match === null) {
    return { prefix: layoutHtml, suffix: "" };
  }

  return {
    prefix: layoutHtml.slice(0, match.index),
    suffix: layoutHtml.slice(match.index + match[0].length),
  };
}

interface ShellFile {
  file: string;
  id: string;
  kind: "layout" | "template";
}

async function shellFilesForPage(appDir: string, pageFile: string): Promise<ShellFile[]> {
  const relativeDir = relative(appDir, dirname(pageFile));
  const parts = relativeDir === "" ? [] : relativeDir.split("/");
  const directories = [appDir];

  for (let index = 0; index < parts.length; index += 1) {
    directories.push(join(appDir, ...parts.slice(0, index + 1)));
  }

  const files: ShellFile[] = [];

  for (const directory of directories) {
    const shellId = shellBoundaryId(appDir, directory);
    for (const [filename, kind] of [
      ["layout.tsx", "layout"],
      ["layout.mreact.tsx", "layout"],
      ["template.tsx", "template"],
      ["template.mreact.tsx", "template"],
    ] as const) {
      const candidate = join(directory, filename);

      try {
        await access(candidate);
        files.push({ file: candidate, id: shellId, kind });
      } catch {
        // Missing shell files are allowed.
      }
    }
  }

  return files;
}

function withRouteCacheHeader(
  response: Response,
  policy: ReturnType<typeof routeCachePolicyFromSource>,
): Response {
  if (policy !== undefined) {
    response.headers.set("cache-control", policy.cacheControl);
  }

  return response;
}

function shellBoundaryId(appDir: string, directory: string): string {
  const relativeDirectory = relative(appDir, directory);

  return relativeDirectory === ""
    ? "root"
    : relativeDirectory.replaceAll(sep, "/").replace(/[^A-Za-z0-9_$/-]/g, "_");
}

function markShellBoundary(html: string, shell: ShellFile): string {
  const attributeName =
    shell.kind === "layout"
      ? "data-mreact-layout-boundary"
      : "data-mreact-template-boundary";

  if (html.includes(`${attributeName}=`)) {
    return html;
  }

  return html.replace(
    /<([A-Za-z][^\s/>]*)([^>]*)>/,
    `<$1$2 ${attributeName}="${escapeHtmlAttribute(shell.id)}">`,
  );
}

function replaceLayoutSlot(layoutHtml: string, childHtml: string): string {
  const slotPattern = /<slot><\/slot>|<slot><\/slot\s*>|<slot\s*\/>/;

  return slotPattern.test(layoutHtml)
    ? layoutHtml.replace(slotPattern, childHtml)
    : `${layoutHtml}${childHtml}`;
}

function stripImports(code: string): string {
  return code.replace(/^\s*(?:import[^\n]*\n\s*)+/, "");
}

function stripFunctionExports(code: string): string {
  return code
    .replace(
      /export default async function ([A-Za-z_$][\w$]*)(\s*\([^)]*\))(?:\s*:\s*[^{]+)?\s*\{/g,
      "async function $1$2 {",
    )
    .replace(
      /export default function ([A-Za-z_$][\w$]*)(\s*\([^)]*\))(?:\s*:\s*[^{]+)?\s*\{/g,
      "function $1$2 {",
    )
    .replace(/export async function /g, "async function ")
    .replace(/export function /g, "function ");
}

function extractFunctionExports(code: string): { exportName: string; localName: string }[] {
  return Array.from(
    code.matchAll(/^export (?:(default) )?(?:async )?function ([A-Za-z_$][\w$]*)\s*\(/gm),
  ).map((match) => ({
    exportName: match[1] === "default" ? "default" : String(match[2]),
    localName: String(match[2]),
  }));
}

interface RouteDataContext {
  params: Record<string, string>;
  request: Request;
}

async function loadRouteData(options: {
  code: string;
  context: RouteDataContext;
  filename: string;
}): Promise<unknown> {
  if (!hasLoaderExport(options.code)) {
    return undefined;
  }

  const output = await bundle({
    bundle: true,
    format: "esm",
    platform: "node",
    write: false,
    jsx: "transform",
    jsxFactory: "__mreact_jsx",
    jsxFragment: "__mreact_fragment",
    stdin: {
      contents: options.code,
      loader: "tsx",
      resolveDir: dirname(options.filename),
      sourcefile: options.filename,
    },
  });
  const code = output.outputFiles[0]?.text;

  if (code === undefined) {
    throw new Error(`Failed to compile loader for ${options.filename}.`);
  }

  const module = (await import(
    `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`
  )) as { loader?: (context: RouteDataContext) => unknown };

  return module.loader === undefined ? undefined : await module.loader(options.context);
}

function hasLoaderExport(code: string): boolean {
  return /\bexport\s+(?:async\s+)?function\s+loader\s*\(/.test(code) ||
    /\bexport\s+const\s+loader\s*=/.test(code);
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

function extractServerRuntimeEntries(code: string): { localName: string; value: unknown }[] {
  const importMatch = code.match(
    /^import \{ (?<specifiers>[^}]+) \} from "@modular-react\/server";/m,
  );
  const specifiers = importMatch?.groups?.specifiers;

  if (specifiers === undefined) {
    return [];
  }

  return specifiers.split(",").map((specifier) => {
    const [importedName, localName] = specifier.trim().split(/\s+as\s+/);

    return {
      localName: localName ?? String(importedName),
      value: serverRuntimeValue(String(importedName)),
    };
  });
}

function serverRuntimeValue(name: string): unknown {
  const values: Record<string, unknown> = {
    renderAsyncBoundary,
    renderOutOfOrderBoundary,
    renderOutOfOrderReorderScript,
    renderReactSuspenseBoundary,
    renderReactSuspenseOutOfOrderBoundary,
  };
  const value = values[name];

  if (value === undefined) {
    throw new Error(`Unsupported server stream runtime import '${name}'.`);
  }

  return value;
}
