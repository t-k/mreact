import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { transform } from "@modular-react/compiler";
import { build } from "esbuild";
import type { AppRoute } from "./routes.js";

export interface ClientRouteManifestEntry {
  path: string;
  kind: AppRoute["kind"];
  client: boolean;
  routeId?: string;
  script?: string;
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
}): string {
  const routeId = routeIdForPath(options.routePath);
  const propsJson = escapeScriptJson(JSON.stringify(options.props));

  return [
    `<div data-mreact-route-id="${escapeHtmlAttribute(routeId)}">${options.html}</div>`,
    `<script type="application/json" id="mreact-props-${escapeHtmlAttribute(routeId)}">${propsJson}</script>`,
    `<script type="module" src="/_mreact/client/${clientScriptForPath(options.routePath)}"></script>`,
  ].join("");
}

export async function buildClientRouteBundle(options: {
  code: string;
  filename: string;
  routePath: string;
}): Promise<string> {
  const compiled = transform({
    code: options.code,
    filename: options.filename,
    target: "client",
    dev: true,
  });
  const routeId = routeIdForPath(options.routePath);
  const entry = `${compiled.code}

const __mreactRouteId = ${JSON.stringify(routeId)};
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

if (__mreactMarker !== null && __mreactComponent !== undefined) {
  const __mreactNode = __mreactComponent(__mreactProps);
  __mreactMarker.replaceChildren(__mreactNode);
  __mreactMarker.setAttribute("data-mreact-hydrated", "true");
}
`;
  const bundled = await build({
    bundle: true,
    format: "esm",
    platform: "browser",
    plugins: [workspaceRuntimePlugin()],
    write: false,
    stdin: {
      contents: entry,
      loader: "tsx",
      resolveDir: process.cwd(),
      sourcefile: options.filename,
    },
  });

  return bundled.outputFiles[0]?.text ?? "";
}

function workspaceRuntimePlugin() {
  const rootDir = join(dirname(fileURLToPath(import.meta.url)), "../../..");
  const runtimePaths = new Map([
    ["@modular-react/reactive-core", join(rootDir, "packages/reactive-core/src/index.ts")],
    ["@modular-react/reactive-dom", join(rootDir, "packages/reactive-dom/src/index.ts")],
  ]);

  return {
    name: "mreact-workspace-runtime",
    setup(buildApi: {
      onResolve(
        options: { filter: RegExp },
        callback: (args: { path: string }) => { path: string } | undefined,
      ): void;
    }) {
      buildApi.onResolve({ filter: /^@modular-react\/(?:reactive-core|reactive-dom)$/ }, (args) => {
        const path = runtimePaths.get(args.path);

        return path === undefined ? undefined : { path };
      });
    },
  };
}

function escapeScriptJson(value: string): string {
  return value.replaceAll("<", "\\u003c");
}

function escapeHtmlAttribute(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;");
}
