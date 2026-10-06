import { mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { gzipSync } from "node:zlib";
import { build, type Rollup } from "vite";

/** Builds ordinary JSX through the public compiler and the workspace's production runtime. */
export async function buildNativeReviewFixture(source: string, entry: string, workspace = process.cwd()) {
  const rootDir = await mkdtemp(join(await realpath(tmpdir()), "mreact-native-review-"));
  try {
    const { transform } = await import(pathToFileURL(join(workspace, "packages/compiler/dist/index.js")).href);
    const output = transform({ code: source, filename: "NativeReview.tsx", target: "client", dev: false });
    const errors = output.diagnostics.filter((diagnostic: { level: string }) => diagnostic.level === "error");
    if (errors.length > 0) throw new Error(`Compiler errors: ${JSON.stringify(errors)}`);
    if (!output.code.includes("bindCompilerKeyedSingleNodeList")) throw new Error("Fixture did not use the ordinary compiler keyed list path");
    await writeFile(join(rootDir, "compiled.js"), output.code);
    await writeFile(join(rootDir, "entry.js"), entry);
    const built = await build({
      configFile: false,
      root: rootDir,
      logLevel: "silent",
      build: { write: false, lib: { entry: join(rootDir, "entry.js"), formats: ["es"] } },
      resolve: { alias: [
        { find: "@reckona/mreact-reactive-core/testing", replacement: resolve(workspace, "packages/reactive-core/dist/testing.js") },
        { find: "@reckona/mreact-reactive-core/internal", replacement: resolve(workspace, "packages/reactive-core/dist/internal.js") },
        { find: "@reckona/mreact-reactive-core/runtime-state", replacement: resolve(workspace, "packages/reactive-core/dist/runtime-state-public.js") },
        { find: "@reckona/mreact-reactive-dom/internal", replacement: resolve(workspace, "packages/reactive-dom/dist/internal.js") },
        { find: "@reckona/mreact-reactive-dom", replacement: resolve(workspace, "packages/reactive-dom/dist/index.js") },
        { find: "@reckona/mreact-reactive-core", replacement: resolve(workspace, "packages/reactive-core/dist/index.js") },
      ] },
    });
    const chunks = (Array.isArray(built) ? built : [built]).flatMap((result) => "output" in result ? result.output : [])
      .filter((item): item is Rollup.OutputChunk => item.type === "chunk");
    if (chunks.length !== 1) throw new Error(`Expected one browser bundle, received ${chunks.length}`);
    const bundle = chunks[0]!.code;
    return { bundle, bundleRawBytes: Buffer.byteLength(bundle), bundleGzipBytes: gzipSync(bundle).length, generatedCode: output.code };
  } finally {
    await rm(rootDir, { force: true, recursive: true });
  }
}
