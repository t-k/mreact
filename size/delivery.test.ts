import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
      '<script type="application/json" id="mreact-query-state">{"items":[1]}</script>',
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
});
