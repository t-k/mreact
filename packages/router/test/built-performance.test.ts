import { mkdir, mkdtemp, readFile, readdir, symlink, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test, vi } from "vitest";
import { buildApp } from "../src/build.js";
import { createBuiltRequestRuntime, __clearBuiltRuntimeCacheForTest } from "../src/serve.js";
import {
  clearBuiltPublicAssetCacheForTest,
  getBuiltPublicAssetCacheSizeForTest,
  getBuiltPublicAssetCacheBytesForTest,
  readBuiltPublicAssetPaths,
  readBuiltPublicAsset,
} from "../src/built-assets.js";

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return { ...actual, readFile: vi.fn(actual.readFile), readdir: vi.fn(actual.readdir) };
});
const roots: string[] = [];
afterEach(async () => {
  clearBuiltPublicAssetCacheForTest();
  __clearBuiltRuntimeCacheForTest();
  vi.clearAllMocks();
  vi.restoreAllMocks();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});
async function fixture(publicAssets: string[] | undefined = ["/asset.txt"]) {
  const root = await mkdtemp(join(tmpdir(), "mreact-built-performance-"));
  roots.push(root);
  await mkdir(join(root, "server"), { recursive: true });
  await mkdir(join(root, "client", "public"), { recursive: true });
  await writeFile(join(root, "client", "public", "asset.txt"), "public asset");
  await writeFile(
    join(root, "server", "manifest.json"),
    JSON.stringify({ files: {}, routes: [], version: 1 }),
  );
  await writeFile(
    join(root, "client", "manifest.json"),
    JSON.stringify({ routes: [], ...(publicAssets === undefined ? {} : { publicAssets }) }),
  );
  return root;
}
function publicReads() {
  return vi
    .mocked(readFile)
    .mock.calls.filter(([path]) => String(path).includes(`${join("client", "public")}/`));
}

test("public manifest misses perform no per-request asset filesystem reads", async () => {
  const root = await fixture([]);
  const runtime = await createBuiltRequestRuntime({ outDir: root });
  vi.clearAllMocks();
  for (let i = 0; i < 20; i++) await runtime.render(new Request(`http://local.test/products/${i}`));
  expect((await runtime.render(new Request("http://local.test/asset.txt"))).status).toBe(404);
  expect(publicReads()).toHaveLength(0);
});

test("legacy manifests discover public assets once while dynamic misses avoid reads", async () => {
  const root = await fixture(undefined);
  const runtime = await createBuiltRequestRuntime({ outDir: root });
  vi.clearAllMocks();
  const response = await runtime.render(new Request("http://local.test/asset.txt"));
  expect(await response.text()).toBe("public asset");
  for (let i = 0; i < 20; i++) await runtime.render(new Request(`http://local.test/products/${i}`));
  expect(publicReads()).toHaveLength(1);
});

test("a dangling legacy public symlink does not hide valid sibling assets", async () => {
  const root = await fixture(undefined);
  await symlink(join(root, "missing.txt"), join(root, "client", "public", "dangling.txt"));
  const paths = await readBuiltPublicAssetPaths(root, undefined);
  expect([...paths!]).toEqual(["asset.txt"]);
  const runtime = await createBuiltRequestRuntime({ outDir: root });
  expect(await (await runtime.render(new Request("http://local.test/asset.txt"))).text()).toBe(
    "public asset",
  );
});

test("safe decoded public manifest paths retain precedence and reject path traversal", async () => {
  const root = await fixture(["/asset.txt", "/space file.txt", "/percent%20.txt"]);
  await writeFile(join(root, "client", "public", "space file.txt"), "space");
  await writeFile(join(root, "client", "public", "percent%20.txt"), "percent");
  const runtime = await createBuiltRequestRuntime({ outDir: root });
  expect(
    await (await runtime.render(new Request("http://local.test/space%20file.txt"))).text(),
  ).toBe("space");
  expect(
    await (await runtime.render(new Request("http://local.test/percent%2520.txt"))).text(),
  ).toBe("percent");
  for (const path of ["/%2e%2e%2fasset.txt", "/%5casset.txt", "/asset.txt%00", "/bad%ZZ"]) {
    vi.clearAllMocks();
    await runtime.render(new Request(`http://local.test${path}`));
    expect(publicReads()).toHaveLength(0);
  }
});

test("disabled request instrumentation does not read tracing headers", async () => {
  const root = await fixture();
  const runtime = await createBuiltRequestRuntime({ outDir: root });
  const request = new Request("http://local.test/asset.txt");
  const get = vi.spyOn(request.headers, "get");
  await runtime.render(request);
  expect(
    get.mock.calls.filter(([name]) => name === "traceparent" || name === "tracestate"),
  ).toHaveLength(0);
});

test("enabled request instrumentation preserves start/end tracing metadata", async () => {
  const root = await fixture();
  const runtime = await createBuiltRequestRuntime({ outDir: root });
  const request = new Request("http://local.test/asset.txt", {
    headers: { traceparent: "00-0123456789abcdef0123456789abcdef-0123456789abcdef-01" },
  });
  const onRequestStart = vi.fn();
  const onRequestEnd = vi.fn();
  await runtime.render(request, { instrumentation: { onRequestStart, onRequestEnd } });
  expect(onRequestStart).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({
      method: "GET",
      path: "/asset.txt",
      request,
      trace: expect.objectContaining({ sampled: true }),
    }),
  );
  expect(onRequestEnd).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({
      status: 200,
      path: "/asset.txt",
      request,
      trace: expect.objectContaining({ sampled: true }),
    }),
  );
});

test("oversize public assets are served but bypass the byte cache", async () => {
  const root = await fixture();
  await writeFile(join(root, "client", "public", "large.bin"), new Uint8Array(2 * 1024 * 1024 + 1));
  clearBuiltPublicAssetCacheForTest();
  const response = await readBuiltPublicAsset(root, "/large.bin");
  expect((await response?.arrayBuffer())?.byteLength).toBe(2 * 1024 * 1024 + 1);
  expect(getBuiltPublicAssetCacheSizeForTest()).toBe(0);
});

test("public assets evict by byte budget and continue to serve evicted files", async () => {
  const root = await fixture();
  clearBuiltPublicAssetCacheForTest();
  for (let i = 0; i < 17; i++) {
    await writeFile(
      join(root, "client", "public", `large-${i}.bin`),
      new Uint8Array(2 * 1024 * 1024),
    );
    const response = await readBuiltPublicAsset(root, `/large-${i}.bin`);
    expect((await response?.arrayBuffer())?.byteLength).toBe(2 * 1024 * 1024);
  }
  expect(getBuiltPublicAssetCacheSizeForTest()).toBe(16);
  vi.clearAllMocks();
  await readBuiltPublicAsset(root, "/large-0.bin");
  expect(publicReads()).toHaveLength(1);
  expect(getBuiltPublicAssetCacheSizeForTest()).toBe(16);
});

test("new empty public manifests distinguish an empty asset list from legacy builds", async () => {
  const root = await fixture();
  const appDir = join(root, "app"),
    outDir = join(root, "build");
  await mkdir(appDir);
  await writeFile(
    join(appDir, "route.ts"),
    "export function GET() { return new Response('route'); }",
  );
  await buildApp({ appDir, outDir, targets: ["node"] });
  expect(
    JSON.parse(await readFile(join(outDir, "client", "manifest.json"), "utf8")).publicAssets,
  ).toEqual([]);
});

test("framework assets precede public files and public files precede routes and middleware", async () => {
  const root = await fixture();
  const appDir = join(root, "app"),
    outDir = join(root, "build");
  await mkdir(join(appDir, "asset.txt"), { recursive: true });
  await mkdir(join(root, "public", "_mreact", "client"), { recursive: true });
  await writeFile(join(root, "public", "asset.txt"), "public asset");
  await writeFile(join(root, "public", "_mreact", "client", "fake.js"), "private fake");
  await writeFile(
    join(appDir, "asset.txt", "route.ts"),
    "export function GET() { return new Response('route'); }",
  );
  await writeFile(
    join(appDir, "middleware.ts"),
    "export default function middleware() { return new Response('blocked', {status:401}); }",
  );
  await buildApp({ projectRoot: root, routesDir: "app", outDir, targets: ["node"] });
  const runtime = await createBuiltRequestRuntime({ outDir });
  const asset = await runtime.render(new Request("http://local.test/asset.txt"));
  expect(asset.status).toBe(200);
  expect(await asset.text()).toBe("public asset");
  expect(
    (await runtime.render(new Request("http://local.test/_mreact/client/fake.js"))).status,
  ).toBe(404);
  expect((await runtime.render(new Request("http://local.test/protected"))).status).toBe(401);
});

test("public manifest entries cannot grant paths outside the public directory", async () => {
  const root = await fixture();
  const paths = await readBuiltPublicAssetPaths(root, [
    "/asset.txt",
    "../secret",
    "/../secret",
    "/bad\\name",
    "/nul\0name",
  ]);
  expect([...paths!]).toEqual(["asset.txt"]);
});

test("legacy public discovery skips directories and tolerates absent public directories", async () => {
  const root = await fixture(undefined);
  await mkdir(join(root, "client", "public", "nested"));
  await writeFile(join(root, "client", "public", "nested", "file.txt"), "nested");
  expect([...(await readBuiltPublicAssetPaths(root, undefined))!].sort()).toEqual([
    "asset.txt",
    join("nested", "file.txt"),
  ]);
  await rm(join(root, "client", "public"), { recursive: true });
  expect([...(await readBuiltPublicAssetPaths(root, undefined))!]).toEqual([]);
});

test("concurrent public reads retain one copy and reset byte accounting on clear", async () => {
  const root = await fixture();
  clearBuiltPublicAssetCacheForTest();
  await Promise.all(Array.from({ length: 8 }, () => readBuiltPublicAsset(root, "/asset.txt")));
  expect(getBuiltPublicAssetCacheSizeForTest()).toBe(1);
  expect(getBuiltPublicAssetCacheBytesForTest()).toBe(12);
  clearBuiltPublicAssetCacheForTest();
  expect(getBuiltPublicAssetCacheBytesForTest()).toBe(0);
});

test("zero-byte public assets are bounded by the entry limit", async () => {
  const root = await fixture();
  clearBuiltPublicAssetCacheForTest();
  for (let i = 0; i < 1025; i++) {
    await writeFile(join(root, "client", "public", `empty-${i}.txt`), "");
    await readBuiltPublicAsset(root, `/empty-${i}.txt`);
  }
  expect(getBuiltPublicAssetCacheSizeForTest()).toBe(1024);
  expect(getBuiltPublicAssetCacheBytesForTest()).toBe(0);
  vi.clearAllMocks();
  await readBuiltPublicAsset(root, "/empty-0.txt");
  expect(publicReads()).toHaveLength(1);
});

test("a one-byte insertion over the public total byte limit evicts the oldest entry", async () => {
  const root = await fixture();
  clearBuiltPublicAssetCacheForTest();
  for (let i = 0; i < 16; i++) {
    await writeFile(
      join(root, "client", "public", `full-${i}.bin`),
      new Uint8Array(2 * 1024 * 1024),
    );
    await readBuiltPublicAsset(root, `/full-${i}.bin`);
  }
  expect(getBuiltPublicAssetCacheBytesForTest()).toBe(32 * 1024 * 1024);
  await readBuiltPublicAsset(root, "/asset.txt");
  expect(getBuiltPublicAssetCacheBytesForTest()).toBe(30 * 1024 * 1024 + 12);
  expect(getBuiltPublicAssetCacheSizeForTest()).toBe(16);
});

test("legacy public discovery preserves symlink file access", async () => {
  const root = await fixture(undefined);
  await symlink(
    join(root, "client", "public", "asset.txt"),
    join(root, "client", "public", "alias.txt"),
  );
  const paths = await readBuiltPublicAssetPaths(root, undefined);
  expect(paths?.has("alias.txt")).toBe(true);
  expect(await (await readBuiltPublicAsset(root, "/alias.txt", paths))?.text()).toBe(
    "public asset",
  );
});

test("failed legacy directory discovery preserves the previous per-file fallback", async () => {
  const root = await fixture(undefined);
  vi.mocked(readdir).mockRejectedValueOnce(
    Object.assign(new Error("discovery denied"), { code: "EACCES" }),
  );
  const paths = await readBuiltPublicAssetPaths(root, undefined);
  expect(paths).toBeUndefined();
  expect(await (await readBuiltPublicAsset(root, "/asset.txt", paths))?.text()).toBe(
    "public asset",
  );
});

test("legacy public symlink directories retain per-file fallback access", async () => {
  const root = await fixture(undefined);
  await mkdir(join(root, "client", "public", "directory"));
  await writeFile(join(root, "client", "public", "directory", "file.txt"), "nested symlink");
  await symlink(
    join(root, "client", "public", "directory"),
    join(root, "client", "public", "alias"),
  );
  const paths = await readBuiltPublicAssetPaths(root, undefined);
  expect(paths).toBeUndefined();
  expect(await (await readBuiltPublicAsset(root, "/alias/file.txt", paths))?.text()).toBe(
    "nested symlink",
  );
});

test("cached public responses preserve content type and cache-control headers", async () => {
  const root = await fixture();
  vi.clearAllMocks();
  for (let i = 0; i < 2; i++) {
    const response = await readBuiltPublicAsset(root, "/asset.txt");
    expect(response?.headers.get("content-type")).toBe("text/plain; charset=utf-8");
    expect(response?.headers.get("cache-control")).toBe("public, max-age=3600");
    expect(await response?.text()).toBe("public asset");
  }
  expect(publicReads()).toHaveLength(1);
});

test("public root and non-prefixed paths retain their early-exit and file semantics", async () => {
  const root = await fixture();
  vi.clearAllMocks();
  expect(await readBuiltPublicAsset(root, "/")).toBeUndefined();
  expect(await readBuiltPublicAsset(root, "")).toBeUndefined();
  expect(readFile).not.toHaveBeenCalled();
  expect(await (await readBuiltPublicAsset(root, "asset.txt"))?.text()).toBe("public asset");
  expect(publicReads()).toHaveLength(1);
});
