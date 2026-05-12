import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { buildApp } from "../src/build.js";

describe("mreact app build", () => {
  test("writes server and client manifests", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "mreact-app-build-"));
    const appDir = join(rootDir, "app");
    const outDir = join(rootDir, ".mreact");
    await mkdir(appDir, { recursive: true });
    await writeFile(
      join(appDir, "page.mreact.tsx"),
      "export default function Page() { return <main>Hello</main>; }",
    );

    const result = await buildApp({ appDir, outDir });
    const serverManifest = JSON.parse(
      await readFile(join(outDir, "server", "manifest.json"), "utf8"),
    ) as { routes: Array<{ path: string }> };
    const clientManifest = JSON.parse(
      await readFile(join(outDir, "client", "manifest.json"), "utf8"),
    ) as { routes: Array<{ client: boolean }> };

    expect(result.routes).toHaveLength(1);
    expect(serverManifest.routes[0]?.path).toBe("/");
    expect(clientManifest.routes[0]?.client).toBe(false);
  });
});
