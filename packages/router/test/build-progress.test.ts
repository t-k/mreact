import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { buildApp } from "../src/build.js";

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
});
