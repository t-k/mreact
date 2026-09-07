import { mkdtemp, rm, writeFile } from "node:fs/promises";
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

  test("labels each asset with the roles that pulled it into the closure", async () => {
    const clientDir = await createClientDir({
      "entry.js": "entry",
      "shared.js": "shared",
      "styles.css": "body{}",
      "navigation.js": "navigate",
      "lazy.js": "lazy",
    });
    const manifest = {
      chunks: [
        { file: "entry.js", imports: ["shared.js"] },
        { file: "lazy.js", imports: ["shared.js"] },
      ],
      routes: [
        {
          // The stylesheet is also declared as a static import, so its roles must be reported in a
          // stable order rather than in the order the closure walk happened to discover them.
          css: ["styles.css"],
          dynamicImports: ["lazy.js"],
          imports: ["shared.js", "styles.css"],
          navigation: true,
          navigationScript: "navigation.js",
          path: "/",
          script: "entry.js",
        },
      ],
    } as const;

    const report = await measureBrowserDelivery({
      clientDir,
      firstInteraction: { fetchedDynamicImports: ["lazy.js"] },
      initialIncludesNavigationRuntime: true,
      initialPath: "/",
      manifest,
    });

    expect(
      Object.fromEntries(report.initial.assets.map((asset) => [asset.path, asset.roles])),
    ).toEqual({
      "entry.js": ["route-entry"],
      "navigation.js": ["navigation-runtime"],
      "shared.js": ["static-import"],
      "styles.css": ["css", "static-import"],
    });
    expect(report.firstInteraction?.assets.map((asset) => asset.roles)).toEqual([
      ["dynamic-import"],
    ]);
  });

  test("reports no reachable lazy chunks for a route that declares none", async () => {
    const clientDir = await createClientDir({ "entry.js": "entry", "extra.js": "extra" });
    const manifest = { routes: [{ path: "/", script: "entry.js" }] } as const;

    const report = await measureBrowserDelivery({
      clientDir,
      firstInteraction: { fetchedDynamicImports: ["extra.js"] },
      initialPath: "/",
      manifest,
      preload: { fetchedPreloads: ["extra.js"] },
    });

    expect(report.preload?.reachableDynamicImports).toEqual([]);
    expect(report.firstInteraction?.reachableDynamicImports).toEqual([]);
    expect(report.preload?.fetchedPaths).toEqual(["extra.js"]);
    // The preload already fetched it, so the interaction phase must not charge for it again.
    expect(report.firstInteraction?.fetchedPaths).toEqual([]);
    expect(report.firstInteraction?.cachedPaths).toEqual(["entry.js", "extra.js"]);
  });

  test("excludes the navigation runtime from a navigation delta once the first page fetched it", async () => {
    const clientDir = await createClientDir({
      "home.js": "home",
      "about.js": "about",
      "navigation.js": "navigate",
    });
    const manifest = {
      routes: [
        { navigation: true, navigationScript: "navigation.js", path: "/", script: "home.js" },
        { navigation: true, navigationScript: "navigation.js", path: "/about", script: "about.js" },
      ],
    } as const;

    const shared = await measureBrowserDelivery({
      clientDir,
      initialIncludesNavigationRuntime: true,
      initialPath: "/",
      manifest,
      navigation: { from: "/", includeNavigationRuntime: true, to: "/about" },
    });
    const excluded = await measureBrowserDelivery({
      clientDir,
      initialPath: "/",
      manifest,
      navigation: { from: "/", to: "/about" },
    });

    expect(shared.initial.paths).toEqual(["home.js", "navigation.js"]);
    expect(shared.navigation?.fetchedPaths).toEqual(["about.js"]);
    expect(shared.navigation?.cachedPaths).toEqual(["home.js", "navigation.js"]);
    expect(excluded.navigation?.cachedPaths).toEqual(["home.js"]);
  });

  test("never reads a file outside the client directory even when the manifest asks for one", async () => {
    const clientDir = await createClientDir({ "entry.js": "entry" });
    const outsideFile = join(clientDir, "..", "outside-delivery-secret.js");
    await writeFile(outsideFile, "secret".repeat(64));

    try {
      const report = await measureBrowserDelivery({
        clientDir,
        initialPath: "/",
        manifest: {
          routes: [
            { imports: ["../outside-delivery-secret.js"], path: "/", script: "entry.js" },
          ],
        },
      });

      expect(report.initial.unavailablePaths).toEqual(["../outside-delivery-secret.js"]);
      expect(report.initial.rawBytes).toBe("entry".length);
    } finally {
      await rm(outsideFile, { force: true });
    }
  });

  test("omits the navigation runtime unless the caller asks for it and the route declares it", async () => {
    const clientDir = await createClientDir({ "entry.js": "entry", "navigation.js": "navigate" });
    const manifest = {
      routes: [
        { navigation: true, navigationScript: "navigation.js", path: "/", script: "entry.js" },
        { navigation: false, navigationScript: "navigation.js", path: "/opt-out", script: "entry.js" },
      ],
    } as const;

    const excluded = await measureBrowserDelivery({ clientDir, initialPath: "/", manifest });
    const included = await measureBrowserDelivery({
      clientDir,
      initialIncludesNavigationRuntime: true,
      initialPath: "/",
      manifest,
    });
    const optedOut = await measureBrowserDelivery({
      clientDir,
      initialIncludesNavigationRuntime: true,
      initialPath: "/opt-out",
      manifest,
    });

    expect(excluded.initial.paths).toEqual(["entry.js"]);
    expect(included.initial.paths).toEqual(["entry.js", "navigation.js"]);
    expect(optedOut.initial.paths).toEqual(["entry.js"]);
  });

  test("inherits the initial navigation runtime setting for session visits", async () => {
    const clientDir = await createClientDir({ "home.js": "home", "navigation.js": "navigate" });
    const manifest = {
      routes: [
        { navigation: true, navigationScript: "navigation.js", path: "/", script: "home.js" },
        { navigation: true, navigationScript: "navigation.js", path: "/about", script: "home.js" },
      ],
    } as const;

    const inherited = await measureBrowserDelivery({
      clientDir,
      initialIncludesNavigationRuntime: true,
      initialPath: "/",
      manifest,
      session: { visits: [{ path: "/about" }] },
    });
    const overridden = await measureBrowserDelivery({
      clientDir,
      initialIncludesNavigationRuntime: false,
      initialPath: "/",
      manifest,
      session: { includeNavigationRuntime: true, visits: [{ path: "/about" }] },
    });

    expect(inherited.session?.cumulative.paths).toEqual(["home.js", "navigation.js"]);
    expect(overridden.initial.paths).toEqual(["home.js"]);
    expect(overridden.session?.visits[0]?.fetchedPaths).toEqual(["navigation.js"]);
  });

  test("terminates on import cycles instead of revisiting a chunk", async () => {
    const clientDir = await createClientDir({ "a.js": "a", "b.js": "b" });
    const manifest = {
      chunks: [
        { file: "a.js", imports: ["b.js"] },
        { file: "b.js", imports: ["a.js"] },
      ],
      routes: [{ path: "/", script: "a.js" }],
    } as const;

    const report = await measureBrowserDelivery({ clientDir, initialPath: "/", manifest });

    expect(report.initial.paths).toEqual(["a.js", "b.js"]);
    expect(report.initial.rawBytes).toBe(2);
  });

  test("omits phases the caller did not measure instead of reporting empty ones", async () => {
    const clientDir = await createClientDir({ "a.js": "a" });

    const report = await measureBrowserDelivery({
      clientDir,
      initialPath: "/",
      manifest: { routes: [{ path: "/", script: "a.js" }] },
    });

    expect(Object.keys(report).sort()).toEqual(["compression", "initial", "version"]);
    expect(report.version).toBe(2);
    expect(report.compression).toEqual({
      brotli: { lgwin: 22, quality: 11 },
      gzip: { level: -1 },
    });
  });

  test("sorts reachable dynamic imports and drops duplicates", async () => {
    const clientDir = await createClientDir({ "a.js": "a", "b.js": "b" });
    const manifest = {
      routes: [
        { path: "/", script: "a.js" },
        { dynamicImports: ["z.js", "a-lazy.js", "z.js"], path: "/b", script: "b.js" },
      ],
    } as const;

    const report = await measureBrowserDelivery({
      clientDir,
      initialPath: "/",
      manifest,
      navigation: { from: "/", to: "/b" },
    });

    expect(report.navigation?.reachableDynamicImports).toEqual(["a-lazy.js", "z.js"]);
  });

  test("records observed transfer bytes next to the estimated sizes", async () => {
    const clientDir = await createClientDir({ "a.js": "a".repeat(64), "b.js": "b".repeat(64) });
    const manifest = {
      chunks: [{ file: "a.js", imports: ["b.js"] }],
      routes: [{ path: "/", script: "a.js" }],
    } as const;

    const withoutTransfers = await measureBrowserDelivery({
      clientDir,
      initialPath: "/",
      manifest,
    });
    const withTransfers = await measureBrowserDelivery({
      clientDir,
      initialPath: "/",
      manifest,
      observedTransfers: { "a.js": 41, "b.js": 43 },
    });

    expect(withoutTransfers.initial.observedTransferBytes).toBeUndefined();
    expect(withoutTransfers.initial.assets[0]?.observedTransferBytes).toBeUndefined();
    expect(withTransfers.initial.observedTransferBytes).toBe(84);
    expect(withTransfers.initial.assets.map((asset) => asset.observedTransferBytes)).toEqual([
      41, 43,
    ]);
  });

  test("refuses manifest paths that escape the client directory", async () => {
    const clientDir = await createClientDir({ "a.js": "a" });
    const manifest = {
      routes: [
        { imports: ["../outside.js", "nested\\windows.js", ""], path: "/", script: "/absolute.js" },
      ],
    } as const;

    const report = await measureBrowserDelivery({ clientDir, initialPath: "/", manifest });

    expect(report.initial.unavailablePaths).toEqual([
      "../outside.js",
      "/absolute.js",
      "nested\\windows.js",
    ]);
    expect(report.initial.rawBytes).toBe(0);
    expect(report.initial.gzipEstimateBytes).toBe(0);
    expect(report.initial.brotliEstimateBytes).toBe(0);
  });

  test("names the missing route when the manifest does not describe it", async () => {
    const clientDir = await createClientDir({ "a.js": "a" });

    await expect(
      measureBrowserDelivery({
        clientDir,
        initialPath: "/missing",
        manifest: { routes: [{ path: "/", script: "a.js" }] },
      }),
    ).rejects.toThrow('Browser delivery manifest does not contain route "/missing".');
  });

  test("reads the script id from single-quoted and unquoted attributes", async () => {
    const clientDir = await createClientDir({ "a.js": "a" });
    const html = [
      "<script type='application/json' id='mreact-props-index'>{\"a\":1}</script>",
      "<script id=__mreact_query_state type=application/json>{\"b\":22}</script>",
      "<script id=\"mreact-client-references-index\">{\"c\":333}</script>",
      "<script>plain()</script>",
    ].join("");

    const report = await measureBrowserDelivery({
      clientDir,
      html: { source: html },
      initialPath: "/",
      manifest: { routes: [{ path: "/", script: "a.js" }] },
    });

    expect(report.html?.restorationRawBytes).toBe(7 + 9);
    expect(report.html?.queryDataRawBytes).toBe(8);
    expect(report.html?.inlineScriptRawBytes).toBe(7);
    expect(report.html?.routerMetadataRawBytes).toBe(0);
  });

  test("reports navigation runtime and prefetch manifest payloads as router metadata", async () => {
    const clientDir = await createClientDir({ "a.js": "a" });
    const navigation = '{"script":"/n.js"}';
    const prefetch = '[{"path":"/","script":"/a.js"}]';
    const html = [
      `<script type="application/json" id="mreact-navigation-runtime">${navigation}</script>`,
      `<script type="application/json" id="mreact-route-prefetch-manifest">${prefetch}</script>`,
    ].join("");

    const report = await measureBrowserDelivery({
      clientDir,
      html: { source: html },
      initialPath: "/",
      manifest: { routes: [{ path: "/", script: "a.js" }] },
    });

    expect(report.html?.routerMetadataRawBytes).toBe(
      Buffer.byteLength(navigation) + Buffer.byteLength(prefetch),
    );
    expect(report.html?.inlineScriptRawBytes).toBe(0);
    expect(report.html?.restorationRawBytes).toBe(0);
    expect(report.html?.queryDataRawBytes).toBe(0);
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
