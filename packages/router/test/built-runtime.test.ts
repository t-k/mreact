import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { materializeBuiltRuntime } from "../src/built-runtime.js";

describe("built runtime materializer", () => {
  test("materializes manifest files and hydrates route runtime fields", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "mreact-built-runtime-"));
    let materializeCount = 0;

    const runtime = await materializeBuiltRuntime({
      clientManifestPath: join(rootDir, "client", "manifest.json"),
      clientManifestText: JSON.stringify({
        routes: [
          {
            client: true,
            kind: "page",
            path: "/",
            script: "routes/index.js",
          },
        ],
      }),
      importPolicyPath: join(rootDir, "server", "import-policy.json"),
      importPolicyText: JSON.stringify({ runtimePackages: ["react"] }),
      onMaterialize() {
        materializeCount += 1;
      },
      outDir: rootDir,
      runtimeDir: join(rootDir, "runtime"),
      serverManifestPath: join(rootDir, "server", "manifest.json"),
      serverManifestText: JSON.stringify({
        allowedSourceDirs: [""],
        files: {
          "page.tsx": "export default function Page() { return null; }",
        },
        routes: [
          {
            file: "page.tsx",
            kind: "page",
            path: "/",
            segments: [],
          },
        ],
        routesDir: "",
        version: 1,
      }),
    });

    expect(materializeCount).toBe(1);
    expect(runtime.appDir).toBe(join(rootDir, "runtime", "app"));
    expect(runtime.routes[0]?.file).toBe(join(rootDir, "runtime", "app", "page.tsx"));
    expect(runtime.clientAssetPaths.has("routes/index.js")).toBe(true);
    expect(runtime.generatedImportPolicy?.allowedPackages).toEqual(["react"]);
  });
});
