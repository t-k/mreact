import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { expect, test } from "@playwright/test";
import { gzipEstimateBytes } from "../../../size/compression.js";
import { buildApp } from "../dist/build.js";
import { startServer } from "../dist/serve.js";

for (const mode of ["native", "compat"]) {
  test(`navigation delivery and behavior across a ${mode} session`, async ({ page }) => {
    const root = await mkdtemp(join(tmpdir(), "mreact-navigation-delivery-"));
    const appDir = join(root, "app");
    const outDir = join(root, "build");
    const counter =
      mode === "native"
        ? `import { cell } from "@reckona/mreact-reactive-core";
export function Counter() { const count=cell(0); return <button onClick={()=>count.set(n=>n+1)}>count: {count.get()}</button>; }`
        : `import { useState } from "@reckona/mreact-compat/hooks";
export function Counter() { const [count,setCount]=useState(0); return <button onClick={()=>setCount(n=>n+1)}>count: {count}</button>; }`;
    const counterFile = mode === "native" ? "Counter.tsx" : "Counter.compat.tsx";
    const files: Record<string, string> = {
      [counterFile]: counter,
      "layout.tsx": `import { Link } from "@reckona/mreact-router";
export default function Layout() { return <section><nav id="shell" style="position:fixed;top:0"><Link href="/">Home</Link><Link href="/other">Other</Link><Link href="/third">Third</Link><Link href="/fallback">Fallback</Link></nav><Slot /></section>; }`,
    };
    for (const [path, title] of [
      ["", "Home"],
      ["other/", "Other"],
      ["third/", "Third"],
      ["fallback/", "Fallback"],
    ]) {
      files[`${path}page.tsx`] =
        `import { Counter } from "${path ? "../" : "./"}${counterFile.replace(/\.tsx$/, "")}";
export default function Page() { return <main style="min-height:1800px;padding-top:60px"><h1>${title}</h1><Counter /></main>; }`;
    }
    for (const [path, code] of Object.entries(files)) {
      await mkdir(dirname(join(appDir, path)), { recursive: true });
      await writeFile(join(appDir, path), code);
    }
    let close: (() => Promise<void>) | undefined;
    const requested: string[] = [];
    const failures: string[] = [];
    const phases: unknown[] = [];
    const seen = new Set<string>();
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("request", (request) => {
      const path = new URL(request.url()).pathname;
      if (path.startsWith("/_mreact/client/") && path.endsWith(".js"))
        requested.push(path.slice("/_mreact/client/".length));
    });
    const checkpoint = async (name: string) => {
      await page.waitForLoadState("networkidle");
      const paths = [...new Set(requested.splice(0))].sort();
      const added = paths.filter((path) => !seen.has(path));
      paths.forEach((path) => seen.add(path));
      const assets = await Promise.all(
        [...seen].sort().map(async (path) => {
          const code = await readFile(join(outDir, "client", path));
          return { path, rawBytes: code.length, gzipEstimateBytes: gzipEstimateBytes(code) };
        }),
      );
      phases.push({
        name,
        requestedPaths: paths,
        addedPaths: added,
        assets,
        cumulativeGzipEstimateBytes: assets.reduce(
          (sum, asset) => sum + asset.gzipEstimateBytes,
          0,
        ),
      });
    };
    try {
      await buildApp({ appDir, outDir });
      const server = await startServer({ outDir, port: 0 });
      close = () => server.close();
      // A real HTTP fault only for navigation fetches exercises full-document fallback.
      const proxy = createServer(async (req, res) => {
        if (req.url?.startsWith("/fallback") && req.headers["x-mreact-navigation"] === "1") {
          failures.push(req.url);
          res.writeHead(503, { "content-type": "text/plain" });
          res.end("Navigation temporarily unavailable");
          return;
        }
        try {
          const response = await fetch(new URL(req.url ?? "/", server.url), {
            headers: Object.fromEntries(
              Object.entries(req.headers).filter(
                ([key, value]) => key !== "host" && typeof value === "string",
              ),
            ) as Record<string, string>,
          });
          res.writeHead(
            response.status,
            Object.fromEntries(
              [...response.headers].filter(
                ([key]) =>
                  !["content-encoding", "content-length", "transfer-encoding"].includes(key),
              ),
            ),
          );
          res.end(Buffer.from(await response.arrayBuffer()));
        } catch {
          res.writeHead(502);
          res.end();
        }
      });
      await new Promise<void>((resolve) => proxy.listen(0, "127.0.0.1", resolve));
      close = async () => {
        await new Promise<void>((resolve, reject) => {
          proxy.close((error) => (error ? reject(error) : resolve()));
          proxy.closeAllConnections();
        });
        await server.close();
      };
      const address = proxy.address();
      if (!address || typeof address === "string") throw new Error("Missing proxy address");
      await page.goto(`http://127.0.0.1:${address.port}`);
      await page.getByRole("button", { name: "count: 0", exact: true }).click();
      await expect(page.getByRole("button", { name: "count: 1", exact: true })).toBeVisible();
      await page.evaluate(() => {
        (window as any).__sessionDocument = document;
        (window as any).__sessionShell = document.getElementById("shell");
      });
      await checkpoint("initial");
      for (const title of ["Other", "Third", "Home"]) {
        await page.getByRole("link", { name: title, exact: true }).click();
        await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
        await expect(
          page.evaluate(
            () =>
              (window as any).__sessionDocument === document &&
              (window as any).__sessionShell === document.getElementById("shell"),
          ),
        ).resolves.toBe(true);
        const counterButton = page.getByRole("button", { name: /^count: / });
        const count = Number((await counterButton.textContent())?.split(":")[1]);
        await counterButton.click();
        await expect(counterButton).toHaveText(`count: ${count + 1}`);
        await checkpoint(title === "Home" ? "revisit" : title.toLowerCase());
      }
      await page.evaluate(() => window.scrollTo(0, 400));
      await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(400);
      await page.goBack();
      await expect(page.getByRole("heading", { name: "Third", exact: true })).toBeVisible();
      await checkpoint("back");
      await page.goForward();
      await expect(page.getByRole("heading", { name: "Home", exact: true })).toBeVisible();
      await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(400);
      await checkpoint("forward");
      await page.getByRole("link", { name: "Fallback", exact: true }).click();
      await expect(page.getByRole("heading", { name: "Fallback", exact: true })).toBeVisible();
      expect(failures.length).toBeGreaterThan(0);
      await expect(
        page.evaluate(() => (window as any).__sessionDocument === undefined),
      ).resolves.toBe(true);
      await page.getByRole("button", { name: "count: 0", exact: true }).click();
      await expect(page.getByRole("button", { name: "count: 1", exact: true })).toBeVisible();
      await checkpoint("fallback");
      expect(errors).toEqual([]);
      const output = process.env.MREACT_NAVIGATION_DELIVERY_OUT;
      if (output) {
        await mkdir(output, { recursive: true });
        await writeFile(
          join(output, `${mode}.json`),
          JSON.stringify({ mode, phases, failures, errors }, null, 2),
          { flag: "wx" },
        );
      }
    } finally {
      await close?.();
      await rm(root, { recursive: true, force: true });
    }
  });
}
