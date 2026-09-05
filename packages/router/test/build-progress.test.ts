import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
});
