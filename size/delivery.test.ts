import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { brotliCompressSync, gzipSync } from "node:zlib";
import { describe, expect, test } from "vitest";
import { measureBrowserDelivery } from "./delivery.js";

async function createClientDir(files: Record<string, string>): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "mreact-browser-delivery-"));

  await Promise.all(
    Object.entries(files).map(async ([file, content]) => {
      await writeFile(join(directory, file), content);
    }),
  );

  return directory;
}

describe("browser delivery measurement", () => {
  test("counts shared initial chunks once and excludes them from navigation delta", async () => {
    const clientDir = await createClientDir({
      "a.js": "a".repeat(11),
      "b.js": "b".repeat(13),
      "shared.js": "shared".repeat(17),
    });
    const manifest = {
      chunks: [
        { file: "a.js", imports: ["shared.js"] },
        { file: "b.js", imports: ["shared.js"] },
      ],
      routes: [
        { path: "/a", script: "a.js" },
        { path: "/b", script: "b.js" },
      ],
    } as const;

    const report = await measureBrowserDelivery({
      clientDir,
      initialPath: "/a",
      manifest,
      navigation: { from: "/a", to: "/b" },
    });

    expect(report.initial.paths).toEqual(["a.js", "shared.js"]);
    expect(report.navigation?.fetchedPaths).toEqual(["b.js"]);
    expect(report.navigation?.cachedPaths).toEqual(["a.js", "shared.js"]);
    expect(report.navigation?.reachableDynamicImports).toEqual([]);
  });

  test("reports reachable lazy chunks separately until the browser fetches them", async () => {
    const clientDir = await createClientDir({
      "a.js": "a".repeat(7),
      "b.js": "b".repeat(9),
      "lazy.js": "lazy".repeat(19),
    });
    const manifest = {
      routes: [
        { path: "/a", script: "a.js" },
        { path: "/b", dynamicImports: ["lazy.js"], script: "b.js" },
      ],
    } as const;

    const beforeFetch = await measureBrowserDelivery({
      clientDir,
      initialPath: "/a",
      manifest,
      navigation: { from: "/a", to: "/b" },
    });
    const afterFetch = await measureBrowserDelivery({
      clientDir,
      initialPath: "/a",
      manifest,
      navigation: { from: "/a", fetchedDynamicImports: ["lazy.js"], to: "/b" },
    });

    expect(beforeFetch.navigation?.fetchedPaths).toEqual(["b.js"]);
    expect(beforeFetch.navigation?.reachableDynamicImports).toEqual(["lazy.js"]);
    expect(afterFetch.navigation?.fetchedPaths).toEqual(["b.js", "lazy.js"]);
    expect(afterFetch.navigation?.rawBytes).toBeGreaterThan(beforeFetch.navigation?.rawBytes ?? 0);
  });

  test("keeps HTML inline, restoration, query and compressed totals distinct", async () => {
    const clientDir = await createClientDir({ "a.js": "a" });
    const html = [
      "<main>Ready</main>",
      "<script>window.__inline = true</script>",
      '<script type="application/json" id="mreact-props-index">{"restored":true}</script>',
      '<script type="application/json" id="__mreact_query_state">{"items":[1]}</script>',
    ].join("");

    const report = await measureBrowserDelivery({
      clientDir,
      html: { observedTransferBytes: 101, source: html },
      initialPath: "/",
      manifest: { routes: [{ path: "/", script: "a.js" }] },
    });

    expect(report.html).toMatchObject({
      observedTransferBytes: 101,
      queryDataRawBytes: expect.any(Number),
      restorationRawBytes: expect.any(Number),
      rawBytes: Buffer.byteLength(html),
    });
    expect(report.html?.inlineScriptRawBytes).toBeGreaterThan(0);
    expect(report.html?.gzipEstimateBytes).toBeGreaterThan(0);
    expect(report.html?.rawBytes).toBeGreaterThan(
      (report.html?.queryDataRawBytes ?? 0) + (report.html?.restorationRawBytes ?? 0),
    );
  });

  test("marks missing artifacts unavailable instead of inventing a byte count", async () => {
    const clientDir = await createClientDir({});

    const report = await measureBrowserDelivery({
      clientDir,
      initialPath: "/",
      manifest: { routes: [{ path: "/", script: "missing.js" }] },
    });

    expect(report.initial.unavailablePaths).toEqual(["missing.js"]);
    expect(report.initial.assets).toEqual([
      expect.objectContaining({ available: false, path: "missing.js" }),
    ]);
    expect(report.initial.rawBytes).toBe(0);
  });

  test("reports raw, gzip and Brotli totals over the same fetched chunk set", async () => {
    const entry = "entry();".repeat(64);
    const shared = "shared();".repeat(96);
    const clientDir = await createClientDir({ "entry.js": entry, "shared.js": shared });
    const manifest = {
      chunks: [{ file: "entry.js", imports: ["shared.js"] }],
      routes: [{ path: "/", script: "entry.js" }],
    } as const;

    const report = await measureBrowserDelivery({ clientDir, initialPath: "/", manifest });

    const expectedRaw = Buffer.byteLength(entry) + Buffer.byteLength(shared);
    const expectedGzip =
      gzipSync(Buffer.from(entry)).byteLength + gzipSync(Buffer.from(shared)).byteLength;
    const expectedBrotli =
      brotliCompressSync(Buffer.from(entry)).byteLength +
      brotliCompressSync(Buffer.from(shared)).byteLength;
    expect(report.initial.paths).toEqual(["entry.js", "shared.js"]);
    expect(report.initial.rawBytes).toBe(expectedRaw);
    expect(report.initial.gzipEstimateBytes).toBe(expectedGzip);
    expect(report.initial.brotliEstimateBytes).toBe(expectedBrotli);
    expect(report.initial.brotliEstimateBytes).toBeLessThan(report.initial.gzipEstimateBytes);
    for (const asset of report.initial.assets) {
      expect(asset.brotliEstimateBytes).toBeGreaterThan(0);
    }
  });

  test("separates fetched preloads and first-interaction imports from the initial closure", async () => {
    const clientDir = await createClientDir({
      "entry.js": "entry".repeat(20),
      "preloaded.js": "preloaded".repeat(30),
      "unfetched.js": "unfetched".repeat(40),
      "interaction.js": "interaction".repeat(50),
    });
    const manifest = {
      chunks: [{ dynamicImports: ["interaction.js", "unfetched.js"], file: "entry.js" }],
      routes: [
        { dynamicImports: ["interaction.js", "unfetched.js"], path: "/", script: "entry.js" },
      ],
    } as const;

    const report = await measureBrowserDelivery({
      clientDir,
      firstInteraction: { fetchedDynamicImports: ["interaction.js"] },
      initialPath: "/",
      manifest,
      preload: { fetchedPreloads: ["preloaded.js"] },
    });

    expect(report.initial.paths).toEqual(["entry.js"]);
    expect(report.preload?.fetchedPaths).toEqual(["preloaded.js"]);
    expect(report.firstInteraction?.fetchedPaths).toEqual(["interaction.js"]);
    expect(report.firstInteraction?.reachableDynamicImports).toEqual([
      "interaction.js",
      "unfetched.js",
    ]);
    expect(report.firstInteraction?.paths).not.toContain("unfetched.js");
  });

  test("counts every session chunk once and adds zero bytes when a visited route is revisited", async () => {
    const clientDir = await createClientDir({
      "home.js": "home".repeat(11),
      "about.js": "about".repeat(13),
      "settings.js": "settings".repeat(17),
      "shared.js": "shared".repeat(23),
    });
    const manifest = {
      chunks: [
        { file: "home.js", imports: ["shared.js"] },
        { file: "about.js", imports: ["shared.js"] },
        { file: "settings.js", imports: ["shared.js"] },
      ],
      routes: [
        { path: "/", script: "home.js" },
        { path: "/about", script: "about.js" },
        { path: "/settings", script: "settings.js" },
      ],
    } as const;

    const report = await measureBrowserDelivery({
      clientDir,
      initialPath: "/",
      manifest,
      session: { visits: [{ path: "/about" }, { path: "/settings" }, { path: "/about" }] },
    });

    expect(report.session?.visits.map((visit) => visit.fetchedPaths)).toEqual([
      ["about.js"],
      ["settings.js"],
      [],
    ]);
    expect(report.session?.visits.at(-1)?.rawBytes).toBe(0);
    expect(report.session?.cumulative.paths).toEqual([
      "about.js",
      "home.js",
      "settings.js",
      "shared.js",
    ]);
    expect(report.session?.cumulative.rawBytes).toBe(
      report.initial.rawBytes +
        (report.session?.visits ?? []).reduce((total, visit) => total + visit.rawBytes, 0),
    );
    expect(report.session?.routeVisitCount).toBe(4);
  });

  test("keeps restoration payload for a route named query out of the query state total", async () => {
    const clientDir = await createClientDir({ "a.js": "a" });
    const restoration = '{"params":{},"request":{"pathname":"/query"}}';
    const queryState = '{"queries":[{"queryKey":["time"],"state":{"data":{"value":"now"}}}]}';
    const html = [
      "<main>Ready</main>",
      `<script type="application/json" id="mreact-props-query">${restoration}</script>`,
      `<script type="application/json" id="__mreact_query_state">${queryState}</script>`,
    ].join("");

    const report = await measureBrowserDelivery({
      clientDir,
      html: { source: html },
      initialPath: "/",
      manifest: { routes: [{ path: "/", script: "a.js" }] },
    });

    expect(report.html?.restorationRawBytes).toBe(Buffer.byteLength(restoration));
    expect(report.html?.queryDataRawBytes).toBe(Buffer.byteLength(queryState));
    expect(report.html?.inlineScriptRawBytes).toBe(0);
    expect(report.html?.brotliEstimateBytes).toBeGreaterThan(0);
  });
});
