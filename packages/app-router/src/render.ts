import { pathToFileURL } from "node:url";
import { access, readFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { transform } from "@modular-react/compiler";
import { build as bundle } from "esbuild";
import {
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
} from "./client.js";
import { matchRoute, scanAppRoutes } from "./routes.js";

export interface RenderAppRequestOptions {
  appDir: string;
  request: Request;
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
  const matched = matchRoute(routes, url.pathname);

  if (matched === undefined) {
    return new Response("Not Found", { status: 404 });
  }

  if (matched.route.kind === "server") {
    return dispatchServerRoute(matched.route.file, options.request);
  }

  const code = await readFile(matched.route.file, "utf8");
  const data = await loadRouteData({
    code,
    context: {
      params: matched.params,
      request: options.request,
    },
    filename: matched.route.file,
  });
  const routeCode = stripRouteModuleExports(code);
  const streamRoute = isStreamRouteSource(code);
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
    });

    return new Response(stream, {
      headers: {
        "content-type": "text/html; charset=utf-8",
        "x-mreact-stream": "1",
      },
    });
  }

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
  const clientRoute = isClientRouteSource(routeCode);

  if (clientRoute) {
    html = withHydrationMarkers({
      html,
      routePath: matched.route.path,
      props: {
        params: matched.params,
        request: { url: options.request.url },
        data,
      },
    });
  }

  return new Response(`<!DOCTYPE html>${html}`, {
    headers: { "content-type": "text/html; charset=utf-8" },
  });
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
  },
): Promise<ReadableStream<Uint8Array>> {
  const layoutShells = await layoutShellsForPage(options.appDir, options.pageFile, options.props);
  const marker = options.clientRoute
    ? hydrationMarkerParts({
        routePath: options.routePath,
        props: {
          params: options.props.params,
          request: { url: options.props.request.url },
          data: options.props.data,
        },
      })
    : undefined;

  return renderToReadableStream((sink) => {
    sink.append("<!DOCTYPE html>");
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
  return code.replace(/^\s*export\s+const\s+stream\s*=\s*true\s*;?\s*$/m, "");
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
  const layoutFiles = await layoutFilesForPage(options.appDir, options.pageFile);
  let html = options.html;

  for (const layoutFile of layoutFiles.reverse()) {
    const code = await readFile(layoutFile, "utf8");
    const output = transform({
      code,
      filename: layoutFile,
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

    html = replaceLayoutSlot(runServerModule(output.code, options.props), html);
  }

  return html;
}

async function layoutShellsForPage(
  appDir: string,
  pageFile: string,
  props: ServerComponentProps,
): Promise<Array<{ prefix: string; suffix: string }>> {
  const layoutFiles = await layoutFilesForPage(appDir, pageFile);
  const shells: Array<{ prefix: string; suffix: string }> = [];

  for (const layoutFile of layoutFiles) {
    const code = await readFile(layoutFile, "utf8");
    const output = transform({
      code,
      filename: layoutFile,
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

    shells.push(splitLayoutSlot(runServerModule(output.code, props)));
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

async function layoutFilesForPage(appDir: string, pageFile: string): Promise<string[]> {
  const relativeDir = relative(appDir, dirname(pageFile));
  const parts = relativeDir === "" ? [] : relativeDir.split("/");
  const candidates = [join(appDir, "layout.mreact.tsx")];

  for (let index = 0; index < parts.length; index += 1) {
    candidates.push(join(appDir, ...parts.slice(0, index + 1), "layout.mreact.tsx"));
  }

  const files: string[] = [];

  for (const candidate of candidates) {
    try {
      await access(candidate);
      files.push(candidate);
    } catch {
      // Missing layouts are allowed.
    }
  }

  return files;
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
    .replace(/export default async function ([A-Za-z_$][\w$]*)\s*\(/g, "async function $1(")
    .replace(/export default function ([A-Za-z_$][\w$]*)\s*\(/g, "function $1(")
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
    .replace(/export\s+(?:async\s+)?function\s+loader\s*\([^)]*\)\s*\{[\s\S]*?^\}\s*/m, "")
    .replace(
      /export\s+const\s+loader\s*=\s*(?:async\s+)?\([^)]*\)\s*=>\s*[\s\S]*?;?\s*(?=\nexport|\n$)/m,
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
