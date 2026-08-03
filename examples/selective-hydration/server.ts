// Minimal Node http server demonstrating selective hydration.
//
// On every request:
//   1. ssrLoadModule the compat App,
//   2. render it to a string with `react-compat.renderToString`,
//   3. embed an event hydration manifest (the events the client should
//      capture until hydration actually runs),
//   4. ship the HTML plus a <script type="module"> tag for the client
//      entry. The entry loads immediately and arms event capture, while
//      hydration waits for the first manifest-matching click.
import { createServer as createHttpServer } from "node:http";
import { createServer as createViteServer } from "vite";

const port = Number(process.env.PORT ?? 5175);

async function main(): Promise<void> {
  const vite = await createViteServer({
    appType: "custom",
    server: { middlewareMode: true, hmr: false },
    logLevel: "warn",
    optimizeDeps: { noDiscovery: true, include: [] },
  });

  const http = createHttpServer(async (req, res) => {
    const url = req.url ?? "/";
    if (url !== "/" && url !== "/index.html") {
      vite.middlewares(req, res);
      return;
    }

    try {
      const page = await vite.ssrLoadModule("./src/App.compat.tsx");
      const compat = await vite.ssrLoadModule("@reckona/mreact-compat");
      const runtime = await vite.ssrLoadModule("@reckona/mreact-server");

      const rendered: string = compat.renderToString(page.App, {});
      const manifest = runtime.createEventHydrationManifest([
        { id: "App:0", event: "click", handler: "onClick" },
      ]);
      const sink = runtime.createStringSink();
      runtime.renderEventHydrationManifest(sink, manifest);
      const manifestHtml: string = sink.toString();

      res.statusCode = 200;
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader("Cache-Control", "no-store");
      res.end(buildShell(rendered, manifestHtml));
    } catch (error) {
      console.error(error);
      if (!res.headersSent) {
        res.statusCode = 500;
        res.setHeader("Content-Type", "text/plain; charset=utf-8");
      }
      res.end(`Internal error: ${(error as Error).message}`);
    }
  });

  http.listen(port, () => {
    console.log(
      `selective-hydration demo at http://localhost:${port}/ (Ctrl+C to stop)`,
    );
  });

  const shutdown = async (): Promise<void> => {
    http.close();
    await vite.close();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

function buildShell(rendered: string, manifestHtml: string): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>selective-hydration</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 720px; margin: 2rem auto; padding: 0 1rem; color: #1f2937; }
    button { font-size: 1rem; padding: 0.4rem 0.8rem; margin-right: 0.5rem; }
    [data-status] { color: #6b7280; font-size: 0.85em; }
  </style>
</head>
<body>
  <section id="root">${rendered}</section>
  ${manifestHtml}
  <script type="module" src="/src/client-entry.ts"></script>
</body>
</html>`;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
