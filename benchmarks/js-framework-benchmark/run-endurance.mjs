import { chromium } from "@playwright/test";

export async function runCompiledEndurance({ url, cycles, warmupCycles = 1 }) {
  if (!Number.isSafeInteger(cycles) || cycles < 1) throw new Error("cycles must be a positive integer");
  if (!Number.isSafeInteger(warmupCycles) || warmupCycles < 0) throw new Error("warmupCycles must be a non-negative integer");
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    const session = await context.newCDPSession(page);
    await session.send("Performance.enable");
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await page.locator("#runlots").waitFor();

    for (let index = 0; index < warmupCycles; index += 1) await runCycle(page);
    let previousMetrics = await readMetrics(session);
    const results = [];
    for (let index = 0; index < cycles; index += 1) {
      const operations = await runCycle(page);
      const metrics = await readMetrics(session);
      results.push({
        index,
        operations,
        jsHeapUsedBytes: metrics.JSHeapUsedSize,
        domNodes: metrics.Nodes,
        taskDurationMs: (metrics.TaskDuration - previousMetrics.TaskDuration) * 1_000,
        scriptDurationMs: (metrics.ScriptDuration - previousMetrics.ScriptDuration) * 1_000,
      });
      previousMetrics = metrics;
    }
    await session.send("HeapProfiler.collectGarbage");
    const postClearGc = await readMetrics(session);
    await page.goto("about:blank");
    const postNavigation = await readMetrics(session);
    await session.send("HeapProfiler.collectGarbage");
    const postNavigationGc = await readMetrics(session);
    await context.close();
    return {
      methodologyVersion: 1,
      track: "compiled-jsx-endurance",
      gcMode: "natural",
      browserVersion: browser.version(),
      url,
      warmupCycles,
      cycles: results,
      operationSummary: summarizeOperations(results),
      postClearGc: {
        jsHeapUsedBytes: postClearGc.JSHeapUsedSize,
        domNodes: postClearGc.Nodes,
      },
      postNavigation: {
        jsHeapUsedBytes: postNavigation.JSHeapUsedSize,
        domNodes: postNavigation.Nodes,
      },
      postNavigationGc: {
        jsHeapUsedBytes: postNavigationGc.JSHeapUsedSize,
        domNodes: postNavigationGc.Nodes,
      },
      limitations: [
        "Operation times end at verified DOM state, not paint or INP.",
        "Per-cycle CDP heap and node counts are snapshots under natural GC, not retained-size or allocation measurements; terminal GC snapshots are separate from timed cycles.",
        "The canonical keyed fixture has create, update, select, swap, append, remove, and clear actions; it has no filter or arbitrary-sort action.",
      ],
    };
  } finally {
    await browser.close();
  }
}

async function readMetrics(session) {
  const response = await session.send("Performance.getMetrics");
  const metrics = Object.fromEntries(response.metrics.map(({ name, value }) => [name, value]));
  for (const name of ["JSHeapUsedSize", "Nodes", "TaskDuration", "ScriptDuration"]) {
    if (!Number.isFinite(metrics[name])) throw new Error(`Chromium Performance metric ${name} unavailable`);
  }
  return metrics;
}

function summarizeOperations(cycles) {
  const byName = new Map();
  for (const cycle of cycles) {
    for (const operation of cycle.operations) {
      const samples = byName.get(operation.name) ?? [];
      samples.push(operation.domVerifiedMs);
      byName.set(operation.name, samples);
    }
  }
  return Object.fromEntries([...byName.entries()].map(([name, samples]) => {
    samples.sort((a, b) => a - b);
    const middle = Math.floor(samples.length / 2);
    const median = samples.length % 2 === 0 ? (samples[middle - 1] + samples[middle]) / 2 : samples[middle];
    return [name, { count: samples.length, medianDomVerifiedMs: median, maxDomVerifiedMs: samples.at(-1) }];
  }));
}

async function runCycle(page) {
  return await page.evaluate(async () => {
    const body = document.querySelector("tbody");
    if (!(body instanceof HTMLTableSectionElement)) throw new Error("keyed fixture tbody missing");
    const operations = [];
    async function perform(name, target, verify) {
      if (!(target instanceof HTMLElement)) throw new Error(`${name} target missing`);
      const start = performance.now();
      target.click();
      const clickMs = performance.now() - start;
      if (!verify()) {
        await new Promise((resolve, reject) => {
          const observer = new MutationObserver(() => {
            if (!verify()) return;
            observer.disconnect();
            clearTimeout(timeout);
            resolve();
          });
          const timeout = setTimeout(() => {
            observer.disconnect();
            reject(new Error(`${name} did not reach expected DOM state`));
          }, 15_000);
          observer.observe(body, { attributes: true, characterData: true, childList: true, subtree: true });
        });
      }
      operations.push({ name, clickMs, domVerifiedMs: performance.now() - start });
    }

    await perform("create-10k", document.querySelector("#runlots"), () => body.rows.length === 10_000);
    const beforeUpdate = body.rows[0]?.textContent;
    await perform("update-10th", document.querySelector("#update"), () => body.rows[0]?.textContent !== beforeUpdate && body.rows[0]?.textContent?.includes("!!!"));
    const selectedRow = body.rows[5_000];
    await perform("select", selectedRow?.querySelector("a"), () => selectedRow?.classList.contains("danger"));
    const first = body.rows[1]?.cells[0]?.textContent;
    const second = body.rows[998]?.cells[0]?.textContent;
    await perform("swap", document.querySelector("#swaprows"), () => body.rows[1]?.cells[0]?.textContent === second && body.rows[998]?.cells[0]?.textContent === first);
    await perform("append-1k", document.querySelector("#add"), () => body.rows.length === 11_000);
    const remove = body.rows[0]?.querySelector(".glyphicon-remove")?.closest("a") ?? body.rows[0]?.querySelector(".remove");
    await perform("remove", remove, () => body.rows.length === 10_999);
    await perform("clear", document.querySelector("#clear"), () => body.rows.length === 0);
    return operations;
  });
}
