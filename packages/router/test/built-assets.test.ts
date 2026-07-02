import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import {
  builtClientAssetPaths,
  clearBuiltPublicAssetCacheForTest,
  getBuiltPublicAssetCacheSizeForTest,
  readBuiltPublicAsset,
} from "../src/built-assets.js";

describe("built asset handling", () => {
  test("derives allowed client asset paths from safe manifest assets", () => {
    const paths = builtClientAssetPaths({
      assets: ["runtime.js", "../escape.js", "/absolute.js", "nested/style.css"],
      routes: [
        {
          client: true,
          kind: "page",
          script: "routes/index.js",
          sourceMap: "routes/index.js.map",
          navigationScript: "routes/index.nav.js",
          path: "/",
          css: ["routes/index.css"],
          imports: ["chunks/shared.js", "bad//chunk.js"],
        },
      ],
    });

    expect([...paths].sort()).toEqual([
      "chunks/shared.js",
      "manifest.json",
      "nested/style.css",
      "routes/index.css",
      "routes/index.js",
      "routes/index.js.map",
      "routes/index.nav.js",
      "runtime.js",
    ]);
  });

  test("keeps positive public asset cache entries without caching misses", async () => {
    const outDir = await mkdtemp(join(tmpdir(), "mreact-built-assets-"));
    await mkdir(join(outDir, "client", "public"), { recursive: true });
    await writeFile(join(outDir, "client", "public", "app.txt"), "asset");
    clearBuiltPublicAssetCacheForTest();

    await expect(readBuiltPublicAsset(outDir, "/missing.txt")).resolves.toBeUndefined();
    const first = await readBuiltPublicAsset(outDir, "/app.txt");
    const second = await readBuiltPublicAsset(outDir, "/app.txt");

    expect(await first?.text()).toBe("asset");
    expect(await second?.text()).toBe("asset");
    expect(getBuiltPublicAssetCacheSizeForTest()).toBe(1);
  });

  test("rejects public asset paths that fail decoded path containment checks", async () => {
    const outDir = await mkdtemp(join(tmpdir(), "mreact-built-assets-"));
    await mkdir(join(outDir, "client", "public"), { recursive: true });
    await writeFile(join(outDir, "client", "public", "bad%ZZ.txt"), "bad percent");
    await writeFile(join(outDir, "client", "public", "safe\\asset.txt"), "backslash");
    clearBuiltPublicAssetCacheForTest();

    await expect(readBuiltPublicAsset(outDir, "/bad%ZZ.txt")).resolves.toBeUndefined();
    await expect(readBuiltPublicAsset(outDir, "/safe\\asset.txt")).resolves.toBeUndefined();
  });
});
