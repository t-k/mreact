import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("HTTP adapter topology contract", () => {
  it.each(["mreact-app-router", "next-app-router", "marko-run", "solid-start", "tanstack-start", "tanstack-start-solid", "qwik-city", "qwik-router-v2", "production-app-adapter"])("%s exposes one target instead of independent metric probes", async (name) => {
    const source = await readFile(new URL(`./${name}.ts`, import.meta.url), "utf8");
    expect(source).toContain("async getHttpTarget()");
    expect(source).not.toContain("measureConcurrentRequestThroughputOps");
    expect(source).not.toContain("measureConcurrentRequestRssDeltaBytes");
  });

  it("starts primary mreact and Next servers in dedicated workers", async () => {
    for (const name of ["mreact-app-router", "next-app-router"]) {
      const source = await readFile(new URL(`./${name}.ts`, import.meta.url), "utf8");
      const primary = source.slice(source.indexOf("async function ensureFixture("), source.indexOf("async function ensureBrowserFixture("));
      expect(primary).toContain("startFixtureServer(");
      expect(primary).not.toContain("await startServer(");
      expect(primary).not.toContain("createServer(");
    }
  });

  it("starts the Svelte preview directly rather than sampling a pnpm wrapper", async () => {
    const source = await readFile(new URL("./svelte-kit.ts", import.meta.url), "utf8");
    expect(source).toContain('requireFromHere.resolve("vite/package.json")');
    expect(source).not.toContain("measureServerChildRss: false");
  });
});
