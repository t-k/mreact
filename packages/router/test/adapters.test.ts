import { createServer, request as nodeRequest } from "node:http";
import { mkdir, mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { installDevtools } from "@reckona/mreact-devtools";
import { buildApp } from "../src/build.js";
import { createEdgeRequestHandler } from "../src/adapters/edge.js";
import { createNodeRequestHandler } from "../src/adapters/node.js";
import { createAwsLambdaRequestHandler } from "../src/adapters/aws-lambda.js";
import { createCloudflareRequestHandler } from "../src/adapters/cloudflare.js";
import { exportStaticApp } from "../src/adapters/static.js";
import { createBuiltRequestRuntime, startServer } from "../src/serve.js";

describe("mreact deployment adapters", () => {
  test("serves built output through the Node request handler", async () => {
    const { outDir } = await buildFixture("mreact-node-adapter-", {
      "page.tsx": "export default function Page() { return <main>Node adapter</main>; }",
    });
    const handler = createNodeRequestHandler({ outDir });
    const server = createServer(handler);

    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    const port = typeof address === "object" && address !== null ? address.port : 0;

    try {
      const response = await fetch(`http://127.0.0.1:${port}/`);

      expect(response.status).toBe(200);
      expect(await response.text()).toContain("<main>Node adapter</main>");
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error === undefined ? resolve() : reject(error))),
      );
    }
  });

  test("closes a Node streaming response after a deferred loader field rejects", async () => {
    const state = globalThis as {
      __mreactRejectNodeLoadingRoute?: (error: Error) => void;
    };
    const { outDir } = await buildFixture("mreact-node-loading-error-adapter-", {
      "error.tsx":
        "export default function ErrorPage(props) { return <main>Stream error: {props.error.message}</main>; }",
      "loading.tsx": "export default function Loading() { return <p>Loading...</p>; }",
      "page.tsx": `import { defer } from "@reckona/mreact-router";

export const stream = true;

export function loader() {
  return defer({
    result: new Promise((_resolve, reject) => {
      globalThis.__mreactRejectNodeLoadingRoute = reject;
    }),
  });
}

export default function Page(props) {
  return <main><Await value={props.data.result}>{() => "Page"}</Await></main>;
}`,
    });
    const handler = createNodeRequestHandler({ outDir });
    const server = createServer(handler);

    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    const port = typeof address === "object" && address !== null ? address.port : 0;

    try {
      const response = await fetch(`http://127.0.0.1:${port}/`);
      expect(response.status).toBe(200);
      state.__mreactRejectNodeLoadingRoute?.(new Error("database unavailable"));
      const html = await expectResolvesWithin(
        response.text(),
        1000,
        "Node loading error response completion",
      );
      expect(html).toContain("Loading...");
      expect(html).toContain("Stream error:");
      expect(html).toContain("database unavailable</main>");
    } finally {
      state.__mreactRejectNodeLoadingRoute?.(new Error("test cleanup"));
      delete state.__mreactRejectNodeLoadingRoute;
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error === undefined ? resolve() : reject(error))),
      );
    }
  });

  test.each(["createNodeRequestHandler", "startServer"] as const)(
    "%s aborts a streaming loader when the client disconnects",
    async (entryPoint) => {
      const state = globalThis as {
        __mreactDisconnectedLoaderAborts?: number;
        __mreactDisconnectedLoaderStarted?: boolean;
      };
      state.__mreactDisconnectedLoaderAborts = 0;
      state.__mreactDisconnectedLoaderStarted = false;
      const { outDir } = await buildFixture("mreact-node-disconnect-adapter-", {
        "loading.tsx": "export default function Loading() { return <p>Loading...</p>; }",
        "page.tsx": `import { defer } from "@reckona/mreact-router";

export const stream = true;

export function loader({ request }) {
  globalThis.__mreactDisconnectedLoaderStarted = true;
  return defer({
    result: new Promise((_resolve, reject) => {
      const abort = () => {
        globalThis.__mreactDisconnectedLoaderAborts += 1;
        reject(request.signal.reason);
      };
      if (request.signal.aborted) {
        abort();
        return;
      }
      request.signal.addEventListener("abort", abort, { once: true });
    }),
  });
}

export default function Page(props) {
  return <main><Await value={props.data.result}>{() => "Page"}</Await></main>;
}`,
      });
      const server =
        entryPoint === "startServer"
          ? await startServer({ outDir, port: 0 })
          : await startAdapterServer(outDir);

      try {
        await disconnectAfterFirstChunk(server.url);
        await waitForCondition(
          () => state.__mreactDisconnectedLoaderAborts === 1,
          1000,
          `${entryPoint} loader abort`,
        );

        expect(state.__mreactDisconnectedLoaderStarted).toBe(true);
        expect(state.__mreactDisconnectedLoaderAborts).toBe(1);
      } finally {
        delete state.__mreactDisconnectedLoaderAborts;
        delete state.__mreactDisconnectedLoaderStarted;
        await server.close();
      }
    },
  );

  test("applies query dehydration filtering through the Node request handler", async () => {
    const { outDir } = await buildFixture("mreact-node-adapter-dehydrate-", {
      "page.tsx": queryDehydrationPageSource(),
    });
    const handler = createNodeRequestHandler({
      dehydrateOptions: {
        shouldDehydrateQuery: (entry) => entry.queryKey[0] === "public",
      },
      outDir,
    });
    const server = createServer(handler);

    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    const port = typeof address === "object" && address !== null ? address.port : 0;

    try {
      const html = await (await fetch(`http://127.0.0.1:${port}/`)).text();

      expect(html).toContain("visible-value");
      expect(html).not.toContain("secret-value");
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error === undefined ? resolve() : reject(error))),
      );
    }
  });

  test("emits HSTS behind an explicitly trusted HTTPS proxy", async () => {
    const { outDir } = await buildFixture("mreact-node-adapter-forwarded-proto-", {
      "page.tsx": `export const metadata = {
  security: { hsts: { maxAge: 31536000 } },
};
export const prerender = true;
export default function Page() { return <main>Secure proxy</main>; }`,
    });

    const request = async (trustForwardedProto: boolean) => {
      const handler = createNodeRequestHandler({ outDir, trustForwardedProto });
      const server = createServer(handler);
      await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
      const address = server.address();
      const port = typeof address === "object" && address !== null ? address.port : 0;

      try {
        return await fetch(`http://127.0.0.1:${port}/`, {
          headers: { "x-forwarded-proto": "https" },
        });
      } finally {
        await new Promise<void>((resolve, reject) =>
          server.close((error) => (error === undefined ? resolve() : reject(error))),
        );
      }
    };

    const untrusted = await request(false);
    const trusted = await request(true);

    expect(untrusted.headers.get("strict-transport-security")).toBeNull();
    expect(trusted.headers.get("strict-transport-security")).toBe("max-age=31536000");
  });

  test("passes forwarded protocol trust through startServer", async () => {
    const { outDir } = await buildFixture("mreact-start-server-forwarded-proto-", {
      "page.tsx": `export const metadata = {
  security: { hsts: { maxAge: 31536000 } },
};
export default function Page() { return <main>Secure start</main>; }`,
    });
    const server = await startServer({ outDir, port: 0, trustForwardedProto: true });

    try {
      const response = await fetch(server.url, {
        headers: { "x-forwarded-proto": "https" },
      });

      expect(response.headers.get("strict-transport-security")).toBe("max-age=31536000");
    } finally {
      await server.close();
    }
  });

  test("exports prerendered routes and client assets deterministically", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "mreact-static-adapter-"));
    const exportDir = join(rootDir, "dist");
    const { outDir } = await buildFixture("mreact-static-adapter-app-", {
      "page.tsx": `export const prerender = true;
export default function Page() { return <main>Static adapter</main>; }`,
    });

    const result = await exportStaticApp({ exportDir, outDir });

    expect(result.routes).toEqual(["/"]);
    expect(await readFile(join(exportDir, "index.html"), "utf8")).toContain(
      "<main>Static adapter</main>",
    );
    expect(await readFile(join(exportDir, "index.html"), "utf8")).toContain(
      '<meta name="mreact-static-navigation" content="/_mreact/navigation">',
    );
    expect(
      await readFile(join(exportDir, "_mreact", "navigation", "index.html"), "utf8"),
    ).toContain('data-mreact-route-id="index"');
    expect(await readFile(join(exportDir, "_mreact", "client", "manifest.json"), "utf8")).toContain(
      '"routes"',
    );
  });

  test("rejects static export routes that would write outside the export directory", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "mreact-static-adapter-traversal-"));
    const outDir = join(rootDir, "out");
    const exportDir = join(rootDir, "dist");
    await mkdir(join(outDir, "server"), { recursive: true });
    await mkdir(join(outDir, "client"), { recursive: true });
    await writeFile(
      join(outDir, "server", "manifest.json"),
      JSON.stringify({
        prerenderedRoutes: {
          "../escape": {
            headers: {},
            html: "<main>escape</main>",
            schemaVersion: 4,
            status: 200,
          },
        },
      }),
    );
    await writeFile(join(outDir, "client", "manifest.json"), JSON.stringify({ publicAssets: [] }));

    await expect(exportStaticApp({ exportDir, outDir, paths: ["../escape"] })).rejects.toThrow(
      /unsafe static export route/,
    );
    await expect(stat(join(rootDir, "escape", "index.html"))).rejects.toThrow();
  });

  test.each([
    ["legacy schema", { schemaVersion: 1 }],
    ["missing schema", {}],
    ["visitor-dependent headers", { schemaVersion: 4, headers: { vary: "Cookie" } }],
  ])(
    "rejects %s prerender entries before replacing an existing export",
    async (_name, overrides) => {
      const rootDir = await mkdtemp(join(tmpdir(), "mreact-static-adapter-unsafe-entry-"));
      const outDir = join(rootDir, "out");
      const exportDir = join(rootDir, "dist");
      await mkdir(join(outDir, "server"), { recursive: true });
      await mkdir(join(outDir, "client"), { recursive: true });
      await mkdir(exportDir, { recursive: true });
      await writeFile(join(exportDir, "existing.txt"), "preserve me");
      await writeFile(
        join(outDir, "server", "manifest.json"),
        JSON.stringify({
          prerenderedRoutes: {
            "/": {
              headers: {},
              html: "<main>unsafe</main>",
              status: 200,
              ...overrides,
            },
          },
        }),
      );
      await writeFile(
        join(outDir, "client", "manifest.json"),
        JSON.stringify({ publicAssets: [] }),
      );

      await expect(exportStaticApp({ exportDir, outDir })).rejects.toThrow(
        /Cannot export invalid prerendered route: \//,
      );
      await expect(readFile(join(exportDir, "existing.txt"), "utf8")).resolves.toBe("preserve me");
    },
  );

  test("creates an edge-safe Request/Response handler", async () => {
    const devtools = installDevtools();
    const handler = createEdgeRequestHandler({
      render(request) {
        return new Response(`edge:${new URL(request.url).pathname}`);
      },
    });

    const response = await handler(new Request("https://edge.test/docs"));

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("edge:/docs");
    expect(devtools.events()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          package: "@reckona/mreact-router",
          type: "router:request:start",
          url: "https://edge.test/docs",
        }),
        expect.objectContaining({
          package: "@reckona/mreact-router",
          status: 200,
          type: "router:request:end",
          url: "https://edge.test/docs",
        }),
      ]),
    );
    devtools.dispose();
  });

  test("returns 405 for legal extension methods across request adapters", async () => {
    const { outDir } = await buildFixture("mreact-adapter-method-conformance-", {
      "route.ts": `export function GET() {
  return new Response("ok");
}`,
    });
    const runtime = await createBuiltRequestRuntime({ outDir });
    const render = (request: Request) => runtime.render(request);
    const edge = createEdgeRequestHandler({ render });
    const clientManifest = JSON.parse(
      await readFile(join(outDir, "client", "manifest.json"), "utf8"),
    );
    const serverManifest = JSON.parse(
      await readFile(join(outDir, "server", "manifest.json"), "utf8"),
    );
    const cloudflare = createCloudflareRequestHandler({
      clientManifest,
      render,
      serverManifest,
    });
    const lambda = createAwsLambdaRequestHandler({ outDir });
    const nodeServer = createServer(createNodeRequestHandler({ outDir }));
    await new Promise<void>((resolve) => nodeServer.listen(0, "127.0.0.1", resolve));
    const address = nodeServer.address();
    const port = typeof address === "object" && address !== null ? address.port : 0;

    try {
      const [node, lambdaResult, edgeResult, cloudflareResult] = await Promise.all([
        fetch(`http://127.0.0.1:${port}/`, { method: "PROPFIND" }),
        lambda({
          headers: { host: "lambda.test" },
          rawPath: "/",
          rawQueryString: "",
          requestContext: { http: { method: "PROPFIND", protocol: "HTTP/1.1" } },
          version: "2.0",
        }),
        edge(new Request("https://edge.test/", { method: "PROPFIND" })),
        cloudflare.fetch(
          new Request("https://cloudflare.test/", { method: "PROPFIND" }),
          {},
          { passThroughOnException() {}, waitUntil() {} },
        ),
      ]);

      expect([
        node.status,
        lambdaResult.statusCode,
        edgeResult.status,
        cloudflareResult.status,
      ]).toEqual([405, 405, 405, 405]);
    } finally {
      await new Promise<void>((resolve, reject) =>
        nodeServer.close((error) => (error === undefined ? resolve() : reject(error))),
      );
    }
  });
});

async function buildFixture(
  prefix: string,
  files: Record<string, string>,
): Promise<{ outDir: string }> {
  const rootDir = await mkdtemp(join(tmpdir(), prefix));
  const appDir = join(rootDir, "app");
  const outDir = join(rootDir, ".mreact");
  await mkdir(appDir, { recursive: true });

  for (const [file, code] of Object.entries(files)) {
    await writeFile(join(appDir, file), code);
  }

  await buildApp({ appDir, outDir });

  return { outDir };
}

async function startAdapterServer(
  outDir: string,
): Promise<{ close(): Promise<void>; url: string }> {
  const server = createServer(createNodeRequestHandler({ outDir }));
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const port = typeof address === "object" && address !== null ? address.port : 0;

  return {
    close: () =>
      new Promise<void>((resolve, reject) =>
        server.close((error) => (error === undefined ? resolve() : reject(error))),
      ),
    url: `http://127.0.0.1:${port}`,
  };
}

async function disconnectAfterFirstChunk(origin: string): Promise<void> {
  const url = new URL(origin);

  await new Promise<void>((resolve, reject) => {
    const request = nodeRequest(
      {
        hostname: url.hostname,
        path: "/",
        port: url.port,
      },
      (response) => {
        response.once("data", () => {
          response.destroy();
          resolve();
        });
        response.once("error", () => resolve());
      },
    );
    request.once("error", reject);
    request.end();
  });
}

async function waitForCondition(
  predicate: () => boolean,
  timeoutMs: number,
  description: string,
): Promise<void> {
  const startedAt = Date.now();
  while (!predicate()) {
    if (Date.now() - startedAt >= timeoutMs) {
      throw new Error(`${description} did not complete within ${timeoutMs}ms`);
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

function queryDehydrationPageSource(): string {
  return `export async function loader({ queryClient }) {
  queryClient.setQueryData(["public"], "visible-value");
  queryClient.setQueryData(["private"], "secret-value");
}
export default function Page() { return <main>Query state</main>; }`;
}

async function expectResolvesWithin<T>(
  promise: Promise<T>,
  timeoutMs: number,
  description: string,
): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(
      () => reject(new Error(`${description} did not resolve within ${timeoutMs}ms`)),
      timeoutMs,
    );
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeout !== undefined) {
      clearTimeout(timeout);
    }
  }
}
