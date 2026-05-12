import { createServer } from "node:http";
import type { ServerResponse } from "node:http";
import { watch, type FSWatcher } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  buildClientRouteBundle,
  clientScriptForPath,
  isClientRouteSource,
} from "./client.js";
import { renderAppRequest } from "./render.js";
import { scanAppRoutes } from "./routes.js";
import { nodeRequestToWebRequest, sendResponse } from "./http.js";

export interface StartDevServerOptions {
  appDir: string;
  port: number;
  hostname?: string;
}

export async function startDevServer(
  options: StartDevServerOptions,
): Promise<{ close(): Promise<void>; url: string }> {
  const reload = createReloadBroker();
  const watcher = await watchAppTree(options.appDir, () => reload.emit());
  const server = createServer(async (incoming, outgoing) => {
    try {
      const origin = `http://${incoming.headers.host ?? `${options.hostname ?? "127.0.0.1"}:${options.port}`}`;
      const url = new URL(incoming.url ?? "/", origin);

      if (url.pathname === "/_mreact/dev") {
        reload.connect(outgoing);
        return;
      }

      if (url.pathname.startsWith("/_mreact/client/")) {
        const response = await renderClientAsset(options.appDir, url.pathname);

        await sendResponse(outgoing, response);
        return;
      }

      const request = nodeRequestToWebRequest(incoming, origin);
      const response = await renderAppRequest({ appDir: options.appDir, request });

      await sendResponse(outgoing, response);
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
      new Promise<void>((resolve, reject) => {
        watcher.close();
        reload.close();
        server.close((error) => (error ? reject(error) : resolve()));
      }),
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

  return new Response(`${bundle}\n${devReloadClientScript()}`, {
    headers: { "content-type": "text/javascript; charset=utf-8" },
  });
}

interface AppWatcher {
  close(): void;
}

function createReloadBroker(): {
  close(): void;
  connect(response: ServerResponse): void;
  emit(): void;
} {
  const clients = new Set<ServerResponse>();

  return {
    close() {
      for (const client of clients) {
        client.end();
      }
      clients.clear();
    },
    connect(response) {
      response.writeHead(200, {
        "cache-control": "no-cache, no-transform",
        connection: "keep-alive",
        "content-type": "text/event-stream; charset=utf-8",
      });
      response.write(": connected\n\n");
      clients.add(response);
      response.on("close", () => {
        clients.delete(response);
      });
    },
    emit() {
      for (const client of clients) {
        client.write("event: reload\ndata: {}\n\n");
      }
    },
  };
}

async function watchAppTree(appDir: string, onChange: () => void): Promise<AppWatcher> {
  const watchers = new Map<string, FSWatcher>();
  let closed = false;
  let scheduled = false;

  const scheduleReload = () => {
    if (closed || scheduled) {
      return;
    }

    scheduled = true;
    setTimeout(() => {
      scheduled = false;
      onChange();
      void syncWatchers();
    }, 20);
  };

  const watchDirectory = (directory: string) => {
    if (watchers.has(directory)) {
      return;
    }

    const watcher = watch(directory, scheduleReload);

    watchers.set(directory, watcher);
  };

  const syncWatchers = async () => {
    for (const directory of await collectDirectories(appDir)) {
      watchDirectory(directory);
    }
  };

  await syncWatchers();

  return {
    close() {
      closed = true;
      for (const watcher of watchers.values()) {
        watcher.close();
      }
      watchers.clear();
    },
  };
}

async function collectDirectories(directory: string): Promise<string[]> {
  const directories = [directory];
  const entries = await readdir(directory, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.isDirectory()) {
      directories.push(...(await collectDirectories(join(directory, entry.name))));
    }
  }

  return directories;
}

function devReloadClientScript(): string {
  return `if (typeof EventSource !== "undefined") {
  const __mreactDevEvents = new EventSource("/_mreact/dev");
  __mreactDevEvents.addEventListener("reload", () => location.reload());
}`;
}
