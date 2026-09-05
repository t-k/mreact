import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { describe, expect, test } from "vitest";
import { buildApp } from "../src/build.js";
import type { BoundaryReport } from "../src/boundaries.js";

describe("router build progress", () => {
  test("emits ordered build progress events around route discovery", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "mreact-app-build-progress-"));
    const appDir = join(rootDir, "app");
    const outDir = join(rootDir, ".mreact");
    const events: Array<{ count?: number; kind: string; phase?: string }> = [];
    await mkdir(appDir, { recursive: true });
    await writeFile(
      join(appDir, "page.tsx"),
      `export default function Page() {
  return <main>Progress build</main>;
}`,
    );

    await buildApp({
      appDir,
      outDir,
      onBuildProgress(event: { count?: number; kind: string; phase?: string }) {
        events.push(event);
      },
    });

    expect(events.slice(0, 3)).toEqual([
      { kind: "phase-start", phase: "scan" },
      expect.objectContaining({ kind: "phase-end", phase: "scan" }),
      { count: 1, kind: "routes-discovered" },
    ]);
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "phase-start", phase: "serverModules" }),
        expect.objectContaining({ kind: "phase-start", phase: "clientBundles" }),
        expect.objectContaining({ kind: "phase-start", phase: "writeManifests" }),
      ]),
    );
  });

  test("reports rendered component boundaries on both full and incremental builds", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "mreact-app-build-boundaries-"));
    const appDir = join(rootDir, "app");
    const outDir = join(rootDir, ".mreact");
    const reports: BoundaryReport[] = [];
    await mkdir(join(appDir, "components"), { recursive: true });
    await writeFile(
      join(appDir, "page.tsx"),
      `import { Counter } from "./components/Counter";

export default function Page() {
  return <main><Counter /></main>;
}`,
    );
    await writeFile(
      join(appDir, "components", "Counter.tsx"),
      `import { cell } from "@reckona/mreact-reactive-core";

export function Counter() {
  const count = cell(0);
  return <button onClick={() => count.set(count.get() + 1)}>{count.get()}</button>;
}`,
    );

    const build = async () =>
      await buildApp({
        appDir,
        outDir,
        onBoundaryReport(report) {
          reports.push(report);
        },
      });

    await build();
    await build();

    expect(reports).toHaveLength(2);
    expect(reports[0]).toEqual(reports[1]);
    expect(reports[0]?.routes[0]?.cost).toMatchObject({
      initial: {
        gzipEstimateBytes: expect.any(Number),
        rawBytes: expect.any(Number),
      },
      navigation: {
        gzipEstimateBytes: expect.any(Number),
        rawBytes: expect.any(Number),
      },
      status: "available",
    });
    expect(reports[0]?.routes[0]?.cost.initial?.rawBytes).toBeGreaterThan(0);
    expect(reports[0]?.routes).toEqual([
      expect.objectContaining({
        classification: "server-render",
        components: expect.arrayContaining([
          expect.objectContaining({
            classification: "server-render",
            exportName: "default",
            file: "page.tsx",
          }),
          expect.objectContaining({
            classification: "client-boundary",
            exportName: "Counter",
            file: "components/Counter.tsx",
          }),
        ]),
        entry: "page.tsx",
        path: "/",
      }),
    ]);
  });

  test("excludes unfetched lazy chunks from boundary navigation cost", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "mreact-app-build-boundary-lazy-cost-"));
    const appDir = join(rootDir, "app");
    const outDir = join(rootDir, ".mreact");
    const reports: BoundaryReport[] = [];
    await mkdir(appDir, { recursive: true });
    await writeFile(
      join(appDir, "page.tsx"),
      `export default function Page() {
  return <main><button onClick={() => void import("./lazy")}>Lazy</button></main>;
}`,
    );
    await writeFile(join(appDir, "lazy.ts"), `export const payload = "${"lazy".repeat(2_000)}";`);

    await buildApp({
      appDir,
      outDir,
      onBoundaryReport(report) {
        reports.push(report);
      },
    });

    const manifest = JSON.parse(
      await readFile(join(outDir, "client", "manifest.json"), "utf8"),
    ) as {
      routes: Array<{ dynamicImports?: string[]; path: string }>;
    };
    const route = manifest.routes.find((entry) => entry.path === "/");
    const cost = reports[0]?.routes.find((entry) => entry.path === "/")?.cost;

    expect(route?.dynamicImports?.length).toBeGreaterThan(0);
    expect(cost?.navigation?.gzipEstimateBytes).toBe(cost?.initial?.gzipEstimateBytes);

    const lazyBytes = await Promise.all(
      (route?.dynamicImports ?? []).map(
        async (path) => gzipSync(await readFile(join(outDir, "client", path))).byteLength,
      ),
    );
    expect(lazyBytes.reduce((total, bytes) => total + bytes, 0)).toBeGreaterThan(0);

    await buildApp({
      appDir,
      boundaryCost: {
        fetchedDynamicImports: { "/": route?.dynamicImports ?? [] },
      },
      onBoundaryReport(report) {
        reports.push(report);
      },
      outDir,
    });

    const fetchedCost = reports[1]?.routes.find((entry) => entry.path === "/")?.cost;
    expect(fetchedCost?.navigation?.gzipEstimateBytes).toBeGreaterThan(
      fetchedCost?.initial?.gzipEstimateBytes ?? 0,
    );
  });

  test("counts fetched lazy chunks reached through a shared static chunk", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "mreact-app-build-boundary-shared-lazy-cost-"));
    const appDir = join(rootDir, "app");
    const outDir = join(rootDir, ".mreact");
    const reports: BoundaryReport[] = [];
    await mkdir(join(appDir, "b"), { recursive: true });
    await writeFile(
      join(appDir, "Counter.tsx"),
      `export default function Counter() {
  return <button onClick={() => void import("./lazy")}>Lazy</button>;
}`,
    );
    await writeFile(join(appDir, "lazy.ts"), `export const payload = "${"lazy".repeat(2_000)}";`);
    await writeFile(
      join(appDir, "page.tsx"),
      `import Counter from "./Counter";
export default function Page() {
  return <main><Counter /></main>;
}`,
    );
    await writeFile(
      join(appDir, "b", "page.tsx"),
      `import Counter from "../Counter";
export default function Page() {
  return <aside><Counter /></aside>;
}`,
    );

    await buildApp({
      appDir,
      outDir,
      targets: ["node"],
      onBoundaryReport(report) {
        reports.push(report);
      },
    });

    const manifest = JSON.parse(
      await readFile(join(outDir, "client", "manifest.json"), "utf8"),
    ) as {
      chunks: Array<{ dynamicImports?: string[]; file: string }>;
    };
    const sharedChunk = manifest.chunks.find((chunk) => chunk.file.includes("Counter"));
    const lazy = sharedChunk?.dynamicImports?.[0];
    const before = reports[0]?.routes.find((route) => route.path === "/")?.cost;

    expect(lazy).toBeDefined();
    expect(before?.navigation?.gzipEstimateBytes).toBeDefined();

    await buildApp({
      appDir,
      boundaryCost: {
        fetchedDynamicImports: { "/": [lazy as string, "assets/chunks/not-in-manifest.js"] },
      },
      onBoundaryReport(report) {
        reports.push(report);
      },
      outDir,
      targets: ["node"],
    });

    const fetched = reports[1]?.routes.find((route) => route.path === "/")?.cost;
    expect(fetched?.navigation?.gzipEstimateBytes).toBeGreaterThan(
      before?.navigation?.gzipEstimateBytes ?? 0,
    );
  });

  test("reports CSS costs for a server-only route", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "mreact-app-build-boundary-css-cost-"));
    const appDir = join(rootDir, "app");
    const outDir = join(rootDir, ".mreact");
    const reports: BoundaryReport[] = [];
    await mkdir(appDir, { recursive: true });
    await writeFile(join(appDir, "style.css"), "main { color: red; }");
    await writeFile(
      join(appDir, "page.tsx"),
      `import "./style.css";
export default function Page() {
  return <main>Server only</main>;
}`,
    );

    await buildApp({
      appDir,
      outDir,
      onBoundaryReport(report) {
        reports.push(report);
      },
      targets: ["node"],
    });

    expect(reports[0]?.routes[0]?.cost).toMatchObject({
      initial: {
        gzipEstimateBytes: expect.any(Number),
        rawBytes: expect.any(Number),
      },
      navigation: {
        gzipEstimateBytes: expect.any(Number),
        rawBytes: expect.any(Number),
      },
      status: "available",
    });
  });
});
