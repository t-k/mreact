import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildApp } from "../../packages/router/dist/index.js";
import { startFixtureServer } from "./fixture-server.js";
import { writeHttpCacheModeFixture } from "./http-cache-modes-fixture.js";

describe("aligned mreact HTTP cache modes", () => {
  it("renders the same content on verified cache hits, unique misses, and uncached requests", async () => {
    const root = await mkdtemp(join(tmpdir(), "mreact-http-cache-modes-test-"));
    let server: Awaited<ReturnType<typeof startFixtureServer>> | undefined;
    try {
      const appDir = join(root, "app");
      const outDir = join(root, "out");
      await writeHttpCacheModeFixture(appDir);
      await buildApp({ appDir, outDir });
      server = await startFixtureServer({ framework: "mreact", directory: outDir });
      const miss = await fetch(`${server.url}/cacheable`);
      const hit = await fetch(`${server.url}/cacheable`);
      const uniqueMiss = await fetch(`${server.url}/cacheable?key=one`);
      const anotherMiss = await fetch(`${server.url}/cacheable?key=two`);
      const uncached = await fetch(`${server.url}/uncached`);
      const uncachedAgain = await fetch(`${server.url}/uncached`);
      expect(miss.headers.get("x-mreact-cache")).toBe("MISS");
      expect(hit.headers.get("x-mreact-cache")).toBe("HIT");
      expect(uniqueMiss.headers.get("x-mreact-cache")).toBe("MISS");
      expect(anotherMiss.headers.get("x-mreact-cache")).toBe("MISS");
      expect(uncached.headers.get("x-mreact-cache")).toBeNull();
      expect(uncachedAgain.headers.get("x-mreact-cache")).toBeNull();
      expect(uncached.headers.get("cache-control")).toBe("max-age=0");
      const bodies = await Promise.all([miss, hit, uniqueMiss, anotherMiss, uncached, uncachedAgain].map((response) => response.text()));
      const content = bodies.map((body) => body.match(/<main>.*?<\/main>/s)?.[0]);
      expect(content.every((value) => value === content[0])).toBe(true);
      expect(content[0]).toContain("<span>999</span>");
    } finally {
      await server?.close();
      await rm(root, { force: true, recursive: true });
    }
  }, 120_000);
});
