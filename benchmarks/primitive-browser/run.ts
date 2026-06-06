import { createServer, type Server } from "node:http";
import { createRequire } from "node:module";
import { gzipSync } from "node:zlib";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join, normalize } from "node:path";
import { chromium } from "@playwright/test";
import { build as viteBuild } from "vite";
import { collectBenchmarkEnvironment } from "../shared/env.js";
import { formatBenchmarkMarkdown } from "../shared/report.js";
import { createDatedResultsDir, writeJsonFile, writeTextFile } from "../shared/results.js";
import { summarizeSamples } from "../shared/stats.js";
import type { BenchmarkRow } from "../shared/types.js";
import {
  primitiveBrowserCases,
  primitiveBrowserFrameworks,
} from "./cases.js";

const requireFromHere = createRequire(import.meta.url);
const browserWarmupRuns = parseNonNegativeInteger(
  process.env.MREACT_PRIMITIVE_BROWSER_WARMUP_RUNS ?? "2",
  "MREACT_PRIMITIVE_BROWSER_WARMUP_RUNS",
);
const browserMeasuredRuns = parseNonNegativeInteger(
  process.env.MREACT_PRIMITIVE_BROWSER_MEASURED_RUNS ?? "7",
  "MREACT_PRIMITIVE_BROWSER_MEASURED_RUNS",
);

const fixture = await createBrowserFixture();
const server = await serveDirectory(fixture.outDir);
const browser = await chromium.launch({ headless: true });
const rows: BenchmarkRow[] = [];

try {
  const page = await browser.newPage();
  await page.goto(server.url, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => {
    return typeof (globalThis as { __mreactPrimitiveBrowserBench?: unknown })
      .__mreactPrimitiveBrowserBench === "object";
  });

  for (const benchmarkCase of primitiveBrowserCases) {
    for (const framework of primitiveBrowserFrameworks) {
      try {
        const samples = await page.evaluate(
          async (options) => {
            const api = (globalThis as {
              __mreactPrimitiveBrowserBench?: {
                run: (
                  framework: string,
                  caseName: string,
                  count: number,
                ) => Promise<number>;
              };
            }).__mreactPrimitiveBrowserBench;

            if (api === undefined) {
              throw new Error("primitive browser benchmark API is not installed");
            }

            for (let index = 0; index < options.warmupRuns; index += 1) {
              await api.run(options.framework, options.caseName, options.count);
            }

            const measured: number[] = [];
            for (let index = 0; index < options.measuredRuns; index += 1) {
              measured.push(await api.run(options.framework, options.caseName, options.count));
            }
            return measured;
          },
          {
            caseName: benchmarkCase.name,
            count: benchmarkCase.count,
            framework,
            measuredRuns: browserMeasuredRuns,
            warmupRuns: browserWarmupRuns,
          },
        );
        const summary = summarizeSamples(samples);

        rows.push({
          suite: "primitive-browser",
          framework,
          version: "workspace",
          caseName: benchmarkCase.name,
          status: "completed",
          metric: "duration",
          unit: "ms",
          value: summary.median,
          summary,
          samples,
          notes: [`bundle gzip bytes: ${fixture.gzipBytes}`],
        });
      } catch (error) {
        rows.push({
          suite: "primitive-browser",
          framework,
          version: "workspace",
          caseName: benchmarkCase.name,
          status: "failed",
          metric: "duration",
          unit: "ms",
          value: 0,
          notes: [error instanceof Error ? error.message : String(error)],
        });
      }
    }
  }
} finally {
  await browser.close();
  await server.close();
  await rm(fixture.rootDir, { force: true, recursive: true });
}

const env = await collectBenchmarkEnvironment([
  "@reckona/mreact-compat",
  "@reckona/mreact-reactive-core",
  "@reckona/mreact-reactive-dom",
  "@playwright/test",
  "react",
  "react-dom",
  "solid-js",
  "vite",
]);
const dir = await createDatedResultsDir();
const markdown = formatBenchmarkMarkdown("Primitive Browser Benchmark", env, rows, {
  caseDescriptions: Object.fromEntries(
    primitiveBrowserCases.map((benchmarkCase) => [
      benchmarkCase.name,
      benchmarkCase.description,
    ]),
  ),
});

await writeJsonFile(join(dir, "primitive-browser.summary.json"), rows);
await writeTextFile(join(dir, "primitive-browser.md"), markdown);

console.log(markdown);

if (rows.some((row) => row.status === "failed")) {
  process.exitCode = 1;
}

async function createBrowserFixture(): Promise<{
  gzipBytes: number;
  outDir: string;
  rootDir: string;
}> {
  const rootDir = await mkdtemp(join(tmpdir(), "mreact-primitive-browser-"));
  const outDir = join(rootDir, "dist");
  const sourceDir = join(rootDir, "src");
  await mkdir(sourceDir, { recursive: true });
  await writeFile(join(rootDir, "index.html"), `<main id="root"></main><script type="module" src="/src/bench.ts"></script>`);
  await writeFile(join(sourceDir, "bench.ts"), browserEntrySource());

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
          find: "@reckona/mreact-reactive-dom",
          replacement: join(process.cwd(), "packages/reactive-dom/dist/index.js"),
        },
        {
          find: "@reckona/mreact-compat",
          replacement: join(process.cwd(), "packages/react-compat/dist/index.js"),
        },
        {
          find: "react-dom/client",
          replacement: requireFromHere.resolve("react-dom/client"),
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
}

function browserEntrySource(): string {
  return String.raw`
import { batch, cell, effect } from "@reckona/mreact-reactive-core";
import { flushEffects } from "@reckona/mreact-reactive-core/testing";
import { bindEvent, bindList, bindText } from "@reckona/mreact-reactive-dom";
import { Fragment, createElement, createRoot, flushSync, useState } from "@reckona/mreact-compat";
import { Fragment as ReactFragment, createElement as reactCreateElement, useState as reactUseState } from "react";
import { flushSync as reactDomFlushSync } from "react-dom";
import { createRoot as createReactRoot } from "react-dom/client";
import { createComputed as solidCreateComputed, createRoot as createSolidRoot, createSignal as createSolidSignal, mapArray as solidMapArray } from "solid-js";

function createRowsData(count) {
  return Array.from({ length: count }, (_unused, index) => ({
    id: index,
    label: "Row " + index,
  }));
}

function validateRows(host, rows) {
  const children = Array.from(host.children);
  if (children.length !== rows.length) {
    throw new Error("expected " + rows.length + " rows, received " + children.length);
  }
  for (let index = 0; index < rows.length; index += 1) {
    const child = children[index];
    const row = rows[index];
    if (child.dataset.key !== String(row.id) || child.textContent !== row.label) {
      throw new Error("row " + index + " mismatch");
    }
  }
}

function validateSelectedRow(host, selectedId) {
  const selected = host.querySelectorAll("[data-selected=true]");
  if (selected.length !== 1) {
    throw new Error("expected one selected row, received " + selected.length);
  }
  if (selected[0].dataset.key !== String(selectedId)) {
    throw new Error("expected selected row " + selectedId);
  }
}

function createHost() {
  const root = document.getElementById("root");
  if (root === null) {
    throw new Error("missing root");
  }
  root.textContent = "";
  const host = document.createElement("div");
  root.append(host);
  return host;
}

function compatRows(rows, selectedId = -1) {
  return createElement(
    Fragment,
    null,
    rows.map((row) =>
      createElement(
        "div",
        {
          className: selectedId === row.id ? "selected" : undefined,
          "data-key": row.id,
          "data-selected": selectedId === row.id ? "true" : undefined,
          key: row.id,
        },
        row.label,
      ),
    ),
  );
}

async function runMreact(caseName, count) {
  if (caseName === "browser create 1k rows") {
    const host = createHost();
    const marker = document.createComment("rows");
    const rows = createRowsData(count);
    const rowsCell = cell(rows);
    host.append(marker);
    const start = performance.now();
    const dispose = bindList(host, marker, () => rowsCell.get(), (row) => {
      const element = document.createElement("div");
      element.dataset.key = String(row.id);
      element.textContent = row.label;
      return element;
    }, { key: (row) => row.id });
    try {
      await flushEffects();
      const duration = performance.now() - start;
      validateRows(host, rows);
      return duration;
    } finally {
      dispose();
    }
  }

  if (caseName === "browser update every 10th in 10k rows") {
    const host = createHost();
    const marker = document.createComment("rows");
    const rows = Array.from({ length: count }, (_unused, index) => ({
      id: index,
      label: cell("Row " + index),
    }));
    const rowsCell = cell(rows);
    const textDisposers = [];
    host.append(marker);
    const disposeList = bindList(host, marker, () => rowsCell.get(), (row) => {
      const element = document.createElement("div");
      const text = document.createTextNode("");
      element.dataset.key = String(row.id);
      element.append(text);
      textDisposers.push(bindText(text, () => row.label.get()));
      return element;
    }, { key: (row) => row.id });
    try {
      await flushEffects();
      const start = performance.now();
      batch(() => {
        for (let index = 0; index < rows.length; index += 10) {
          rows[index].label.set("Row " + index + " updated");
        }
      });
      await flushEffects();
      const duration = performance.now() - start;
      validateRows(host, rows.map((row) => ({ id: row.id, label: row.label.get() })));
      return duration;
    } finally {
      disposeList();
      for (const dispose of textDisposers) {
        dispose();
      }
    }
  }

  if (caseName === "browser select row in 10k rows") {
    const host = createHost();
    const marker = document.createComment("rows");
    const rows = createRowsData(count);
    const rowsCell = cell(rows);
    const selected = cell(-1);
    const rowElements = new Map();
    host.append(marker);
    const disposeList = bindList(host, marker, () => rowsCell.get(), (row) => {
      const element = document.createElement("div");
      element.dataset.key = String(row.id);
      element.textContent = row.label;
      rowElements.set(row.id, element);
      return element;
    }, { key: (row) => row.id });
    const disposeSelection = effect(() => {
      const next = selected.get();
      for (const element of rowElements.values()) {
        element.className = "";
        element.removeAttribute("data-selected");
      }
      const element = rowElements.get(next);
      if (element !== undefined) {
        element.className = "selected";
        element.dataset.selected = "true";
      }
    });
    try {
      await flushEffects();
      validateRows(host, rows);
      const selectedId = Math.floor(count / 2);
      const start = performance.now();
      selected.set(selectedId);
      await flushEffects();
      const duration = performance.now() - start;
      validateSelectedRow(host, selectedId);
      return duration;
    } finally {
      disposeSelection();
      disposeList();
    }
  }

  if (caseName === "browser clear 10k rows") {
    const host = createHost();
    const marker = document.createComment("rows");
    const rows = createRowsData(count);
    const rowsCell = cell(rows);
    host.append(marker);
    const dispose = bindList(host, marker, () => rowsCell.get(), (row) => {
      const element = document.createElement("div");
      element.dataset.key = String(row.id);
      element.textContent = row.label;
      return element;
    }, { key: (row) => row.id });
    try {
      await flushEffects();
      validateRows(host, rows);
      const start = performance.now();
      rowsCell.set([]);
      await flushEffects();
      const duration = performance.now() - start;
      validateRows(host, []);
      return duration;
    } finally {
      dispose();
    }
  }

  throw new Error("unknown mreact browser case " + caseName);
}

async function runCompat(caseName, count) {
  const host = createHost();
  const rows = createRowsData(count);
  const root = createRoot(host);

  try {
    if (caseName === "browser create 1k rows") {
      const start = performance.now();
      flushSync(() => root.render(compatRows(rows)));
      const duration = performance.now() - start;
      validateRows(host, rows);
      return duration;
    }

    if (caseName === "browser update every 10th in 10k rows") {
      const updatedRows = rows.map((row, index) =>
        index % 10 === 0 ? { ...row, label: row.label + " updated" } : row,
      );
      let setRows;
      function App() {
        const [currentRows, setCurrentRows] = useState(rows);
        setRows = setCurrentRows;
        return compatRows(currentRows);
      }
      flushSync(() => root.render(createElement(App)));
      validateRows(host, rows);
      const start = performance.now();
      flushSync(() => setRows(updatedRows));
      const duration = performance.now() - start;
      validateRows(host, updatedRows);
      return duration;
    }

    if (caseName === "browser select row in 10k rows") {
      const selectedId = Math.floor(count / 2);
      let setSelectedId;
      function App() {
        const [selected, setSelected] = useState(-1);
        setSelectedId = setSelected;
        return compatRows(rows, selected);
      }
      flushSync(() => root.render(createElement(App)));
      validateRows(host, rows);
      const start = performance.now();
      flushSync(() => setSelectedId(selectedId));
      const duration = performance.now() - start;
      validateSelectedRow(host, selectedId);
      return duration;
    }

    if (caseName === "browser clear 10k rows") {
      let setRows;
      function App() {
        const [currentRows, setCurrentRows] = useState(rows);
        setRows = setCurrentRows;
        return compatRows(currentRows);
      }
      flushSync(() => root.render(createElement(App)));
      validateRows(host, rows);
      const start = performance.now();
      flushSync(() => setRows([]));
      const duration = performance.now() - start;
      validateRows(host, []);
      return duration;
    }

    throw new Error("unknown react-compat browser case " + caseName);
  } finally {
    root.unmount();
  }
}

async function runReact(caseName, count) {
  const host = createHost();
  const rows = createRowsData(count);
  const root = createReactRoot(host);

  try {
    if (caseName === "browser create 1k rows") {
      const start = performance.now();
      reactDomFlushSync(() => root.render(reactRows(rows)));
      const duration = performance.now() - start;
      validateRows(host, rows);
      return duration;
    }

    if (caseName === "browser update every 10th in 10k rows") {
      const updatedRows = rows.map((row, index) =>
        index % 10 === 0 ? { ...row, label: row.label + " updated" } : row,
      );
      let setRows;
      function App() {
        const [currentRows, setCurrentRows] = reactUseState(rows);
        setRows = setCurrentRows;
        return reactRows(currentRows);
      }
      reactDomFlushSync(() => root.render(reactCreateElement(App)));
      validateRows(host, rows);
      const start = performance.now();
      reactDomFlushSync(() => setRows(updatedRows));
      const duration = performance.now() - start;
      validateRows(host, updatedRows);
      return duration;
    }

    if (caseName === "browser select row in 10k rows") {
      const selectedId = Math.floor(count / 2);
      let setSelectedId;
      function App() {
        const [selected, setSelected] = reactUseState(-1);
        setSelectedId = setSelected;
        return reactRows(rows, selected);
      }
      reactDomFlushSync(() => root.render(reactCreateElement(App)));
      validateRows(host, rows);
      const start = performance.now();
      reactDomFlushSync(() => setSelectedId(selectedId));
      const duration = performance.now() - start;
      validateSelectedRow(host, selectedId);
      return duration;
    }

    if (caseName === "browser clear 10k rows") {
      let setRows;
      function App() {
        const [currentRows, setCurrentRows] = reactUseState(rows);
        setRows = setCurrentRows;
        return reactRows(currentRows);
      }
      reactDomFlushSync(() => root.render(reactCreateElement(App)));
      validateRows(host, rows);
      const start = performance.now();
      reactDomFlushSync(() => setRows([]));
      const duration = performance.now() - start;
      validateRows(host, []);
      return duration;
    }

    throw new Error("unknown react browser case " + caseName);
  } finally {
    root.unmount();
  }
}

function reactRows(rows, selectedId = -1) {
  return reactCreateElement(
    ReactFragment,
    null,
    rows.map((row) =>
      reactCreateElement(
        "div",
        {
          className: selectedId === row.id ? "selected" : undefined,
          "data-key": row.id,
          "data-selected": selectedId === row.id ? "true" : undefined,
          key: row.id,
        },
        row.label,
      ),
    ),
  );
}

async function runSolid(caseName, count) {
  if (caseName === "browser create 1k rows") {
    const host = createHost();
    const rows = createRowsData(count);
    const start = performance.now();
    const root = createSolidRowsRoot(host, rows);
    const duration = performance.now() - start;
    try {
      validateRows(host, rows);
      return duration;
    } finally {
      root.dispose();
    }
  }

  if (caseName === "browser update every 10th in 10k rows") {
    const host = createHost();
    const rows = createRowsData(count);
    const updatedRows = rows.map((row, index) =>
      index % 10 === 0 ? { ...row, label: row.label + " updated" } : row,
    );
    const root = createSolidRowsRoot(host, rows);
    try {
      validateRows(host, rows);
      const start = performance.now();
      root.setRows(updatedRows);
      const duration = performance.now() - start;
      validateRows(host, updatedRows);
      return duration;
    } finally {
      root.dispose();
    }
  }

  if (caseName === "browser select row in 10k rows") {
    const host = createHost();
    const rows = createRowsData(count);
    const selectedId = Math.floor(count / 2);
    const root = createSolidSelectableRowsRoot(host, rows);
    try {
      validateRows(host, rows);
      const start = performance.now();
      root.setSelectedId(selectedId);
      const duration = performance.now() - start;
      validateSelectedRow(host, selectedId);
      return duration;
    } finally {
      root.dispose();
    }
  }

  if (caseName === "browser clear 10k rows") {
    const host = createHost();
    const rows = createRowsData(count);
    const root = createSolidRowsRoot(host, rows);
    try {
      validateRows(host, rows);
      const start = performance.now();
      root.setRows([]);
      const duration = performance.now() - start;
      validateRows(host, []);
      return duration;
    } finally {
      root.dispose();
    }
  }

  throw new Error("unknown solid browser case " + caseName);
}

function createSolidRowsRoot(host, initialRows) {
  return createSolidRoot((dispose) => {
    const [rows, setRows] = createSolidSignal(initialRows);
    const mappedRows = solidMapArray(rows, (row) => {
      const element = document.createElement("div");
      element.dataset.key = String(row.id);
      element.textContent = row.label;
      return element;
    });

    solidCreateComputed(() => {
      host.replaceChildren(...mappedRows());
    });

    return { dispose, setRows };
  });
}

function createSolidSelectableRowsRoot(host, initialRows) {
  return createSolidRoot((dispose) => {
    const [selectedId, setSelectedId] = createSolidSignal(-1);
    const rowElements = new Map();

    for (const row of initialRows) {
      const element = document.createElement("div");
      element.dataset.key = String(row.id);
      element.textContent = row.label;
      rowElements.set(row.id, element);
      host.append(element);
    }

    solidCreateComputed(() => {
      const nextSelectedId = selectedId();
      for (const element of rowElements.values()) {
        element.className = "";
        element.removeAttribute("data-selected");
      }
      const element = rowElements.get(nextSelectedId);
      if (element !== undefined) {
        element.className = "selected";
        element.dataset.selected = "true";
      }
    });

    return { dispose, setSelectedId };
  });
}

globalThis.__mreactPrimitiveBrowserBench = {
  async run(framework, caseName, count) {
    if (framework === "mreact") {
      return await runMreact(caseName, count);
    }
    if (framework === "mreact react-compat") {
      return await runCompat(caseName, count);
    }
    if (framework === "react") {
      return await runReact(caseName, count);
    }
    if (framework === "solid") {
      return await runSolid(caseName, count);
    }
    throw new Error("unknown primitive browser framework " + framework);
  },
};
`;
}

async function serveDirectory(rootDir: string): Promise<{ close(): Promise<void>; url: string }> {
  const server = createServer(async (request, response) => {
    try {
      const pathname = new URL(request.url ?? "/", "http://local.test").pathname;
      const filePath = safeStaticPath(rootDir, pathname);
      const body = await readFile(filePath);
      response.statusCode = 200;
      response.setHeader("content-type", contentType(filePath));
      response.end(body);
    } catch {
      response.statusCode = 404;
      response.end("Not Found");
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });

  const address = server.address();
  if (typeof address !== "object" || address === null) {
    throw new Error("primitive browser static server did not expose a TCP address");
  }

  return {
    url: `http://127.0.0.1:${address.port}/`,
    close: () => closeServer(server),
  };
}

function safeStaticPath(rootDir: string, pathname: string): string {
  const relativePath = pathname === "/" ? "index.html" : pathname.slice(1);
  const normalized = normalize(relativePath);

  if (normalized.startsWith("..")) {
    throw new Error("static path escaped root");
  }

  return join(rootDir, normalized);
}

function contentType(path: string): string {
  switch (extname(path)) {
    case ".html":
      return "text/html; charset=utf-8";
    case ".js":
      return "text/javascript; charset=utf-8";
    default:
      return "application/octet-stream";
  }
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => (error === undefined ? resolve() : reject(error)));
  });
}

function parseNonNegativeInteger(value: string, name: string): number {
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${name} must be a non-negative integer`);
  }

  return parsed;
}
