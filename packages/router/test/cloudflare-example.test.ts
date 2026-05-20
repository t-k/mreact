import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { buildApp } from "../src/build.js";

describe("Cloudflare Workers generated entrypoint", () => {
  test("uses the provider adapter without Node imports", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "mreact-cloudflare-worker-entry-"));
    const appDir = join(rootDir, "app");
    const outDir = join(rootDir, ".mreact");
    await mkdir(appDir, { recursive: true });
    await writeFile(
      join(appDir, "page.tsx"),
      "export default function Page() { return <main>worker</main>; }",
    );

    await buildApp({ appDir, outDir, targets: ["cloudflare"] });
    const source = await readFile(join(outDir, "cloudflare", "worker.mjs"), "utf8");

    expect(source).toContain("@reckona/mreact-router/adapters/cloudflare");
    expect(source).toContain("./route-modules.mjs");
    expect(source).toContain("createCloudflareBuiltRequestHandler");
    expect(source).toContain("createCloudflareStaticAssetLoader");
    expect(source).not.toContain("import.meta.glob");
    expect(source).not.toContain("node:");
    expect(source).not.toContain("fs/promises");
  });
});
