import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import {
  __clearBuiltPublicAssetCacheForTest,
  __getBuiltPublicAssetCacheSizeForTest,
  __readBuiltPublicAssetForTest,
} from "../src/serve.js";

describe("built public asset cache", () => {
  test("does not retain unbounded negative public asset lookups", async () => {
    const outDir = await mkdtemp(join(tmpdir(), "mreact-public-negative-cache-"));
    await mkdir(join(outDir, "client", "public"), { recursive: true });
    __clearBuiltPublicAssetCacheForTest();

    for (let index = 0; index < 1500; index += 1) {
      await expect(
        __readBuiltPublicAssetForTest(outDir, `/missing-${index}.txt`),
      ).resolves.toBeUndefined();
    }

    expect(__getBuiltPublicAssetCacheSizeForTest()).toBe(0);
  });

  test("retains positive public asset cache entries", async () => {
    const outDir = await mkdtemp(join(tmpdir(), "mreact-public-positive-cache-"));
    await mkdir(join(outDir, "client", "public"), { recursive: true });
    await writeFile(join(outDir, "client", "public", "app.txt"), "asset");
    __clearBuiltPublicAssetCacheForTest();

    const first = await __readBuiltPublicAssetForTest(outDir, "/app.txt");
    const second = await __readBuiltPublicAssetForTest(outDir, "/app.txt");

    expect(await first?.text()).toBe("asset");
    expect(await second?.text()).toBe("asset");
    expect(__getBuiltPublicAssetCacheSizeForTest()).toBe(1);
  });
});
