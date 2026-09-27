import { createServer, type Server } from "node:http";
import { readFile, rm } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import { collectBenchmarkEnvironment } from "../shared/env.js";
import { formatBenchmarkMarkdown } from "../shared/report.js";
import { createDatedResultsDir, writeJsonFile, writeTextFile } from "../shared/results.js";
import { summarizeSamples } from "../shared/stats.js";
import type { BenchmarkRow } from "../shared/types.js";
import type { PrimitiveBrowserFramework } from "./cases.js";
import {
  primitiveBrowserCases,
  primitiveBrowserFrameworks,
} from "./cases.js";
import { createBrowserFixture } from "./fixture.js";

async function runBenchmark(): Promise<void> {
  const browserWarmupRuns = parseNonNegativeInteger(
    process.env.MREACT_PRIMITIVE_BROWSER_WARMUP_RUNS ?? "5",
    "MREACT_PRIMITIVE_BROWSER_WARMUP_RUNS",
  );
  const browserMeasuredRuns = parseNonNegativeInteger(
    process.env.MREACT_PRIMITIVE_BROWSER_MEASURED_RUNS ?? "15",
    "MREACT_PRIMITIVE_BROWSER_MEASURED_RUNS",
  );
  const supportedFrameworks = primitiveBrowserFrameworks.filter(
    (framework): framework is Exclude<PrimitiveBrowserFramework, "marko"> => framework !== "marko",
  );
  const fixtures = new Map<Exclude<PrimitiveBrowserFramework, "marko">, {
    fixture: Awaited<ReturnType<typeof createBrowserFixture>>;
    server: Awaited<ReturnType<typeof serveDirectory>>;
  }>();
  const rows: BenchmarkRow[] = [];
  const trials: Array<{
    methodologyVersion: 2;
    framework: string;
    caseName: string;
    round: number;
    position: number;
    status: "completed" | "failed";
    browserVersion?: string;
    value?: number;
    error?: string;
  }> = [];
  try {
    for (const framework of supportedFrameworks) {
      const fixture = await createBrowserFixture(browserEntrySource(framework));
      try {
        const server = await serveDirectory(fixture.outDir);
        fixtures.set(framework, { fixture, server });
      } catch (error) {
        await rm(fixture.rootDir, { force: true, recursive: true });
        throw error;
      }
    }

    for (const benchmarkCase of primitiveBrowserCases) {
      const samplesByFramework = new Map<string, number[]>();
      const errorsByFramework = new Map<string, string>();
      for (let round = 0; round < browserMeasuredRuns; round += 1) {
        const frameworks = rotateFrameworksForRound(supportedFrameworks, round);
        for (const [position, framework] of frameworks.entries()) {
          if (errorsByFramework.has(framework)) continue;
          const prepared = fixtures.get(framework);
          if (prepared === undefined) throw new Error(`Missing fixture for ${framework}`);
          const trial = await measurePrimitiveBrowserTrial({
            url: prepared.server.url,
            framework,
            caseName: benchmarkCase.name,
            count: benchmarkCase.count,
            warmupRuns: browserWarmupRuns,
          });
          trials.push({
            methodologyVersion: 2,
            framework,
            caseName: benchmarkCase.name,
            round,
            position,
            ...trial,
          });
          if (trial.status === "failed") {
            errorsByFramework.set(framework, trial.error ?? "Unknown trial failure");
          } else if (trial.value !== undefined) {
            const samples = samplesByFramework.get(framework) ?? [];
            samples.push(trial.value);
            samplesByFramework.set(framework, samples);
          }
        }
      }

      for (const framework of primitiveBrowserFrameworks) {
        if (framework === "marko") {
          rows.push({
            suite: "primitive-browser",
            framework,
            version: "workspace",
            caseName: benchmarkCase.name,
            status: "unsupported",
            metric: "duration",
            unit: "ms",
            value: 0,
            notes: ["Marko's standalone browser primitive fixture requires the Marko client compiler/runtime integration; keep Marko covered by router browser probes until a stable standalone harness is added."],
          });
          continue;
        }
        const error = errorsByFramework.get(framework);
        const samples = samplesByFramework.get(framework) ?? [];
        const summary = error === undefined && samples.length > 0 ? summarizeSamples(samples) : undefined;
        const fixture = fixtures.get(framework)?.fixture;
        rows.push({
          suite: "primitive-browser",
          framework,
          version: "workspace",
          caseName: benchmarkCase.name,
          status: error === undefined && summary !== undefined ? "completed" : "failed",
          metric: "duration",
          unit: "ms",
          value: summary?.median ?? 0,
          summary,
          samples,
          notes: error === undefined ? [
            "methodology v2: hand-written primitive API, independent browser per measured trial, round-rotated order, forced GC between operations",
            `isolated primitive fixture entry gzip bytes (dependency chunks excluded): ${fixture?.entryGzipBytes}`,
            `fixture emitted JavaScript gzip bytes (entry plus every emitted chunk): ${fixture?.emittedJavaScriptGzipBytes}`,
          ] : [error],
        });
      }
    }
  } finally {
    for (const { fixture, server } of fixtures.values()) {
      await server.close();
      await rm(fixture.rootDir, { force: true, recursive: true });
    }
  }

const env = await collectBenchmarkEnvironment([
  "@reckona/mreact-compat",
  "@reckona/mreact-reactive-core",
  "@reckona/mreact-reactive-dom",
  "@playwright/test",
  "@builder.io/qwik",
  "@angular/core",
  "marko",
  "react",
  "react-dom",
  "solid-js",
  "svelte",
  "vue",
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
await writeJsonFile(join(dir, "primitive-browser.trials.json"), trials);
await writeTextFile(join(dir, "primitive-browser.md"), markdown);

console.log(markdown);

if (rows.some((row) => row.status === "failed")) {
  process.exitCode = 1;
}

}

async function measurePrimitiveBrowserTrial(options: {
  url: string;
  framework: string;
  caseName: string;
  count: number;
  warmupRuns: number;
}): Promise<{
  status: "completed" | "failed";
  browserVersion?: string;
  value?: number;
  error?: string;
}> {
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  const diagnostics: string[] = [];
  try {
    browser = await chromium.launch({ args: ["--js-flags=--expose-gc"], headless: true });
    const browserVersion = browser.version();
    const page = await browser.newPage();
    page.on("console", (message) => diagnostics.push(`[console:${message.type()}] ${message.text()}`));
    page.on("pageerror", (error) => diagnostics.push(`[pageerror] ${error.stack ?? error.message}`));
    page.on("requestfailed", (request) => diagnostics.push(`[requestfailed] ${request.url()} ${request.failure()?.errorText ?? ""}`));
    page.on("response", (response) => {
      if (response.status() >= 400) diagnostics.push(`[response:${response.status()}] ${response.url()}`);
    });
    await page.goto(options.url, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => typeof (globalThis as { __mreactPrimitiveBrowserBench?: unknown }).__mreactPrimitiveBrowserBench === "object");
    const samples = await page.evaluate(primitiveBrowserMeasurementExpression({
      caseName: options.caseName,
      count: options.count,
      framework: options.framework,
      measuredRuns: 1,
      warmupRuns: options.warmupRuns,
    })) as number[];
    if (samples.length !== 1 || !Number.isFinite(samples[0])) throw new Error("Expected one finite browser sample");
    if (diagnostics.length > 0) throw new Error(diagnostics.join("\n"));
    return { status: "completed", browserVersion, value: samples[0] };
  } catch (error) {
    return { status: "failed", error: `${error instanceof Error ? error.message : String(error)}${diagnostics.length > 0 ? `\n${diagnostics.join("\n")}` : ""}` };
  } finally {
    await browser?.close();
  }
}

function primitiveBrowserMeasurementExpression(options: {
  caseName: string;
  count: number;
  framework: string;
  measuredRuns: number;
  warmupRuns: number;
}): string {
  const serializedOptions = JSON.stringify(options).replaceAll("<", "\\u003c");

  return `(() => {
    const options = ${serializedOptions};
    return (async () => {
      const api = globalThis.__mreactPrimitiveBrowserBench;

      if (api === undefined) {
        throw new Error("primitive browser benchmark API is not installed");
      }

      const settle = async () => {
        globalThis.gc?.();
        await new Promise((resolve) => {
          const requestIdle = globalThis.requestIdleCallback;

          if (requestIdle === undefined) {
            setTimeout(resolve, 0);
            return;
          }

          requestIdle(resolve, { timeout: 50 });
        });
      };

      for (let index = 0; index < options.warmupRuns; index += 1) {
        await api.run(options.framework, options.caseName, options.count);
        await settle();
      }

      const measured = [];
      for (let index = 0; index < options.measuredRuns; index += 1) {
        await settle();
        measured.push(await api.run(options.framework, options.caseName, options.count));
        await settle();
      }
      return measured;
    })();
  })()`;
}

export function browserEntrySource(framework: Exclude<PrimitiveBrowserFramework, "marko">): string {
  const source = String.raw`
import "zone.js";
import "@angular/compiler";
import { batch, cell, effect } from "@reckona/mreact-reactive-core";
import { flushEffects } from "@reckona/mreact-reactive-core/testing";
import { bindEvent, bindList, bindText } from "@reckona/mreact-reactive-dom";
import { bindCapturedEvent as bindInternalCapturedEvent } from "@reckona/mreact-reactive-dom/internal";
import { Fragment, createElement, createRoot, flushSync, useState } from "@reckona/mreact-compat";
import { ApplicationRef as AngularApplicationRef, ChangeDetectionStrategy as AngularChangeDetectionStrategy, Component as AngularComponent, createComponent as angularCreateComponent, signal as angularSignal } from "@angular/core";
import { createApplication as angularCreateApplication } from "@angular/platform-browser";
import { Fragment as ReactFragment, createElement as reactCreateElement, useState as reactUseState } from "react";
import { flushSync as reactDomFlushSync } from "react-dom";
import { createRoot as createReactRoot } from "react-dom/client";
import { createComputed as solidCreateComputed, createRoot as createSolidRoot, createSignal as createSolidSignal, mapArray as solidMapArray } from "solid-js";
import { flushSync as svelteFlushSync, mount as svelteMount, unmount as svelteUnmount } from "svelte";
import { Fragment as VueFragment, createApp as createVueApp, h as vueH, nextTick as vueNextTick, ref as vueRef } from "vue";
import { Fragment as QwikFragment, jsx as qwikJsx, render as qwikRender } from "@builder.io/qwik";
import SvelteRows from "./svelte/Rows.mjs";

void bindInternalCapturedEvent;

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

async function runVue(caseName, count) {
  const rows = createRowsData(count);

  if (caseName === "browser create 1k rows") {
    const host = createHost();
    const start = performance.now();
    const mounted = mountVueRows(host, rows);
    await vueNextTick();
    const duration = performance.now() - start;
    try {
      validateRows(host, rows);
      return duration;
    } finally {
      mounted.app.unmount();
    }
  }

  const host = createHost();
  const mounted = mountVueRows(host, rows);

  try {
    await vueNextTick();
    validateRows(host, rows);

    if (caseName === "browser update every 10th in 10k rows") {
      const updatedRows = rows.map((row, index) =>
        index % 10 === 0 ? { ...row, label: row.label + " updated" } : row,
      );
      const start = performance.now();
      mounted.rows.value = updatedRows;
      await vueNextTick();
      const duration = performance.now() - start;
      validateRows(host, updatedRows);
      return duration;
    }

    if (caseName === "browser select row in 10k rows") {
      const selectedId = Math.floor(count / 2);
      const start = performance.now();
      mounted.selectedId.value = selectedId;
      await vueNextTick();
      const duration = performance.now() - start;
      validateSelectedRow(host, selectedId);
      return duration;
    }

    if (caseName === "browser clear 10k rows") {
      const start = performance.now();
      mounted.rows.value = [];
      await vueNextTick();
      const duration = performance.now() - start;
      validateRows(host, []);
      return duration;
    }

    throw new Error("unknown vue browser case " + caseName);
  } finally {
    mounted.app.unmount();
  }
}

function mountVueRows(host, initialRows) {
  const rows = vueRef(initialRows);
  const selectedId = vueRef(-1);
  const app = createVueApp({
    render() {
      return vueH(
        VueFragment,
        null,
        rows.value.map((row) =>
          vueH(
            "div",
            {
              class: selectedId.value === row.id ? "selected" : undefined,
              "data-key": row.id,
              "data-selected": selectedId.value === row.id ? "true" : undefined,
              key: row.id,
            },
            row.label,
          ),
        ),
      );
    },
  });
  app.mount(host);
  return { app, rows, selectedId };
}

async function runSvelte(caseName, count) {
  const rows = createRowsData(count);

  if (caseName === "browser create 1k rows") {
    const host = createHost();
    const start = performance.now();
    const instance = svelteMount(SvelteRows, { target: host, props: { rows } });
    const duration = performance.now() - start;
    try {
      validateRows(host, rows);
      return duration;
    } finally {
      await svelteUnmount(instance);
    }
  }

  const host = createHost();
  const instance = svelteMount(SvelteRows, { target: host, props: { rows } });

  try {
    validateRows(host, rows);

    if (caseName === "browser update every 10th in 10k rows") {
      const updatedRows = rows.map((row, index) =>
        index % 10 === 0 ? { ...row, label: row.label + " updated" } : row,
      );
      const start = performance.now();
      svelteFlushSync(() => instance.setRows(updatedRows));
      const duration = performance.now() - start;
      validateRows(host, updatedRows);
      return duration;
    }

    if (caseName === "browser select row in 10k rows") {
      const selectedId = Math.floor(count / 2);
      const start = performance.now();
      svelteFlushSync(() => instance.setSelectedId(selectedId));
      const duration = performance.now() - start;
      validateSelectedRow(host, selectedId);
      return duration;
    }

    if (caseName === "browser clear 10k rows") {
      const start = performance.now();
      svelteFlushSync(() => instance.setRows([]));
      const duration = performance.now() - start;
      validateRows(host, []);
      return duration;
    }

    throw new Error("unknown svelte browser case " + caseName);
  } finally {
    await svelteUnmount(instance);
  }
}

class AngularRowsComponent {
  rows = angularSignal([]);
  selectedId = angularSignal(-1);
}

AngularComponent({
  changeDetection: AngularChangeDetectionStrategy.OnPush,
  standalone: true,
  template: '@for (row of rows(); track row.id) {<div [attr.data-key]="row.id" [class.selected]="selectedId() === row.id" [attr.data-selected]="selectedId() === row.id ? true : null">{{ row.label }}</div>}',
})(AngularRowsComponent);

async function runAngular(caseName, count) {
  const rows = createRowsData(count);

  if (caseName === "browser create 1k rows") {
    const host = createHost();
    const start = performance.now();
    const mounted = await mountAngularRows(host, rows);
    const duration = performance.now() - start;
    try {
      validateRows(host, rows);
      return duration;
    } finally {
      destroyAngularRowsMount(mounted);
    }
  }

  const host = createHost();
  const mounted = await mountAngularRows(host, rows);

  try {
    validateRows(host, rows);

    if (caseName === "browser update every 10th in 10k rows") {
      const updatedRows = rows.map((row, index) =>
        index % 10 === 0 ? { ...row, label: row.label + " updated" } : row,
      );
      const start = performance.now();
      mounted.ref.instance.rows.set(updatedRows);
      mounted.ref.changeDetectorRef.detectChanges();
      const duration = performance.now() - start;
      validateRows(host, updatedRows);
      return duration;
    }

    if (caseName === "browser select row in 10k rows") {
      const selectedId = Math.floor(count / 2);
      const start = performance.now();
      mounted.ref.instance.selectedId.set(selectedId);
      mounted.ref.changeDetectorRef.detectChanges();
      const duration = performance.now() - start;
      validateSelectedRow(host, selectedId);
      return duration;
    }

    if (caseName === "browser clear 10k rows") {
      const start = performance.now();
      mounted.ref.instance.rows.set([]);
      mounted.ref.changeDetectorRef.detectChanges();
      const duration = performance.now() - start;
      validateRows(host, []);
      return duration;
    }

    throw new Error("unknown angular browser case " + caseName);
  } finally {
    destroyAngularRowsMount(mounted);
  }
}

async function mountAngularRows(host, rows) {
  const app = await angularCreateApplication({ providers: [] });
  const ref = angularCreateComponent(AngularRowsComponent, {
    environmentInjector: app.injector,
    hostElement: host,
  });
  ref.instance.rows.set(rows);
  app.injector.get(AngularApplicationRef).attachView(ref.hostView);
  ref.changeDetectorRef.detectChanges();
  return { app, ref };
}

function destroyAngularRowsMount(mounted) {
  mounted.ref.destroy();
  mounted.app.destroy();
}

async function runQwik(caseName, count) {
  const host = createHost();
  const rows = createRowsData(count);
  let result;

  try {
    if (caseName === "browser create 1k rows") {
      const start = performance.now();
      result = await qwikRender(host, qwikRows(rows));
      const duration = performance.now() - start;
      validateRows(host, rows);
      return duration;
    }

    result = await qwikRender(host, qwikRows(rows));
    validateRows(host, rows);

    if (caseName === "browser update every 10th in 10k rows") {
      const updatedRows = rows.map((row, index) =>
        index % 10 === 0 ? { ...row, label: row.label + " updated" } : row,
      );
      const start = performance.now();
      await qwikRender(host, qwikRows(updatedRows));
      const duration = performance.now() - start;
      validateRows(host, updatedRows);
      return duration;
    }

    if (caseName === "browser select row in 10k rows") {
      const selectedId = Math.floor(count / 2);
      const start = performance.now();
      await qwikRender(host, qwikRows(rows, selectedId));
      const duration = performance.now() - start;
      validateSelectedRow(host, selectedId);
      return duration;
    }

    if (caseName === "browser clear 10k rows") {
      const start = performance.now();
      await qwikRender(host, qwikRows([]));
      const duration = performance.now() - start;
      validateRows(host, []);
      return duration;
    }

    throw new Error("unknown qwik browser case " + caseName);
  } finally {
    result?.cleanup();
  }
}

function qwikRows(rows, selectedId = -1) {
  return qwikJsx(
    QwikFragment,
    {
      children: rows.map((row) =>
        qwikJsx(
          "div",
          {
            class: selectedId === row.id ? "selected" : undefined,
            "data-key": row.id,
            "data-selected": selectedId === row.id ? "true" : undefined,
            children: row.label,
          },
          row.id,
        ),
      ),
    },
    null,
  );
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
    if (framework === "vue") {
      return await runVue(caseName, count);
    }
    if (framework === "svelte") {
      return await runSvelte(caseName, count);
    }
    if (framework === "angular") {
      return await runAngular(caseName, count);
    }
    if (framework === "qwik") {
      return await runQwik(caseName, count);
    }
    throw new Error("unknown primitive browser framework " + framework);
  },
};
`;
  const sectionNames = [
    "function compatRows(",
    "async function runMreact(",
    "async function runCompat(",
    "async function runReact(",
    "async function runSolid(",
    "async function runVue(",
    "async function runSvelte(",
    "class AngularRowsComponent",
    "async function runQwik(",
    "globalThis.__mreactPrimitiveBrowserBench =",
  ];
  const boundaries = sectionNames.map((name) => {
    const index = source.indexOf(name);
    if (index < 0) throw new Error(`Missing primitive-browser entry section: ${name}`);
    return index;
  });
  const sections = boundaries.slice(0, -1).map((start, index) =>
    source.slice(start, boundaries[index + 1]),
  );
  const sourceSections: Record<Exclude<PrimitiveBrowserFramework, "marko">, number[]> = {
    mreact: [1],
    "mreact react-compat": [0, 2],
    react: [3],
    solid: [4],
    vue: [5],
    svelte: [6],
    angular: [7],
    qwik: [8],
  };
  const entryModules: Record<Exclude<PrimitiveBrowserFramework, "marko">, string[]> = {
    mreact: ["@reckona/mreact-reactive-core", "@reckona/mreact-reactive-core/testing", "@reckona/mreact-reactive-dom", "@reckona/mreact-reactive-dom/internal"],
    "mreact react-compat": ["@reckona/mreact-compat"],
    react: ["react", "react-dom", "react-dom/client"],
    solid: ["solid-js"],
    vue: ["vue"],
    svelte: ["svelte", "./svelte/Rows.mjs"],
    angular: ["zone.js", "@angular/compiler", "@angular/core", "@angular/platform-browser"],
    qwik: ["@builder.io/qwik"],
  };
  const runnerNames: Record<Exclude<PrimitiveBrowserFramework, "marko">, string> = {
    mreact: "runMreact",
    "mreact react-compat": "runCompat",
    react: "runReact",
    solid: "runSolid",
    vue: "runVue",
    svelte: "runSvelte",
    angular: "runAngular",
    qwik: "runQwik",
  };
  const allowedModules = new Set(entryModules[framework]);
  const common = source.slice(0, boundaries[0]).split("\n").filter((line) => {
    const imported = line.match(/^import (?:.* from )?"([^"]+)";/u);
    return imported === null || allowedModules.has(imported[1]);
  }).join("\n").replace("void bindInternalCapturedEvent;", framework === "mreact" ? "void bindInternalCapturedEvent;" : "");
  return `${common}\n${sourceSections[framework].map((index) => sections[index]).join("\n")}\nglobalThis.__mreactPrimitiveBrowserBench = {
  async run(selected, caseName, count) {
    if (selected !== ${JSON.stringify(framework)}) throw new Error("wrong framework " + selected);
    return await ${runnerNames[framework]}(caseName, count);
  },
};\n`;
}

export function rotateFrameworksForRound<T>(frameworks: readonly T[], round: number): T[] {
  if (frameworks.length === 0) return [];
  const offset = round % frameworks.length;
  return [...frameworks.slice(offset), ...frameworks.slice(0, offset)];
}

async function serveDirectory(rootDir: string): Promise<{ close(): Promise<void>; url: string }> {
  const server = createServer(async (request, response) => {
    try {
      const pathname = new URL(request.url ?? "/", "http://local.test").pathname;
      const filePath = safeStaticPath(rootDir, pathname);
      const body = await readFile(filePath);
	      response.statusCode = 200;
	      response.setHeader("content-type", contentType(filePath));
	      response.setHeader("cross-origin-opener-policy", "same-origin");
	      response.setHeader("cross-origin-embedder-policy", "require-corp");
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

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await runBenchmark();
}
