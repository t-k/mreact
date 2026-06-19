import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { buildApp } from "../src/build.js";
import {
  __clearBuiltRuntimeCacheForTest,
  __getBuiltRuntimeMaterializeCountForTest,
  createBuiltRequestRuntime,
} from "../src/serve.js";

describe("built request runtime", () => {
  test("renders built pages and server routes through one runtime interface", async () => {
    const { appDir, outDir } = await createBuiltApp("mreact-built-request-runtime-");
    await mkdir(join(appDir, "api", "hello"), { recursive: true });
    await writeFile(
      join(appDir, "page.tsx"),
      `export default function Page() { return <main>Hello runtime</main>; }`,
    );
    await writeFile(
      join(appDir, "api", "hello", "route.ts"),
      `export function GET() { return Response.json({ ok: true }); }`,
    );
    await buildApp({ appDir, outDir, targets: ["node"] });
    const runtime = await createBuiltRequestRuntime({ outDir });

    const page = await runtime.render(new Request("http://local.test/"));
    const route = await runtime.render(new Request("http://local.test/api/hello"));

    expect(await page.text()).toContain("<main>Hello runtime</main>");
    expect(await route.json()).toEqual({ ok: true });
  });

  test("hot-route request preload does not force page render artifacts into the request plane", async () => {
    const { appDir, outDir } = await createBuiltApp("mreact-built-request-runtime-preload-");
    await writeFile(
      join(appDir, "page.tsx"),
      `export async function loader() {
  return { ok: true };
}

export default function Page() { return <main>Preload policy</main>; }`,
    );
    await buildApp({ appDir, outDir, targets: ["node"] });
    const runtime = await createBuiltRequestRuntime({ outDir });

    await runtime.preload({ mode: "hot-route-requests", routes: ["/"] });

    const response = await runtime.render(new Request("http://local.test/"));
    expect(await response.text()).toContain("<main>Preload policy</main>");
  });

  test("shares in-flight built runtime materialization for concurrent cold callers", async () => {
    const { appDir, outDir } = await createBuiltApp("mreact-built-runtime-inflight-");
    await writeFile(
      join(appDir, "page.tsx"),
      `export default function Page() { return <main>Shared runtime</main>; }`,
    );
    await buildApp({ appDir, outDir, targets: ["node"] });
    __clearBuiltRuntimeCacheForTest();

    await Promise.all([
      createBuiltRequestRuntime({ immutableRuntime: true, outDir }),
      createBuiltRequestRuntime({ immutableRuntime: true, outDir }),
    ]);

    expect(__getBuiltRuntimeMaterializeCountForTest()).toBe(1);
  });
});

async function createBuiltApp(
  prefix: string,
): Promise<{ appDir: string; outDir: string; rootDir: string }> {
  const rootDir = await mkdtemp(join(tmpdir(), prefix));
  const appDir = join(rootDir, "app");
  const outDir = join(rootDir, ".mreact");
  await mkdir(appDir, { recursive: true });

  return { appDir, outDir, rootDir };
}
