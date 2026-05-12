import { createServer, type Server } from "node:http";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Connect } from "vite";
import { afterEach, describe, expect, test } from "vitest";
import { createAppRouterViteMiddleware } from "../src/vite.js";

const servers: Server[] = [];

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve, reject) => {
          server.close((error) => (error ? reject(error) : resolve()));
        }),
    ),
  );
});

describe("app-router Vite middleware", () => {
  test("matches Vite v8 middleware contract and peer range", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-vite-contract-"));
    const middleware: Connect.NextHandleFunction =
      createAppRouterViteMiddleware({ appDir });
    const packageJson = JSON.parse(
      await readFile(new URL("../package.json", import.meta.url), "utf8"),
    ) as { peerDependencies?: Record<string, string> };

    expect(middleware).toHaveLength(3);
    expect(packageJson.peerDependencies?.vite).toBe(">=8 <9");
  });

  test("serves page HTML and client assets through HTTP", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-vite-"));
    await mkdir(join(appDir, "dashboard"), { recursive: true });
    await writeFile(
      join(appDir, "dashboard", "page.mreact.tsx"),
      `import { cell } from "@modular-react/reactive-core";

export default function Page() {
  const count = cell(0);
  return <button type="button" onClick={() => count.set(value => value + 1)}>count: {count.get()}</button>;
}`,
    );
    const server = await listenWithMiddleware(
      createAppRouterViteMiddleware({ appDir }),
    );

    const page = await fetch(`${server.url}/dashboard`);
    const html = await page.text();
    const asset = await fetch(
      `${server.url}/_mreact/client/routes/dashboard.js`,
    );
    const script = await asset.text();

    expect(page.status).toBe(200);
    expect(page.headers.get("content-type")).toContain("text/html");
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("count: 0");
    expect(html).toContain('/_mreact/client/routes/dashboard.js');
    expect(asset.status).toBe(200);
    expect(asset.headers.get("content-type")).toContain("text/javascript");
    expect(script).toContain("__mreactResumeRoute");
  });
});

async function listenWithMiddleware(
  middleware: Connect.NextHandleFunction,
): Promise<{ url: string }> {
  const server = createServer((request, response) => {
    middleware(request, response, () => {
      response.statusCode = 404;
      response.end("Not Found");
    });
  });

  servers.push(server);

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();

  if (typeof address !== "object" || address === null) {
    throw new Error("Expected HTTP server address.");
  }

  return { url: `http://127.0.0.1:${address.port}` };
}
