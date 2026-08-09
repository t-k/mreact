import { createServer } from "node:http";
import { mkdir, mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { installDevtools } from "@reckona/mreact-devtools";
import { buildApp } from "../src/build.js";
import { createEdgeRequestHandler } from "../src/adapters/edge.js";
import { createNodeRequestHandler } from "../src/adapters/node.js";
import { exportStaticApp } from "../src/adapters/static.js";

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

  test("emits HSTS behind an explicitly trusted HTTPS proxy", async () => {
    const { outDir } = await buildFixture("mreact-node-adapter-forwarded-proto-", {
      "page.tsx": `export const metadata = {
  security: { hsts: { maxAge: 31536000 } },
};
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
            status: 200,
          },
        },
      }),
    );
    await writeFile(
      join(outDir, "client", "manifest.json"),
      JSON.stringify({ publicAssets: [] }),
    );

    await expect(exportStaticApp({ exportDir, outDir, paths: ["../escape"] })).rejects.toThrow(
      /unsafe static export route/,
    );
    await expect(stat(join(rootDir, "escape", "index.html"))).rejects.toThrow();
  });

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
