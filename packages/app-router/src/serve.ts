import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join, normalize } from "node:path";
import { renderAppRequest } from "./render.js";
import { sendResponse } from "./http.js";

export interface RenderBuiltAppRequestOptions {
  outDir: string;
  request: Request;
}

export interface StartServerOptions {
  outDir: string;
  port: number;
  hostname?: string;
}

export async function renderBuiltAppRequest(
  options: RenderBuiltAppRequestOptions,
): Promise<Response> {
  const url = new URL(options.request.url);

  if (url.pathname.startsWith("/_mreact/client/")) {
    return readBuiltClientAsset(options.outDir, url.pathname);
  }

  return renderAppRequest({
    appDir: join(options.outDir, "server", "app"),
    request: options.request,
  });
}

export async function startServer(
  options: StartServerOptions,
): Promise<{ close(): Promise<void>; url: string }> {
  const server = createServer(async (incoming, outgoing) => {
    try {
      const origin = `http://${incoming.headers.host ?? `${options.hostname ?? "127.0.0.1"}:${options.port}`}`;
      const request = new Request(new URL(incoming.url ?? "/", origin), {
        method: incoming.method ?? "GET",
      });
      const response = await renderBuiltAppRequest({
        outDir: options.outDir,
        request,
      });

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
      new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      ),
  };
}

async function readBuiltClientAsset(outDir: string, pathname: string): Promise<Response> {
  const clientPrefix = "/_mreact/client/";
  const relativePath = pathname.slice(clientPrefix.length);
  const normalized = normalize(relativePath);

  if (normalized.startsWith("..")) {
    return new Response("Not Found", { status: 404 });
  }

  try {
    const code = await readFile(join(outDir, "client", normalized), "utf8");

    return new Response(code, {
      headers: { "content-type": "text/javascript; charset=utf-8" },
    });
  } catch {
    return new Response("Not Found", { status: 404 });
  }
}
