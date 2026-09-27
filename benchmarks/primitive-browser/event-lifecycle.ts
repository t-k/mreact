import { mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "@playwright/test";
import { build } from "vite";
import { collectBenchmarkEnvironment } from "../shared/env.js";
import { createDatedResultsDir, writeJsonFile } from "../shared/results.js";

const rowCount = readPositiveInteger("MREACT_EVENT_LIFECYCLE_ROWS", 10_000);
const rounds = readPositiveInteger("MREACT_EVENT_LIFECYCLE_ROUNDS", 3);
const source = `import { bindEvent } from "@reckona/mreact-reactive-dom";

window.__eventLifecycleBenchmark = async (mode, rowCount, diagnostics) => {
  const host = document.createElement("div");
  const detached = document.createDocumentFragment();
  const buttons = Array.from({ length: rowCount }, () => document.createElement("button"));
  if (mode === "connected") {
    host.append(...buttons);
    document.body.append(host);
  } else {
    detached.append(...buttons);
  }

  const listenerCounts = { elementAdds: 0, elementRemoves: 0, rootAdds: 0, rootRemoves: 0 };
  const originalAdd = EventTarget.prototype.addEventListener;
  const originalRemove = EventTarget.prototype.removeEventListener;
  if (diagnostics) {
    EventTarget.prototype.addEventListener = function(type, listener, options) {
      if (type === "click") {
        if (this === document) listenerCounts.rootAdds++;
        if (this instanceof HTMLButtonElement) listenerCounts.elementAdds++;
      }
      return originalAdd.call(this, type, listener, options);
    };
    EventTarget.prototype.removeEventListener = function(type, listener, options) {
      if (type === "click") {
        if (this === document) listenerCounts.rootRemoves++;
        if (this instanceof HTMLButtonElement) listenerCounts.elementRemoves++;
      }
      return originalRemove.call(this, type, listener, options);
    };
  }

  let calls = 0;
  const onClick = (event) => {
    if (!(event.currentTarget instanceof HTMLButtonElement)) throw new Error("incorrect currentTarget");
    calls++;
  };
  try {
    const startedAt = performance.now();
    const disposers = buttons.map((button) => bindEvent(button, "click", onClick));
    const registerMs = performance.now() - startedAt;
    let beforeConnectionCalls = 0;
    if (mode === "detached") {
      buttons[0].click();
      beforeConnectionCalls = calls;
    }
    const promotionStart = performance.now();
    if (mode === "detached") {
      host.append(detached);
      document.body.append(host);
      await Promise.resolve();
    }
    const promotionMs = performance.now() - promotionStart;
    buttons[0].click();
    buttons[buttons.length - 1].click();
    if (calls !== (mode === "detached" ? 3 : 2)) throw new Error("incorrect event count after connection");
    const disposeStart = performance.now();
    for (const dispose of disposers) dispose();
    const disposeMs = performance.now() - disposeStart;
    host.remove();
    buttons[0].click();
    if (calls !== (mode === "detached" ? 3 : 2)) throw new Error("listener survived disposal");
    if (mode === "detached" && beforeConnectionCalls !== 1) throw new Error("detached fallback did not dispatch");
    if (diagnostics && (listenerCounts.rootAdds !== 1 || listenerCounts.rootRemoves !== 1 ||
      listenerCounts.elementAdds !== (mode === "detached" ? rowCount : 0) ||
      listenerCounts.elementRemoves !== (mode === "detached" ? rowCount : 0))) {
      throw new Error("unexpected listener accounting: " + JSON.stringify(listenerCounts));
    }
    return { mode, rowCount, diagnostics, registerMs, promotionMs, disposeMs, beforeConnectionCalls, listenerCounts };
  } finally {
    EventTarget.prototype.addEventListener = originalAdd;
    EventTarget.prototype.removeEventListener = originalRemove;
    host.remove();
  }
};`;

const rootDir = await mkdtemp(join(await realpath(tmpdir()), "mreact-event-lifecycle-"));
try {
  await writeFile(join(rootDir, "index.html"), '<script type="module" src="/bench.ts"></script>');
  await writeFile(join(rootDir, "bench.ts"), source);
  await build({
    configFile: false,
    root: rootDir,
    logLevel: "silent",
    build: { outDir: join(rootDir, "dist"), rollupOptions: { output: { entryFileNames: "assets/bench.js" } } },
    resolve: { alias: [
      { find: "@reckona/mreact-reactive-dom/internal", replacement: join(process.cwd(), "packages/reactive-dom/dist/internal.js") },
      { find: "@reckona/mreact-reactive-core/internal", replacement: join(process.cwd(), "packages/reactive-core/dist/internal.js") },
      { find: "@reckona/mreact-reactive-core/runtime-state", replacement: join(process.cwd(), "packages/reactive-core/dist/runtime-state-public.js") },
      { find: "@reckona/mreact-reactive-dom", replacement: join(process.cwd(), "packages/reactive-dom/dist/index.js") },
      { find: "@reckona/mreact-reactive-core", replacement: join(process.cwd(), "packages/reactive-core/dist/index.js") },
    ] },
  });
  const script = await readFile(join(rootDir, "dist/assets/bench.js"), "utf8");
  const timed = [];
  const diagnostics = [];
  for (let round = 0; round < rounds; round++) {
    const modes = round % 2 === 0 ? ["connected", "detached"] : ["detached", "connected"];
    for (const mode of modes) timed.push({ round, ...await runTrial(script, mode, false) });
  }
  for (const mode of ["detached", "connected"]) diagnostics.push(await runTrial(script, mode, true));
  const outputDir = await createDatedResultsDir(new Date(), { resultsRoot: join("benchmarks", "results", "primitive-browser-event-lifecycle") });
  const result = {
    methodologyVersion: 1,
    track: "handwritten-event-runtime",
    rowCount,
    rounds,
    environment: await collectBenchmarkEnvironment(["@reckona/mreact-reactive-dom"]),
    timed,
    diagnostics,
    limitations: [
      "Each scored trial uses a fresh Chromium browser without forced GC; listener accounting is collected in separate instrumented trials.",
      "The fixture uses one shared handler and the public bindEvent API with individual disposers. It does not measure compiler-keyed event generation, batched root release, or allocation volume.",
      "Promotion time includes fragment insertion and one microtask checkpoint, not paint.",
    ],
  };
  await writeJsonFile(join(outputDir, "event-lifecycle.json"), result);
  console.log(JSON.stringify({ outputDir, timed, diagnostics }, null, 2));
} finally {
  await rm(rootDir, { force: true, recursive: true });
}

async function runTrial(script: string, mode: string, diagnostics: boolean) {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent("<body></body>");
    await page.addScriptTag({ content: script, type: "module" });
    await page.waitForFunction(() => typeof (window as any).__eventLifecycleBenchmark === "function");
    const sample = await page.evaluate(({ mode, rowCount, diagnostics }) =>
      (window as any).__eventLifecycleBenchmark(mode, rowCount, diagnostics), { mode, rowCount, diagnostics });
    return { browserVersion: browser.version(), ...sample };
  } finally {
    await browser.close();
  }
}

function readPositiveInteger(name: string, fallback: number): number {
  const value = Number(process.env[name] ?? fallback);
  return Number.isSafeInteger(value) && value > 0 ? value : fallback;
}
