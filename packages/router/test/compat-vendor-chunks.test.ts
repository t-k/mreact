import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { buildApp } from "../src/build.js";
import { rewriteCompatVendorPlaceholderImportsForRunner } from "../src/module-runner.js";
import { startServer } from "../src/serve.js";

// The react-compat server runtime must be emitted once as shared vendor
// chunks instead of being re-bundled into every route's server module.

const tempRoots: string[] = [];

afterEach(async () => {
  for (const dir of tempRoots.splice(0)) {
    await rm(dir, { force: true, recursive: true });
  }
});

async function createCompatApp(): Promise<{ appDir: string; outDir: string }> {
  const rootDir = await mkdtemp(join(tmpdir(), "mreact-compat-vendor-"));
  tempRoots.push(rootDir);
  const appDir = join(rootDir, "app");
  const outDir = join(rootDir, ".mreact");
  await mkdir(join(appDir, "second"), { recursive: true });
  await writeFile(
    join(appDir, "layout.tsx"),
    `export default function Layout() {
  return <html lang="en"><body><Slot /></body></html>;
}`,
  );
  const page = (label: string) => `import { createElement, renderToString } from "@reckona/mreact-compat";

function View() {
  return createElement("main", { id: "${label}" }, "compat:${label}");
}

export default function Page() {
  return renderToString(View);
}

export const clientNavigation = false;
`;
  await writeFile(join(appDir, "page.tsx"), page("one"));
  await writeFile(join(appDir, "second", "page.tsx"), page("two"));
  return { appDir, outDir };
}

async function createPrerenderedCompatApp(): Promise<{ appDir: string; outDir: string }> {
  const rootDir = await mkdtemp(join(tmpdir(), "mreact-prerender-compat-vendor-"));
  tempRoots.push(rootDir);
  const appDir = join(rootDir, "app");
  const outDir = join(rootDir, ".mreact");
  await mkdir(appDir, { recursive: true });
  await writeFile(
    join(appDir, "layout.tsx"),
    `export default function Layout() {
  return <html lang="en"><body><Slot /></body></html>;
}`,
  );
  await writeFile(
    join(appDir, "view.tsx"),
    `import { createElement, renderToString } from "@reckona/mreact-compat";

export function View() {
  return createElement("main", { id: "prerendered" }, "compat:prerendered");
}

export function renderView() {
  return renderToString(View);
}
`,
  );
  await writeFile(
    join(appDir, "page.tsx"),
    `import { renderView } from "./view.js";

export const prerender = true;

export default function Page() {
  return renderView();
}
`,
  );
  return { appDir, outDir };
}

async function routeModuleSources(outDir: string): Promise<string[]> {
  const codeDir = join(outDir, "server", "server-modules", "code");
  const sources: string[] = [];
  for (const file of await readdir(codeDir)) {
    sources.push(await readFile(join(codeDir, file), "utf8"));
  }
  return sources;
}

describe("compat server vendor chunks", () => {
  test("rewrites compat placeholders to file URLs for the prerender runner", () => {
    const code = `import { createElement } from "mreact-compat-vendor:index";`;
    const rewritten = rewriteCompatVendorPlaceholderImportsForRunner(code);

    expect(rewritten).toContain('from "file://');
    expect(rewritten).not.toContain("mreact-compat-vendor:");
    expect(rewritten).not.toContain('from "@reckona/mreact-compat"');
  });

  test("emits shared compat chunks instead of inlining the runtime per route", async () => {
    const { appDir, outDir } = await createCompatApp();
    await buildApp({ appDir, outDir });

    const chunkDir = join(outDir, "server", "server-modules", "chunks");
    const chunkFiles = await readdir(chunkDir);
    expect(chunkFiles).toContain("compat.index.mjs");
    // Only the entries the routes actually import may be bundled; shipping the
    // full compat surface regresses output size for small apps.
    expect(chunkFiles).not.toContain("compat.flight.mjs");
    expect(chunkFiles).not.toContain("compat.internal.mjs");
    expect(chunkFiles).not.toContain("compat.scheduler.mjs");

    const compatModuleSources = (await routeModuleSources(outDir)).filter((source) =>
      source.includes("compat:"),
    );
    expect(compatModuleSources.length).toBeGreaterThanOrEqual(2);
    for (const source of compatModuleSources) {
      expect(source).toContain("../chunks/compat.index.mjs");
      // The compat runtime itself must no longer be inlined per route.
      expect(source).not.toContain("react-compat/dist");
      expect(source).not.toContain("REACT_COMPAT_ELEMENT_TYPE");
    }
  }, 120_000);

  test("serves compat routes from the shared vendor chunks", async () => {
    const { appDir, outDir } = await createCompatApp();
    await buildApp({ appDir, outDir });

    const server = await startServer({ outDir, port: 0 });
    try {
      const first = await (await fetch(`${server.url}/`)).text();
      const second = await (await fetch(`${server.url}/second`)).text();
      expect(first).toContain('<main id="one">compat:one</main>');
      expect(second).toContain('<main id="two">compat:two</main>');
    } finally {
      await server.close();
    }
  }, 120_000);

  test("prerenders compat routes with shared vendor chunks during build", async () => {
    const { appDir, outDir } = await createPrerenderedCompatApp();
    await buildApp({ appDir, outDir, targets: ["node"] });
    const manifest = JSON.parse(
      await readFile(join(outDir, "server", "manifest.json"), "utf8"),
    ) as {
      prerenderedRoutes?: Record<string, { html: string; status: number }>;
    };

    expect(manifest.prerenderedRoutes?.["/"]?.status).toBe(200);
    expect(manifest.prerenderedRoutes?.["/"]?.html).toContain(
      '<main id="prerendered">compat:prerendered</main>',
    );
  }, 120_000);

  test("keeps non-compat builds free of vendor chunk machinery", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "mreact-no-compat-vendor-"));
    tempRoots.push(rootDir);
    const appDir = join(rootDir, "app");
    const outDir = join(rootDir, ".mreact");
    await mkdir(appDir, { recursive: true });
    await writeFile(
      join(appDir, "page.tsx"),
      "export default function Page() { return <main>native</main>; }",
    );

    await buildApp({ appDir, outDir });

    await expect(readdir(join(outDir, "server", "server-modules", "chunks"))).rejects.toThrow();
    for (const source of await routeModuleSources(outDir)) {
      expect(source).not.toContain("mreact-compat-vendor:");
    }
  }, 120_000);
});
