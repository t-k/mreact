import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { primitiveAdapters } from "./adapters/index.js";
import { mreactAdapter } from "./adapters/mreact.js";
import { reactAdapter } from "./adapters/react.js";
import { solidAdapter, solidAdapterDebugHooks } from "./adapters/solid.js";
import { primitiveCases } from "./cases.js";
import { closeBenchmarkDom, createBenchmarkDom } from "./dom.js";
import { filterPrimitiveAdapters, filterPrimitiveCases } from "./filter.js";
import {
  calculateHeapDelta,
  forcedGcMemoryNote,
  memoryStressCycles,
  readHeapUsedAfterForcedGc,
} from "./memory.js";
import {
  createRowsData,
  validateRows,
  validateRowsReversedWithNodeIdentity,
  validateRowsReversed,
} from "./fixtures/rows.js";
import { buildPrimitiveWorkerArgs, runPrimitiveBenchmarkWorker } from "./process-runner.js";
import { collectPrimitiveCaseSamples } from "./runner.js";
import { validateTextNodes } from "./fixtures/text-binding.js";

describe("primitive fixtures", () => {
  it("validates row DOM shape", () => {
    const context = createBenchmarkDom();
    const host = context.document.createElement("div");
    const rows = createRowsData(3);

    for (const row of rows) {
      const item = context.document.createElement("div");
      item.dataset.key = String(row.id);
      item.textContent = row.label;
      host.append(item);
    }

    expect(() => validateRows(host, rows)).not.toThrow();
  });

  it("validates reversed keyed DOM shape", () => {
    const context = createBenchmarkDom();
    const host = context.document.createElement("div");
    const rows = createRowsData(3);

    for (const row of [...rows].reverse()) {
      const item = context.document.createElement("div");
      item.dataset.key = String(row.id);
      item.textContent = row.label;
      host.append(item);
    }

    expect(() => validateRowsReversed(host, rows)).not.toThrow();
  });

  it("validates reversed keyed DOM node identity", () => {
    const context = createBenchmarkDom();
    const host = context.document.createElement("div");
    const rows = createRowsData(3);
    const initialNodes = rows.map((row) => {
      const item = context.document.createElement("div");
      item.dataset.key = String(row.id);
      item.textContent = row.label;
      return item;
    });

    host.append(...initialNodes);
    host.replaceChildren(...[...initialNodes].reverse());

    expect(() => validateRowsReversedWithNodeIdentity(host, rows, initialNodes)).not.toThrow();
  });

  it("rejects reversed keyed DOM node replacement", () => {
    const context = createBenchmarkDom();
    const host = context.document.createElement("div");
    const rows = createRowsData(2);
    const initialNodes = rows.map((row) => {
      const item = context.document.createElement("div");
      item.dataset.key = String(row.id);
      item.textContent = row.label;
      return item;
    });
    const replacementNodes = [...rows].reverse().map((row) => {
      const item = context.document.createElement("div");
      item.dataset.key = String(row.id);
      item.textContent = row.label;
      return item;
    });

    host.append(...replacementNodes);

    expect(() => validateRowsReversedWithNodeIdentity(host, rows, initialNodes)).toThrow(
      "row 0 expected preserved node for key 1",
    );
  });

  it("validates text node values", () => {
    const context = createBenchmarkDom();
    const nodes = [context.document.createTextNode("7"), context.document.createTextNode("7")];

    expect(() => validateTextNodes(nodes, "7")).not.toThrow();
  });

  it("rejects row child count mismatch", () => {
    const context = createBenchmarkDom();
    const host = context.document.createElement("div");
    const rows = createRowsData(2);

    const item = context.document.createElement("div");
    item.dataset.key = String(rows[0]!.id);
    item.textContent = rows[0]!.label;
    host.append(item);

    expect(() => validateRows(host, rows)).toThrow("expected 2 rows, received 1");
  });

  it("rejects row key mismatch with row index and received value", () => {
    const context = createBenchmarkDom();
    const host = context.document.createElement("div");
    const rows = createRowsData(1);

    const item = context.document.createElement("div");
    item.dataset.key = "999";
    item.textContent = rows[0]!.label;
    host.append(item);

    expect(() => validateRows(host, rows)).toThrow("row 0 expected data-key 0, received 999");
  });

  it("rejects row label mismatch with row index and received value", () => {
    const context = createBenchmarkDom();
    const host = context.document.createElement("div");
    const rows = createRowsData(1);

    const item = context.document.createElement("div");
    item.dataset.key = String(rows[0]!.id);
    item.textContent = "Wrong";
    host.append(item);

    expect(() => validateRows(host, rows)).toThrow("row 0 expected label Row 0, received Wrong");
  });

  it("rejects text node value mismatch", () => {
    const context = createBenchmarkDom();
    const nodes = [context.document.createTextNode("7"), context.document.createTextNode("8")];

    expect(() => validateTextNodes(nodes, "7")).toThrow("text node 1 expected 7, received 8");
  });

  it("closes the previous happy-dom window before installing a new benchmark DOM", async () => {
    createBenchmarkDom();
    const previousWindow = globalThis.window as Window & {
      happyDOM?: { close: () => Promise<void> };
    };
    let closeCalls = 0;

    if (previousWindow.happyDOM === undefined) {
      expect.fail("happy-dom window API missing");
    }

    previousWindow.happyDOM.close = async () => {
      closeCalls += 1;
    };

    await createBenchmarkDom();

    expect(closeCalls).toBe(1);
  });

  it("waits for happy-dom async close before resolving benchmark DOM teardown", async () => {
    createBenchmarkDom();
    const previousWindow = globalThis.window as Window & {
      happyDOM?: { close: () => Promise<void> };
    };
    let closeResolved = false;

    if (previousWindow.happyDOM === undefined) {
      expect.fail("happy-dom window API missing");
    }

    previousWindow.happyDOM.close = async () => {
      await Promise.resolve();
      closeResolved = true;
    };

    await closeBenchmarkDom();

    expect(closeResolved).toBe(true);
  });
});

describe("primitive adapters", () => {
  it("filters primitive adapters and cases for fast benchmark iteration", () => {
    expect(
      filterPrimitiveAdapters(primitiveAdapters, "react, mreact react-compat").map(
        (adapter) => adapter.name,
      ),
    ).toEqual(["react", "mreact react-compat"]);
    expect(
      filterPrimitiveCases(primitiveCases, "create 1k rows, remove row from 1k rows").map(
        (benchmarkCase) => benchmarkCase.name,
      ),
    ).toEqual(["create 1k rows", "remove row from 1k rows"]);
  });

  it("includes every planned primitive framework adapter", () => {
    expect(primitiveAdapters.map((adapter) => adapter.name)).toEqual([
      "marko",
      "vue",
      "svelte",
      "angular",
      "qwik",
      "qwik-v2",
      "react",
      "mreact react-compat",
      "solid",
      "solid-v2",
      "mreact",
    ]);
  });

  it("marks Vue, Svelte, and Angular primitive adapters as framework-runtime fixtures", () => {
    const fixtureKinds = new Map(
      primitiveAdapters.map((adapter) => [
        adapter.name,
        (adapter as { fixtureKind?: string }).fixtureKind,
      ]),
    );

    expect(fixtureKinds.get("vue")).toBe("framework-runtime");
    expect(fixtureKinds.get("svelte")).toBe("framework-runtime");
    expect(fixtureKinds.get("angular")).toBe("framework-runtime");
  });

  it("defines the expanded primitive case matrix with descriptions", () => {
    expect(primitiveCases.map((benchmarkCase) => benchmarkCase.name)).toEqual([
      "create 1k rows",
      "replace all 1k rows",
      "update every 10th in 10k rows",
      "select row in 10k rows",
      "append 1k rows to 10k rows",
      "remove row from 1k rows",
      "clear 10k rows",
      "keyed reverse 1k rows",
      "create 1k event targets",
      "source write with subscriber 1k",
      "text binding update 1k",
      "computed fan-out 1k",
      "computed fan-in 1k (fine-grained writes)",
      "computed fan-in 1k (single array write)",
      "source write 1k",
      "repeated create update clear memory",
    ]);
    expect(primitiveCases.every((benchmarkCase) => benchmarkCase.description.length > 20)).toBe(
      true,
    );
    expect(
      primitiveCases.find(
        (benchmarkCase) => benchmarkCase.name === "computed fan-in 1k (fine-grained writes)",
      )
        ?.description,
    ).toContain("Only frameworks exposing comparable per-item source primitives");
    expect(
      primitiveCases.find(
        (benchmarkCase) => benchmarkCase.name === "computed fan-in 1k (single array write)",
      )
        ?.description,
    ).toContain("ranked separately from the fine-grained source-write variant");
    expect(
      primitiveCases
        .filter((benchmarkCase) => benchmarkCase.name.startsWith("computed fan-in 1k"))
        .map((benchmarkCase) => benchmarkCase.sampleBatchSize),
    ).toEqual([50, 50]);
  });

  it("runs every primitive case for every adapter", async () => {
    const caseNames = primitiveCases.map(({ name }) => name);
    const fineGrainedSourceAdapters = new Set(["mreact", "solid", "solid-v2"]);

    for (const adapter of primitiveAdapters) {
      if (adapter.name === "qwik-v2") {
        expect(adapter.cases).toEqual({});
        continue;
      }

      for (const caseName of caseNames) {
        const benchmarkCase = primitiveCases.find(({ name }) => name === caseName);
        const runCase = adapter.cases[caseName];

        if (runCase === undefined) {
          if (
            (caseName === "source write 1k" ||
              caseName === "source write with subscriber 1k" ||
              caseName === "computed fan-in 1k (fine-grained writes)") &&
            !fineGrainedSourceAdapters.has(adapter.name)
          ) {
            continue;
          }

          if (
            caseName === "computed fan-in 1k (single array write)" &&
            (adapter.name === "solid" || adapter.name === "solid-v2")
          ) {
            continue;
          }

          expect.fail(`${adapter.name} missing ${caseName}`);
        }

        if (benchmarkCase?.metric === "memory") {
          continue;
        }

        const context = createBenchmarkDom();
        const result = await runCase({
          ...context,
          count: caseName.includes("10k") ? 100 : 20,
        });
        expect(result.samples.length).toBeGreaterThan(0);
        expect(result.samples.every((sample) => sample >= 0)).toBe(true);
      }
    }
  });

  it("keeps Solid v1 fine-grained source writes batched", async () => {
    const source = await readFile(
      new URL("./adapters/solid.ts", import.meta.url),
      "utf8",
    );

    expect(source).toContain("const { batch, createComputed");
    expect([...source.matchAll(/batch\(\(\) =>/g)]).toHaveLength(3);
  });

  it("uses the provided benchmark document for React initial row creation", async () => {
    const context = createBenchmarkDom();
    const originalDocument = globalThis.document;
    const runCase = reactAdapter.cases["create 1k rows"];

    if (runCase === undefined) {
      expect.fail("react missing create 1k rows");
    }

    globalThis.document = {
      ...originalDocument,
      createElement() {
        throw new Error("global document createElement should not be used");
      },
    } as unknown as Document;

    try {
      const result = await runCase({ ...context, count: 20 });
      expect(result.samples.length).toBeGreaterThan(0);
    } finally {
      globalThis.document = originalDocument;
    }
  });

  it("collects five warmup runs and twenty-five measured samples by default", async () => {
    let calls = 0;

    const result = await collectPrimitiveCaseSamples(
      () => ({ ...createBenchmarkDom(), count: 10 }),
      async () => {
        calls += 1;
        return { samples: [calls], notes: [`run ${calls}`] };
      },
    );

    expect(calls).toBe(30);
    expect(result.samples).toEqual([
      6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29,
      30,
    ]);
    expect(result.notes).toEqual([
      "run 6",
      "run 7",
      "run 8",
      "run 9",
      "run 10",
      "run 11",
      "run 12",
      "run 13",
      "run 14",
      "run 15",
      "run 16",
      "run 17",
      "run 18",
      "run 19",
      "run 20",
      "run 21",
      "run 22",
      "run 23",
      "run 24",
      "run 25",
      "run 26",
      "run 27",
      "run 28",
      "run 29",
      "run 30",
    ]);
  });

  it("averages batched primitive case samples and records batch metadata", async () => {
    let calls = 0;

    const result = await collectPrimitiveCaseSamples(
      () => ({ ...createBenchmarkDom(), count: 10 }),
      async () => {
        calls += 1;
        return { samples: [calls] };
      },
      {
        measuredRuns: 2,
        sampleBatchSize: 3,
        warmupRuns: 1,
      },
    );

    expect(calls).toBe(9);
    expect(result.samples).toEqual([5, 8]);
    expect(result.notes).toEqual(["sampleBatchSize=3"]);
  });

  it("runs a primitive adapter case in an isolated worker process", async () => {
    const benchmarkCase = primitiveCases.find(({ name }) => name === "create 1k rows");

    if (benchmarkCase === undefined) {
      expect.fail("missing create 1k rows case");
    }

    const row = await runPrimitiveBenchmarkWorker({
      adapter: mreactAdapter,
      benchmarkCase: { ...benchmarkCase, count: 20 },
      measuredRuns: 1,
      warmupRuns: 0,
    });

    expect(row).toMatchObject({
      suite: "primitive",
      framework: "mreact",
      version: "workspace",
      caseName: "create 1k rows",
      status: "completed",
      metric: "duration",
      unit: "ms",
    });
    expect(row.samples).toHaveLength(1);
    expect(row.value).toBeGreaterThanOrEqual(0);
  }, 15_000);

  it("starts memory benchmark workers with explicit garbage collection enabled", () => {
    const durationCase = primitiveCases.find(({ name }) => name === "create 1k rows");
    const memoryCase = primitiveCases.find(
      ({ name }) => name === "repeated create update clear memory",
    );

    if (durationCase === undefined || memoryCase === undefined) {
      expect.fail("missing primitive benchmark case");
    }

    expect(
      buildPrimitiveWorkerArgs({
        benchmarkCase: durationCase,
        workerPath: "/repo/benchmarks/primitive/worker.ts",
      }),
    ).not.toContain("--expose-gc");
    expect(
      buildPrimitiveWorkerArgs({
        benchmarkCase: memoryCase,
        workerPath: "/repo/benchmarks/primitive/worker.ts",
      }),
    ).toContain("--expose-gc");
  });

  it("measures memory samples after forcing garbage collection", async () => {
    const benchmarkCase = primitiveCases.find(
      ({ name }) => name === "repeated create update clear memory",
    );

    if (benchmarkCase === undefined) {
      expect.fail("missing repeated create update clear memory case");
    }

    const row = await runPrimitiveBenchmarkWorker({
      adapter: mreactAdapter,
      benchmarkCase: { ...benchmarkCase, count: 20 },
      measuredRuns: 1,
      warmupRuns: 0,
    });

    expect(row.status).toBe("completed");
    expect(row.samples).toHaveLength(1);
    expect(row.notes).toEqual([forcedGcMemoryNote]);
  }, 15_000);

  it("measures every implemented memory adapter with forced garbage collection", async () => {
    const benchmarkCase = primitiveCases.find(
      ({ name }) => name === "repeated create update clear memory",
    );

    if (benchmarkCase === undefined) {
      expect.fail("missing repeated create update clear memory case");
    }

    for (const adapter of primitiveAdapters) {
      if (adapter.name === "qwik-v2") {
        continue;
      }

      const row = await runPrimitiveBenchmarkWorker({
        adapter,
        benchmarkCase: { ...benchmarkCase, count: 20 },
        measuredRuns: 1,
        warmupRuns: 0,
      });

      expect(row.framework).toBe(adapter.name);
      expect(row.status).toBe("completed");
      expect(row.samples).toHaveLength(1);
      expect(row.notes).toEqual([forcedGcMemoryNote]);
    }
  }, 60_000);

  it("keeps raw memory deltas and amplifies the repeated memory signal", () => {
    expect(calculateHeapDelta(90, 100)).toBe(-10);
    expect(memoryStressCycles).toBe(20);
  });

  it("yields between forced garbage collection passes before reading heap usage", async () => {
    const originalGc = globalThis.gc;
    const calls: string[] = [];

    globalThis.gc = () => {
      calls.push("gc");
      queueMicrotask(() => calls.push("microtask"));
    };

    try {
      await readHeapUsedAfterForcedGc();
    } finally {
      globalThis.gc = originalGc;
    }

    expect(calls).toEqual(["gc", "microtask", "gc", "microtask", "gc", "microtask"]);
  });

  it("does not recreate mreact row elements when updating every tenth keyed row", async () => {
    const context = createBenchmarkDom();
    const createdDivs: Element[] = [];
    const document = Object.create(context.document) as Document;
    const runCase = mreactAdapter.cases["update every 10th in 10k rows"];

    if (runCase === undefined) {
      expect.fail("mreact missing update every 10th in 10k rows");
    }

    document.createElement = ((tagName: string, options?: ElementCreationOptions) => {
      const element = context.document.createElement(tagName, options);

      if (tagName === "div") {
        createdDivs.push(element);
      }

      return element;
    }) as Document["createElement"];

    await runCase({ ...context, document, count: 20 });

    expect(createdDivs).toHaveLength(21);
  });

  it("preserves Solid keyed row nodes when reversing", async () => {
    const snapshots: Element[][] = [];
    const runCase = solidAdapter.cases["keyed reverse 1k rows"];

    if (runCase === undefined) {
      expect.fail("solid missing keyed reverse 1k rows");
    }

    solidAdapterDebugHooks.onRowsCommitted = (host) => {
      snapshots.push([...host.children]);
    };

    try {
      await runCase({
        ...createBenchmarkDom(),
        count: 20,
      });
    } finally {
      solidAdapterDebugHooks.onRowsCommitted = undefined;
    }

    expect(snapshots.length).toBeGreaterThanOrEqual(2);

    const initial = snapshots[0]!;
    const reversed = snapshots.at(-1)!;

    expect(initial).toHaveLength(20);
    expect(reversed).toHaveLength(20);
    expect(reversed[0]).toBe(initial[19]);
    expect(reversed[19]).toBe(initial[0]);
  });
});
