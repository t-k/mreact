import { pathToFileURL } from "node:url";
import { readFile } from "node:fs/promises";
import { transform } from "@modular-react/compiler";
import { matchRoute, scanAppRoutes } from "./routes.js";

export interface RenderAppRequestOptions {
  appDir: string;
  request: Request;
}

interface ServerComponentProps {
  params: Record<string, string>;
  request: Request;
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
  const output = transform({
    code,
    filename: matched.route.file,
    target: "server",
    serverOutput: "string",
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

  const html = runServerModule(output.code, {
    params: matched.params,
    request: options.request,
  });

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
  const module = new Function(`${runnableCode}\nreturn { ${returnEntries} };`)() as Record<
    string,
    (props: ServerComponentProps) => string
  >;
  const component = module.default ?? module.App ?? Object.values(module)[0];

  if (component === undefined) {
    throw new Error("No page component export was found.");
  }

  return component(props);
}

function stripImports(code: string): string {
  return code.replace(/^\s*(?:import[^\n]*\n\s*)+/, "");
}

function stripFunctionExports(code: string): string {
  return code
    .replace(/export default function ([A-Za-z_$][\w$]*)\s*\(/g, "function $1(")
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
