import { createRequire } from "node:module";
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { qwikVite } from "@builder.io/qwik/optimizer";
import { compile } from "svelte/compiler";
import { build as viteBuild } from "vite";
import { gzipSync } from "node:zlib";

const requireFromHere = createRequire(import.meta.url);
const qwikPackageDir = dirname(dirname(requireFromHere.resolve("@builder.io/qwik")));
const sveltePackageDir = dirname(requireFromHere.resolve("svelte/package.json"));
const vuePackageDir = dirname(requireFromHere.resolve("vue/package.json"));

export interface BrowserFixture {
  gzipBytes: number;
  outDir: string;
  rootDir: string;
}

export async function createBrowserFixture(entrySource: string): Promise<BrowserFixture> {
  const rootDir = await mkdtemp(join(await realpath(tmpdir()), "mreact-primitive-browser-"));
  const outDir = join(rootDir, "dist");
  const sourceDir = join(rootDir, "src");

  try {
    await mkdir(sourceDir, { recursive: true });
    await writeSvelteBrowserComponents(sourceDir);
    await writeFile(
      join(rootDir, "index.html"),
      `<main id="root"></main><script type="module" src="/src/bench.ts"></script>`,
    );
    await writeFile(join(sourceDir, "bench.ts"), entrySource);

    await viteBuild({
      build: {
        emptyOutDir: true,
        outDir,
        rollupOptions: {
          output: {
            entryFileNames: "assets/bench.js",
          },
        },
      },
      configFile: false,
      logLevel: "silent",
      plugins: [
        qwikVite({
          client: { input: join(sourceDir, "bench.ts") },
          csr: true,
          srcDir: sourceDir,
        }),
      ],
      resolve: {
        alias: [
          {
            find: "@reckona/mreact-reactive-core/testing",
            replacement: join(process.cwd(), "packages/reactive-core/dist/testing.js"),
          },
          {
            find: "@reckona/mreact-reactive-core/internal",
            replacement: join(process.cwd(), "packages/reactive-core/dist/internal.js"),
          },
          {
            find: "@reckona/mreact-reactive-core/runtime-state",
            replacement: join(
              process.cwd(),
              "packages/reactive-core/dist/runtime-state-public.js",
            ),
          },
          {
            find: "@reckona/mreact-reactive-core",
            replacement: join(process.cwd(), "packages/reactive-core/dist/index.js"),
          },
          {
            find: "@reckona/mreact-reactive-dom/internal",
            replacement: join(process.cwd(), "packages/reactive-dom/dist/internal.js"),
          },
          {
            find: "@reckona/mreact-reactive-dom/compat-normalize",
            replacement: join(
              process.cwd(),
              "packages/reactive-dom/dist/compat-normalize.js",
            ),
          },
          {
            find: /^@reckona\/mreact-reactive-dom$/,
            replacement: join(process.cwd(), "packages/reactive-dom/dist/index.js"),
          },
          {
            find: "@reckona/mreact-compat",
            replacement: join(process.cwd(), "packages/react-compat/dist/index.js"),
          },
          {
            find: /^@builder\.io\/qwik$/,
            replacement: join(qwikPackageDir, "dist/core.mjs"),
          },
          {
            find: "@builder.io/qwik/build",
            replacement: join(qwikPackageDir, "dist/build/index.mjs"),
          },
          {
            find: "@builder.io/qwik/preloader",
            replacement: join(qwikPackageDir, "dist/preloader.mjs"),
          },
          {
            find: "@builder.io/qwik/qwikloader.js",
            replacement: join(qwikPackageDir, "dist/qwikloader.js"),
          },
          {
            find: "react-dom/client",
            replacement: requireFromHere.resolve("react-dom/client"),
          },
          {
            find: "zone.js",
            replacement: requireFromHere.resolve("zone.js"),
          },
          {
            find: /^@angular\/compiler$/,
            replacement: requireFromHere.resolve("@angular/compiler"),
          },
          {
            find: /^@angular\/core$/,
            replacement: requireFromHere.resolve("@angular/core"),
          },
          {
            find: /^@angular\/platform-browser$/,
            replacement: requireFromHere.resolve("@angular/platform-browser"),
          },
          {
            find: "svelte/internal/disclose-version",
            replacement: join(sveltePackageDir, "src", "internal", "disclose-version.js"),
          },
          {
            find: "svelte/internal/client",
            replacement: join(sveltePackageDir, "src", "internal", "client", "index.js"),
          },
          {
            find: /^svelte$/,
            replacement: join(sveltePackageDir, "src", "index-client.js"),
          },
          {
            find: /^vue$/,
            replacement: join(vuePackageDir, "dist", "vue.runtime.esm-bundler.js"),
          },
          {
            find: "react-dom",
            replacement: requireFromHere.resolve("react-dom"),
          },
          {
            find: "react",
            replacement: requireFromHere.resolve("react"),
          },
          {
            find: "solid-js",
            replacement: requireFromHere.resolve("solid-js/dist/solid.js"),
          },
        ],
      },
      root: rootDir,
    });

    const bundle = await readFile(join(outDir, "assets", "bench.js"));
    return { gzipBytes: gzipSync(bundle).length, outDir, rootDir };
  } catch (error) {
    await rm(rootDir, { force: true, recursive: true });
    throw error;
  }
}

async function writeSvelteBrowserComponents(sourceDir: string): Promise<void> {
  const svelteDir = join(sourceDir, "svelte");
  await mkdir(svelteDir, { recursive: true });
  await writeFile(
    join(svelteDir, "Rows.mjs"),
    compileSvelteComponent(
      "Rows.svelte",
      `<script>
let { rows = [], selectedId = -1 } = $props();
export function setRows(next) { rows = next; }
export function setSelectedId(next) { selectedId = next; }
</script>{#each rows as row (row.id)}<div data-key={row.id} class:selected={selectedId === row.id} data-selected={selectedId === row.id ? "true" : undefined}>{row.label}</div>{/each}`,
    ),
  );
}

function compileSvelteComponent(filename: string, source: string): string {
  return compile(source, {
    dev: false,
    filename,
    generate: "client",
  }).js.code;
}
