import { createServer } from "node:http";
import { renderAppRequest } from "./render.js";

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

  return {
    url: `http://${options.hostname ?? "127.0.0.1"}:${options.port}`,
    close: () =>
      new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      ),
  };
}
