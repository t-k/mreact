import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { Miniflare } from "miniflare";
import { build as viteBuild } from "vite";
import { describe, expect, test } from "vitest";
import { buildApp } from "../src/build.js";

const execFileAsync = promisify(execFile);

describe("Cloudflare Workers generated entrypoint", () => {
  test("uses the provider adapter without Node imports", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "mreact-cloudflare-worker-entry-"));
    const appDir = join(rootDir, "app");
    const outDir = join(rootDir, ".mreact");
    await mkdir(appDir, { recursive: true });
    await writeFile(
      join(appDir, "page.tsx"),
      "export default function Page() { return <main>worker</main>; }",
    );

    await buildApp({ appDir, outDir, targets: ["cloudflare"] });
    const source = await readFile(join(outDir, "cloudflare", "worker.mjs"), "utf8");

    expect(source).toContain("@reckona/mreact-router/adapters/cloudflare");
    expect(source).toContain("./route-modules.mjs");
    expect(source).toContain("createCloudflareBuiltRequestHandler");
    expect(source).toContain("createCloudflareStaticAssetLoader");
    expect(source).not.toContain("import.meta.glob");
    expect(source).not.toContain("node:");
    expect(source).not.toContain("fs/promises");
  });

  test("serves server routes through the generated Worker", async () => {
    const testRoot = join(process.cwd(), "tmp");
    await mkdir(testRoot, { recursive: true });
    const rootDir = await mkdtemp(join(testRoot, "mreact-cloudflare-worker-server-route-"));
    const appDir = join(rootDir, "app");
    const outDir = join(rootDir, ".mreact");
    await mkdir(join(appDir, "api", "health"), { recursive: true });
    await writeFile(
      join(appDir, "page.tsx"),
      "export default function Page() { return <main>worker</main>; }",
    );
    await writeFile(
      join(appDir, "api", "health", "route.ts"),
      `export function GET() {
  return Response.json({ ok: true, runtime: "cloudflare" });
}`,
    );

    await buildApp({ appDir, outDir, targets: ["cloudflare"] });
    await linkRouterPackage(rootDir);
    const workerUrl = pathToFileURL(join(outDir, "cloudflare", "worker.mjs")).href;
    const { stdout } = await execFileAsync(process.execPath, [
      "--input-type=module",
      "--eval",
      `const worker = await import(${JSON.stringify(workerUrl)});
const response = await worker.default.fetch(
  new Request("https://app.example/api/health"),
  {},
  { passThroughOnException() {}, waitUntil() {} }
);
console.log(JSON.stringify({ body: await response.json(), status: response.status }));`,
    ]);
    const response = JSON.parse(stdout) as {
      body: unknown;
      status: number;
    };

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true, runtime: "cloudflare" });
  });

  test("serves the generated Worker inside a Cloudflare runtime", async () => {
    const testRoot = join(process.cwd(), "tmp");
    await mkdir(testRoot, { recursive: true });
    const rootDir = await mkdtemp(join(testRoot, "mreact-cloudflare-runtime-worker-"));
    const appDir = join(rootDir, "app");
    const outDir = join(rootDir, ".mreact");
    await mkdir(join(appDir, "api", "health"), { recursive: true });
    await writeFile(
      join(appDir, "page.tsx"),
      `export function loader() {
  return { runtime: "cloudflare" };
}

export default function Page(props: { data: { runtime: string } }) {
  return <main data-runtime={props.data.runtime}>Worker runtime</main>;
}`,
    );
    await writeFile(
      join(appDir, "api", "health", "route.ts"),
      `export function GET(request: Request) {
  return Response.json({
    hasDefaultCache: typeof caches.default.match === "function",
    ok: true,
    runtime: "cloudflare",
    url: request.url,
  });
}`,
    );

    await buildApp({ appDir, outDir, targets: ["cloudflare"] });
    await linkRouterPackage(rootDir);
    const bundledWorker = await bundleWorkerForMiniflare(outDir);

    const mf = new Miniflare({
      compatibilityDate: "2026-05-22",
      modules: true,
      scriptPath: bundledWorker,
    });

    try {
      const health = await mf.dispatchFetch("https://app.example/api/health");
      const page = await mf.dispatchFetch("https://app.example/");
      const html = await page.text();

      expect(health.status).toBe(200);
      await expect(health.json()).resolves.toEqual({
        hasDefaultCache: true,
        ok: true,
        runtime: "cloudflare",
        url: "https://app.example/api/health",
      });
      expect(page.status).toBe(200);
      expect(html).toContain('<main data-runtime="cloudflare">Worker runtime</main>');
    } finally {
      await mf.dispose();
    }
  });
});

async function bundleWorkerForMiniflare(outDir: string): Promise<string> {
  const bundleDir = join(outDir, "cloudflare-runtime");
  await viteBuild({
    build: {
      emptyOutDir: true,
      lib: {
        entry: join(outDir, "cloudflare", "worker.mjs"),
        fileName: "worker",
        formats: ["es"],
      },
      outDir: bundleDir,
      rollupOptions: {
        output: {
          codeSplitting: false,
          entryFileNames: "worker.mjs",
        },
      },
      target: "es2022",
      write: true,
    },
    configFile: false,
    logLevel: "silent",
  });

  return join(bundleDir, "worker.mjs");
}

async function linkRouterPackage(rootDir: string): Promise<void> {
  const scopeDir = join(rootDir, "node_modules", "@reckona");
  await mkdir(scopeDir, { recursive: true });
  await symlink(
    join(process.cwd(), "packages", "router"),
    join(scopeDir, "mreact-router"),
    "dir",
  );
}
