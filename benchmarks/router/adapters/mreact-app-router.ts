// mreact-app-router adapter。同一 shape (1000 spans) の fixture app を
// `buildApp()` → `startServer()` で立て、HTTP fetch で SSR / streaming を測る。
// HTTP 越し計測にすることで、後述の Next.js adapter (`getRequestHandler` を
// http.Server に乗せる) と round-trip overhead が揃い fair comparison になる。
import { gzipSync } from "node:zlib";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildApp,
  startServer,
} from "../../../packages/router/dist/index.js";
import type { AppRouterLogEvent, AppRouterLogger } from "../../../packages/router/dist/index.js";
import type { AppFrameworkAdapter } from "../types.js";
import { buildDynamicAttrCells, type DynamicAttrCell } from "../dynamic-attr-cells.js";

void {} as DynamicAttrCell;

interface ServerHandle {
  close(): Promise<void>;
  url: string;
}

let rootDir: string | undefined;
let server: ServerHandle | undefined;
let currentNodeCount = 0;
let currentLogEnabled = false;
let logEventCount = 0;
const NODE_COUNT_DEFAULT = 1000;

async function ensureFixture(
  nodeCount: number,
  logEnabled: boolean,
): Promise<string> {
  if (
    rootDir !== undefined &&
    currentNodeCount === nodeCount &&
    currentLogEnabled === logEnabled &&
    server !== undefined
  ) {
    return server.url;
  }

  if (server !== undefined) {
    await server.close();
    server = undefined;
  }

  if (rootDir !== undefined) {
    await rm(rootDir, { force: true, recursive: true });
  }

  rootDir = await mkdtemp(join(tmpdir(), "mreact-app-bench-"));
  const appDir = join(rootDir, "app");
  const outDir = join(rootDir, ".mreact");
  await mkdir(join(appDir, "stream-page"), { recursive: true });

  const items = Array.from({ length: nodeCount }, (_, index) => index);
  const arrayLiteral = `[${items.join(",")}]`;

  await writeFile(
    join(appDir, "layout.tsx"),
    `export default function Layout() {
  return <html lang="en"><body><Slot /></body></html>;
}`,
  );

  await writeFile(
    join(appDir, "page.tsx"),
    `const items = ${arrayLiteral};
export default function Page() {
  return <main>{items.map((index) => <span key={index}>{index}</span>)}</main>;
}`,
  );

  await writeFile(
    join(appDir, "stream-page", "page.tsx"),
    `export const stream = true;
const items = ${arrayLiteral};
export default function Page() {
  return <main>{items.map((index) => <span key={index}>{index}</span>)}</main>;
}`,
  );

  await mkdir(join(appDir, "real-stream-page"), { recursive: true });
  await writeFile(
    join(appDir, "real-stream-page", "page.tsx"),
    `export const stream = true;
const items = ${arrayLiteral};
function fetchItems() {
  return new Promise((resolve) => setTimeout(() => resolve(items), 50));
}
export default function Page() {
  const items_promise = fetchItems();
  return (
    <main>
      <Await value={items_promise} placeholder={<p>loading</p>}>
        {(data) => <ul>{data.map((index) => <span key={index}>{index}</span>)}</ul>}
      </Await>
    </main>
  );
}`,
  );

  // waterfall fixture: two independent async boundaries (each 50ms). A
  // framework that runs them in **parallel** finishes in ~50ms; one that
  // runs them **sequentially** (= waterfall) takes ~100ms.
  await mkdir(join(appDir, "waterfall-page"), { recursive: true });
  await writeFile(
    join(appDir, "waterfall-page", "page.tsx"),
    `export const stream = true;
function fetchA() {
  return new Promise((resolve) => setTimeout(() => resolve("A"), 50));
}
function fetchB() {
  return new Promise((resolve) => setTimeout(() => resolve("B"), 50));
}
export default function Page() {
  const a_promise = fetchA();
  const b_promise = fetchB();
  return (
    <main>
      <Await value={a_promise} placeholder={<p>loadingA</p>}>
        {(a) => <section data-a={a}>A:{a}</section>}
      </Await>
      <Await value={b_promise} placeholder={<p>loadingB</p>}>
        {(b) => <section data-b={b}>B:{b}</section>}
      </Await>
    </main>
  );
}`,
  );

  // dynamic-attribute heavy fixture: 200 cells × ~9 dynamic attrs/styles.
  // Several string values contain `<` `>` `&` `"` forcing HTML escape paths.
  // Exercises framework's per-attribute escape hot path (mreact compiler の
  // batch escape lowering 等の効果が見える case)。
  await mkdir(join(appDir, "data-grid"), { recursive: true });
  const cells = buildDynamicAttrCells(200);
  const cellsLiteral = JSON.stringify(cells);
  await writeFile(
    join(appDir, "data-grid", "page.tsx"),
    `const cells = ${cellsLiteral};
export default function Page() {
  return (
    <main>
      {cells.map((cell, i) => (
        <div
          key={i}
          class={"cell row-" + cell.row + " col-" + cell.col + " kind-" + cell.kind}
          data-row={cell.row}
          data-col={cell.col}
          data-kind={cell.kind}
          title={cell.title}
          aria-label={cell.label}
          style={{ "background-color": cell.bg, color: cell.fg }}
        >
          {cell.text}
        </div>
      ))}
    </main>
  );
}`,
  );

  await buildApp({ appDir, outDir });
  // Allow flipping the response sink strategy per bench run, e.g.
  //   MREACT_APP_ROUTER_SINK_STRATEGY=buffer pnpm bench:router
  const envStrategy = process.env["MREACT_APP_ROUTER_SINK_STRATEGY"];
  const sinkStrategy = envStrategy === "buffer" ? ("buffer" as const) : ("string" as const);
  server = await startServer({
    logger: logEnabled ? createBenchmarkLogger() : undefined,
    outDir,
    port: 0,
    sinkStrategy,
  });
  currentNodeCount = nodeCount;
  currentLogEnabled = logEnabled;
  return server.url;
}

function createMreactAppRouterAdapter(options: {
  logEnabled: boolean;
  name: AppFrameworkAdapter["name"];
}): AppFrameworkAdapter {
  const { logEnabled, name } = options;

  return {
    name,
    version: "workspace",
    async setup() {
      // fixture is built lazily on first call
    },
    getServerUrl(): string | null {
      return server?.url ?? null;
    },
    async teardown() {
      if (server !== undefined) {
        await server.close();
        server = undefined;
      }
      if (rootDir !== undefined) {
        await rm(rootDir, { force: true, recursive: true });
        rootDir = undefined;
        currentNodeCount = 0;
        currentLogEnabled = false;
      }
    },
    async renderToString(nodeCount: number): Promise<string> {
      const url = await ensureFixture(nodeCount, logEnabled);
      const response = await fetch(`${url}/`);
      const html = await response.text();

      if (!html.includes(`<span>${nodeCount - 1}</span>`)) {
        throw new Error("mreact-app-router renderToString did not include the last node");
      }

      return html;
    },
    async renderToStream(nodeCount: number): Promise<string> {
      const url = await ensureFixture(nodeCount, logEnabled);
      const response = await fetch(`${url}/stream-page`);
      const html = await response.text();

      if (!html.includes(`<span>${nodeCount - 1}</span>`)) {
        throw new Error("mreact-app-router renderToStream did not include the last node");
      }

      return html;
    },
    async renderToRealStream(nodeCount: number): Promise<string> {
      const url = await ensureFixture(nodeCount, logEnabled);
      const response = await fetch(`${url}/real-stream-page`);
      const html = await response.text();
      if (!html.includes(`<span>${nodeCount - 1}</span>`)) {
        throw new Error("mreact-app-router renderToRealStream did not include the last node");
      }
      return html;
    },
    async renderWaterfall(): Promise<string> {
      const url = await ensureFixture(NODE_COUNT_DEFAULT, logEnabled);
      const response = await fetch(`${url}/waterfall-page`);
      const html = await response.text();
      if (!html.includes(`data-a="A"`) || !html.includes(`data-b="B"`)) {
        throw new Error("mreact-app-router renderWaterfall did not include both branches");
      }
      return html;
    },
    async renderDynamicAttrGrid(cellCount: number): Promise<string> {
      const url = await ensureFixture(1000, logEnabled);
      const response = await fetch(`${url}/data-grid`);
      const html = await response.text();
      // Sanity check: last cell index must appear in escaped text.
      if (!html.includes(`Item #${cellCount - 1} &lt;data`)) {
        throw new Error("mreact-app-router renderDynamicAttrGrid did not include the last escaped text");
      }
      return html;
    },
    async measureServerOnlyClientBundleBytes(): Promise<number> {
      // mreact emits **no client bundle** for routes without `cell` / `onClick`
      // / `window` / `document` / `localStorage`. The 1000-span fixture is
      // pure server-render → manifest entry has `client: false` → no script
      // emitted. Total bytes shipped to browser = 0.
      return 0;
    },
    async measureInteractiveClientBundleBytes(): Promise<number> {
      return measureInteractiveBundle({ clientNavigation: true });
    },
    async measureInteractiveClientBundleMinimalBytes(): Promise<number> {
      // Same component but opting out of the SPA navigation runtime via
      // `export const clientNavigation = false` (issue 058). Represents the
      // minimum framework surface for an interactive page that does not need
      // SPA navigation / link prefetch — equivalent posture to Marko Run's
      // default (no navigation runtime).
      return measureInteractiveBundle({ clientNavigation: false });
    },
  };
}

function createBenchmarkLogger(): AppRouterLogger {
  const onEvent = (event: AppRouterLogEvent): void => {
    logEventCount += event.type.length;
  };

  return {
    error: onEvent,
    info: onEvent,
  };
}

export const mreactAppRouterAdapter = createMreactAppRouterAdapter({
  logEnabled: false,
  name: "mreact-app-router",
});

export const mreactAppRouterLogEnabledAdapter = createMreactAppRouterAdapter({
  logEnabled: true,
  name: "mreact-app-router+log enabled",
});

async function measureInteractiveBundle(options: {
  clientNavigation: boolean;
}): Promise<number> {
  const interactiveDir = await mkdtemp(join(tmpdir(), "mreact-app-bench-client-"));
  const interactiveApp = join(interactiveDir, "app");
  const interactiveOut = join(interactiveDir, ".mreact");

  try {
    await mkdir(interactiveApp, { recursive: true });
    await writeFile(
      join(interactiveApp, "layout.tsx"),
      `export default function Layout() {
  return <html lang="en"><body><Slot /></body></html>;
}`,
    );
    const hint = options.clientNavigation
      ? ""
      : `export const clientNavigation = false;\n`;
    await writeFile(
      join(interactiveApp, "page.tsx"),
      `import { cell } from "@reckona/mreact-reactive-core";
${hint}export default function Page() {
  const count = cell(0);
  return <main><button type="button" onClick={() => count.set(value => value + 1)}>{count.get()}</button></main>;
}`,
    );

    await buildApp({ appDir: interactiveApp, outDir: interactiveOut });
    const manifestRaw = await readFile(
      join(interactiveOut, "client", "manifest.json"),
      "utf8",
    );
    const manifest = JSON.parse(manifestRaw) as {
      routes: Array<{ client: boolean; script?: string; bytes?: number }>;
    };
    const clientRoute = manifest.routes.find(
      (entry) => entry.client === true && entry.script !== undefined,
    );

    if (clientRoute === undefined || clientRoute.script === undefined) {
      throw new Error("mreact-app-router fixture has no client route");
    }

    const code = await readFile(join(interactiveOut, "client", clientRoute.script));
    return gzipSync(code).length;
  } finally {
    await rm(interactiveDir, { force: true, recursive: true });
  }
}
