import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { buildDynamicAttrCells } from "../dynamic-attr-cells.js";
import {
  createProductionAppAdapter,
  spawnAndWait,
  startCommandServer,
} from "./production-app-adapter.js";

export const svelteKitAdapter = createProductionAppAdapter({
  name: "svelte-kit",
  packageName: "@sveltejs/kit",
  fixturePrefix: "svelte-kit-fixture-",
  async writeFixture(rootDir, nodeCount) {
    const items = Array.from({ length: nodeCount }, (_, index) => index);
    const arrayLiteral = JSON.stringify(items);
    const cellsLiteral = JSON.stringify(buildDynamicAttrCells(200));

    await writeFile(
      join(rootDir, "package.json"),
      JSON.stringify(
        {
          name: "mreact-bench-svelte-kit-fixture",
          private: true,
          type: "module",
          scripts: {
            build: "vite build",
            preview: "vite preview",
          },
        },
        null,
        2,
      ),
    );
    await writeFile(
      join(rootDir, "svelte.config.js"),
      `const adapter = {
  name: "mreact-bench-adapter",
  async adapt(builder) {
    builder.writeClient(".svelte-kit/bench/client");
    builder.writeServer(".svelte-kit/bench/server");
  },
};

export default { kit: { adapter } };
`,
    );
    await writeFile(
      join(rootDir, "vite.config.js"),
      `import { sveltekit } from "@sveltejs/kit/vite";
export default { plugins: [sveltekit()] };
`,
    );
    await mkdir(join(rootDir, "src", "routes"), { recursive: true });
    await writeFile(
      join(rootDir, "src", "app.html"),
      `<!doctype html><html lang="en"><head><meta charset="utf-8">%sveltekit.head%</head><body><div>%sveltekit.body%</div></body></html>`,
    );

    await writeSvelteNodePage(rootDir, "src/routes/+page.svelte", arrayLiteral);
    await writeSvelteNodePage(rootDir, "src/routes/stream-page/+page.svelte", arrayLiteral);
    await writeSvelteNodePage(rootDir, "src/routes/static-page/+page.svelte", arrayLiteral);
    await writeSvelteRealStreamPage(rootDir, arrayLiteral);
    await writeSvelteWaterfallPage(rootDir);
    await writeSvelteDataGridPage(rootDir, cellsLiteral);
    await writeSvelteServerOnlyPage(rootDir);
    await writeSvelteInteractivePage(rootDir, "src/routes/interactive-bundle/+page.svelte");
    await writeSvelteInteractivePage(rootDir, "src/routes/interactive-minimal-bundle/+page.svelte");
  },
  build: (rootDir) => spawnAndWait("pnpm", ["exec", "vite", "build"], { cwd: rootDir }),
  buildOutputPaths: (rootDir) => [join(rootDir, ".svelte-kit", "bench")],
  start: (rootDir) =>
    startCommandServer(
      "pnpm",
      (port) => ["exec", "vite", "preview", "--host", "127.0.0.1", "--port", String(port)],
      { cwd: rootDir },
    ),
});

async function writeSvelteNodePage(
  rootDir: string,
  relativePath: string,
  arrayLiteral: string,
): Promise<void> {
  await mkdir(join(rootDir, relativePath, ".."), { recursive: true });
  await writeFile(
    join(rootDir, relativePath),
    `<script>
  const items = ${arrayLiteral};
</script>
<main>{#each items as index}<span>{index}</span>{/each}</main>
`,
  );
}

async function writeSvelteRealStreamPage(rootDir: string, arrayLiteral: string): Promise<void> {
  await mkdir(join(rootDir, "src", "routes", "real-stream-page"), { recursive: true });
  await writeFile(
    join(rootDir, "src", "routes", "real-stream-page", "+page.server.js"),
    `export async function load() {
  await new Promise((resolve) => setTimeout(resolve, 50));
  return { items: ${arrayLiteral} };
}
`,
  );
  await writeFile(
    join(rootDir, "src", "routes", "real-stream-page", "+page.svelte"),
    `<script>
  let { data } = $props();
</script>
<main>{#each data.items as index}<span>{index}</span>{/each}</main>
`,
  );
}

async function writeSvelteWaterfallPage(rootDir: string): Promise<void> {
  await mkdir(join(rootDir, "src", "routes", "waterfall-page"), { recursive: true });
  await writeFile(
    join(rootDir, "src", "routes", "waterfall-page", "+page.server.js"),
    `export async function load() {
  const [a, b] = await Promise.all([
    new Promise((resolve) => setTimeout(() => resolve("A"), 50)),
    new Promise((resolve) => setTimeout(() => resolve("B"), 50)),
  ]);
  return { a, b };
}
`,
  );
  await writeFile(
    join(rootDir, "src", "routes", "waterfall-page", "+page.svelte"),
    `<script>
  let { data } = $props();
</script>
<main><section data-a={data.a}>A:{data.a}</section><section data-b={data.b}>B:{data.b}</section></main>
`,
  );
}

async function writeSvelteDataGridPage(rootDir: string, cellsLiteral: string): Promise<void> {
  await mkdir(join(rootDir, "src", "routes", "data-grid"), { recursive: true });
  await writeFile(
    join(rootDir, "src", "routes", "data-grid", "+page.svelte"),
    `<script>
  const cells = ${cellsLiteral};
</script>
<main>{#each cells as cell}<div class={"cell " + cell.kind} data-row={cell.row} data-col={cell.col} data-kind={cell.kind} title={cell.title} aria-label={cell.label} style={"background:" + cell.bg + ";color:" + cell.fg}>{cell.text}</div>{/each}</main>
`,
  );
}

async function writeSvelteServerOnlyPage(rootDir: string): Promise<void> {
  await mkdir(join(rootDir, "src", "routes", "server-only-bundle"), { recursive: true });
  await writeFile(
    join(rootDir, "src", "routes", "server-only-bundle", "+page.js"),
    `export const csr = false;
`,
  );
  await writeFile(
    join(rootDir, "src", "routes", "server-only-bundle", "+page.svelte"),
    `<main><p>server only</p></main>
`,
  );
}

async function writeSvelteInteractivePage(rootDir: string, relativePath: string): Promise<void> {
  await mkdir(join(rootDir, relativePath, ".."), { recursive: true });
  await writeFile(
    join(rootDir, relativePath),
    `<script>
  let count = $state(0);
</script>
<main><button type="button" onclick={() => count += 1}>count: {count}</button></main>
`,
  );
}
