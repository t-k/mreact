import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { buildDynamicAttrCells } from "../dynamic-attr-cells.js";
import {
  createProductionAppAdapter,
  spawnAndWait,
  startCommandServer,
} from "./production-app-adapter.js";

export const nuxtAdapter = createProductionAppAdapter({
  name: "nuxt",
  packageName: "nuxt",
  fixturePrefix: "nuxt-fixture-",
  async writeFixture(rootDir, nodeCount) {
    const items = Array.from({ length: nodeCount }, (_, index) => index);
    const arrayLiteral = JSON.stringify(items);
    const cellsLiteral = JSON.stringify(buildDynamicAttrCells(200));

    await writeFile(
      join(rootDir, "package.json"),
      JSON.stringify(
        {
          name: "mreact-bench-nuxt-fixture",
          private: true,
          type: "module",
          scripts: {
            build: "nuxt build",
          },
        },
        null,
        2,
      ),
    );
    await writeFile(
      join(rootDir, "nuxt.config.ts"),
      `export default defineNuxtConfig({
  compatibilityDate: "2026-06-11",
  devtools: { enabled: false },
  ssr: true,
  telemetry: false,
});
`,
    );
    await mkdir(join(rootDir, "pages"), { recursive: true });

    await writeNuxtNodePage(rootDir, "pages/index.vue", arrayLiteral);
    await writeNuxtNodePage(rootDir, "pages/stream-page.vue", arrayLiteral);
    await writeNuxtNodePage(rootDir, "pages/static-page.vue", arrayLiteral);
    await writeNuxtRealStreamPage(rootDir, arrayLiteral);
    await writeNuxtWaterfallPage(rootDir);
    await writeNuxtDataGridPage(rootDir, cellsLiteral);
    await writeNuxtServerOnlyPage(rootDir);
    await writeNuxtInteractivePage(rootDir, "pages/interactive-bundle.vue");
    await writeNuxtInteractivePage(rootDir, "pages/interactive-minimal-bundle.vue");
  },
  build: (rootDir) =>
    spawnAndWait("pnpm", ["exec", "nuxt", "build"], {
      cwd: rootDir,
      env: { NUXT_TELEMETRY_DISABLED: "1" },
    }),
  buildOutputPaths: (rootDir) => [join(rootDir, ".output")],
  start: (rootDir) =>
    startCommandServer(process.execPath, [join(rootDir, ".output", "server", "index.mjs")], {
      cwd: rootDir,
      env: { NITRO_HOST: "127.0.0.1" },
    }),
});

async function writeNuxtNodePage(
  rootDir: string,
  relativePath: string,
  arrayLiteral: string,
): Promise<void> {
  await writeFile(
    join(rootDir, relativePath),
    `<script setup>
const items = ${arrayLiteral};
</script>
<template><main><span v-for="index in items" :key="index">{{ index }}</span></main></template>
`,
  );
}

async function writeNuxtRealStreamPage(rootDir: string, arrayLiteral: string): Promise<void> {
  await writeFile(
    join(rootDir, "pages", "real-stream-page.vue"),
    `<script setup>
await new Promise((resolve) => setTimeout(resolve, 50));
const items = ${arrayLiteral};
</script>
<template><main><span v-for="index in items" :key="index">{{ index }}</span></main></template>
`,
  );
}

async function writeNuxtWaterfallPage(rootDir: string): Promise<void> {
  await writeFile(
    join(rootDir, "pages", "waterfall-page.vue"),
    `<script setup>
const [a, b] = await Promise.all([
  new Promise((resolve) => setTimeout(() => resolve("A"), 50)),
  new Promise((resolve) => setTimeout(() => resolve("B"), 50)),
]);
</script>
<template><main><section :data-a="a">A:{{ a }}</section><section :data-b="b">B:{{ b }}</section></main></template>
`,
  );
}

async function writeNuxtDataGridPage(rootDir: string, cellsLiteral: string): Promise<void> {
  await writeFile(
    join(rootDir, "pages", "data-grid.vue"),
    `<script setup>
const cells = ${cellsLiteral};
</script>
<template>
  <main>
    <div
      v-for="cell in cells"
      :key="cell.row + '-' + cell.col"
      :class="'cell ' + cell.kind"
      :data-row="cell.row"
      :data-col="cell.col"
      :data-kind="cell.kind"
      :title="cell.title"
      :aria-label="cell.label"
      :style="{ background: cell.bg, color: cell.fg }"
    >{{ cell.text }}</div>
  </main>
</template>
`,
  );
}

async function writeNuxtServerOnlyPage(rootDir: string): Promise<void> {
  await writeFile(
    join(rootDir, "pages", "server-only-bundle.vue"),
    `<template><main><p>server only</p></main></template>
`,
  );
}

async function writeNuxtInteractivePage(rootDir: string, relativePath: string): Promise<void> {
  await writeFile(
    join(rootDir, relativePath),
    `<script setup>
const count = ref(0);
</script>
<template><main><button type="button" @click="count += 1">count: {{ count }}</button></main></template>
`,
  );
}
