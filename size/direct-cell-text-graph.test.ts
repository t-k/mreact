import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { gzipSync } from "node:zlib";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { build as viteBuild, type Rollup } from "vite";

/**
 * bindText keeps the direct cell subscription and the effect-backed thunk in
 * one function, so passing it a cell never removed the generic path from a
 * bundle. bindCellText is a separate export; this guards that a consumer
 * whose dynamic text is all proven cells really drops the effect module.
 */

const repoRoot = resolve(import.meta.dirname, "..");
const alias = [
  { find: /^@reckona\/mreact-reactive-dom\/internal$/u, replacement: join(repoRoot, "packages/reactive-dom/dist/internal.js") },
  { find: /^@reckona\/mreact-reactive-dom$/u, replacement: join(repoRoot, "packages/reactive-dom/dist/index.js") },
  { find: /^@reckona\/mreact-reactive-core\/internal$/u, replacement: join(repoRoot, "packages/reactive-core/dist/internal.js") },
  { find: /^@reckona\/mreact-reactive-core$/u, replacement: join(repoRoot, "packages/reactive-core/dist/index.js") },
];

const scenarios = {
  generic: `import { bindText } from "@reckona/mreact-reactive-dom";
import { cell } from "@reckona/mreact-reactive-core";
export function mount(container) {
  const count = cell(0);
  const node = document.createTextNode("");
  container.append(node);
  return bindText(node, () => count.get());
}`,
  cell: `import { bindCellText } from "@reckona/mreact-reactive-dom/internal";
import { cell } from "@reckona/mreact-reactive-core";
export function mount(container) {
  const count = cell(0);
  const node = document.createTextNode("");
  container.append(node);
  return bindCellText(node, count);
}`,
} as const;

interface ConsumerBundle {
  gzipBytes: number;
  modules: string[];
  rawBytes: number;
}

let workDir: string;

async function bundleConsumer(name: keyof typeof scenarios): Promise<ConsumerBundle> {
  const entry = join(workDir, `entry-${name}.ts`);
  await writeFile(entry, scenarios[name]);
  const result = await viteBuild({
    build: {
      lib: { entry, formats: ["es"] },
      minify: "esbuild",
      rollupOptions: { treeshake: true },
      write: false,
    },
    configFile: false,
    define: { "import.meta.env.DEV": "false", "import.meta.env.PROD": "true" },
    logLevel: "silent",
    mode: "production",
    resolve: { alias },
    root: workDir,
  });
  const chunk = (Array.isArray(result) ? result : [result])
    .flatMap((output) => ("output" in output ? output.output : []))
    .find((output): output is Rollup.OutputChunk => output.type === "chunk");

  if (chunk === undefined) {
    throw new Error(`expected a chunk for the ${name} consumer`);
  }

  return {
    gzipBytes: gzipSync(chunk.code).length,
    modules: Object.entries(chunk.modules)
      .filter(([, info]) => info.renderedLength > 0)
      .map(([id]) => id.slice(repoRoot.length + 1))
      .sort(),
    rawBytes: Buffer.byteLength(chunk.code),
  };
}

beforeAll(async () => {
  workDir = await mkdtemp(join(repoRoot, "size", ".direct-cell-text-graph-"));
});

afterAll(async () => {
  await rm(workDir, { force: true, recursive: true });
});

describe("direct cell text dependency graph", () => {
  test("bindCellText drops the effect module that bindText keeps", async () => {
    const generic = await bundleConsumer("generic");
    const cellBound = await bundleConsumer("cell");

    expect(generic.modules).toContain("packages/reactive-core/dist/effect.js");
    expect(cellBound.modules).not.toContain("packages/reactive-core/dist/effect.js");
    expect(cellBound.modules).not.toContain("packages/reactive-core/dist/cleanup-scope.js");
    expect(cellBound.modules).toContain("packages/reactive-core/dist/cell-subscription.js");
    expect(cellBound.rawBytes).toBeLessThan(generic.rawBytes);
    expect(cellBound.gzipBytes).toBeLessThan(generic.gzipBytes);
  }, 60_000);
});
