import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import {
  buildClientRouteBundle,
  clientScriptForPath,
  isClientRouteSource,
} from "./client.js";
import { renderAppRequest } from "./render.js";
import { scanAppRoutes } from "./routes.js";

export interface StartDevServerOptions {
  appDir: string;
  port: number;
  hostname?: string;
}

export async function startDevServer(
  options: StartDevServerOptions,
): Promise<{ close(): Promise<void>; url: string }> {
  const server = createServer(async (incoming, outgoing) => {
    try {
      const origin = `http://${incoming.headers.host ?? `${options.hostname ?? "127.0.0.1"}:${options.port}`}`;
      const url = new URL(incoming.url ?? "/", origin);

      if (url.pathname.startsWith("/_mreact/client/")) {
        const response = await renderClientAsset(options.appDir, url.pathname);

        outgoing.statusCode = response.status;
        response.headers.forEach((value, key) => outgoing.setHeader(key, value));
        outgoing.end(await response.text());
        return;
      }

      const request = new Request(new URL(incoming.url ?? "/", origin), {
        method: incoming.method ?? "GET",
      });
      const response = await renderAppRequest({ appDir: options.appDir, request });

      outgoing.statusCode = response.status;
      response.headers.forEach((value, key) => outgoing.setHeader(key, value));
      outgoing.end(await response.text());
    } catch (error) {
      outgoing.statusCode = 500;
      outgoing.setHeader("content-type", "text/plain; charset=utf-8");
      outgoing.end(error instanceof Error ? error.stack : String(error));
    }
  });

  await new Promise<void>((resolve) =>
    server.listen(options.port, options.hostname ?? "127.0.0.1", resolve),
  );
  const address = server.address();
  const port = typeof address === "object" && address !== null ? address.port : options.port;

  return {
    url: `http://${options.hostname ?? "127.0.0.1"}:${port}`,
    close: () =>
      new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      ),
  };
}

async function renderClientAsset(appDir: string, pathname: string): Promise<Response> {
  const routes = await scanAppRoutes({ appDir });
  const route = routes.find(
    (candidate) =>
      candidate.kind === "page" &&
      `/_mreact/client/${clientScriptForPath(candidate.path)}` === pathname,
  );

  if (route === undefined || route.kind !== "page") {
    return new Response("Not Found", { status: 404 });
  }

  const code = await readFile(route.file, "utf8");

  if (!isClientRouteSource(code)) {
    return new Response("Not Found", { status: 404 });
  }

  const bundle = await buildClientRouteBundle({
    code,
    filename: route.file,
    routePath: route.path,
  });

  return new Response(bundle, {
    headers: { "content-type": "text/javascript; charset=utf-8" },
  });
}
