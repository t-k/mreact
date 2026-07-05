import { existsSync, rmSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { compile } from "svelte/compiler";
import { readPackageVersion } from "../../shared/env.js";
import {
  createReplacementRowsData,
  createRowsData,
  createRowsDataFrom,
  validateRows,
  validateRowsReversedWithNodeIdentity,
  validateSelectedRow,
} from "../fixtures/rows.js";
import type { RowFixture } from "../fixtures/rows.js";
import { validateEventTargets } from "../fixtures/event-targets.js";
import {
  calculateHeapDelta,
  forcedGcMemoryNote,
  memoryStressCycles,
  readHeapUsedAfterForcedGc,
} from "../memory.js";
import type { PrimitiveAdapter, PrimitiveCaseResult, PrimitiveRunContext } from "../types.js";
import { assertRenderedTextValues, sum, updateEveryTenth } from "./framework-runtime-utils.js";

interface SvelteRowsInstance {
  setRows(rows: RowFixture[]): void;
  setSelectedId(selectedId: number): void;
}

interface SvelteTextInstance {
  setValue(value: string): void;
}

interface SvelteAggregateInstance {
  setValues(values: number[]): void;
}

interface SvelteRuntime {
  aggregateComponent: SvelteComponentModule<SvelteAggregateInstance>;
  eventTargetsComponent: SvelteComponentModule<Record<string, never>>;
  flushSync<T>(fn: () => T): T;
  rowsComponent: SvelteComponentModule<SvelteRowsInstance>;
  textComponent: SvelteComponentModule<SvelteTextInstance>;
  mount<T>(component: SvelteComponentModule<T>, options: { props?: unknown; target: Element }): T;
  unmount(instance: unknown): Promise<void>;
}

type SvelteComponentModule<T> = (anchor: Node, props: unknown) => T;

const require = createRequire(import.meta.url);
let runtimePromise: Promise<SvelteRuntime> | undefined;

export const sveltePrimitiveAdapter: PrimitiveAdapter = {
  fixtureKind: "framework-runtime",
  name: "svelte",
  version: readPackageVersion("svelte"),
  cases: {
    "create 1k rows": runCreateRows,
    "replace all 1k rows": runReplaceAllRows,
    "update every 10th in 10k rows": runUpdateEveryTenth,
    "select row in 10k rows": runSelectRow,
    "append 1k rows to 10k rows": runAppendRows,
    "remove row from 1k rows": runRemoveRow,
    "clear 10k rows": runClearRows,
    "keyed reverse 1k rows": runKeyedReverse,
    "create 1k event targets": runCreateEventTargets,
    "text binding update 1k": runTextBindingUpdate,
    "computed fan-out 1k": runComputedFanOut,
    "computed fan-in 1k (single array write)": runComputedFanIn,
    "repeated create update clear memory": runRepeatedMemory,
  },
};

async function runCreateRows({ count, document }: PrimitiveRunContext): Promise<PrimitiveCaseResult> {
  const runtime = await getSvelteRuntime();
  const host = document.createElement("div");
  const rows = createRowsData(count);
  const start = performance.now();
  const instance = runtime.mount(runtime.rowsComponent, { target: host, props: { rows } });
  const duration = performance.now() - start;

  try {
    validateRows(host, rows);
    return { samples: [duration] };
  } finally {
    await runtime.unmount(instance);
  }
}

async function runReplaceAllRows({
  count,
  document,
}: PrimitiveRunContext): Promise<PrimitiveCaseResult> {
  const runtime = await getSvelteRuntime();
  const host = document.createElement("div");
  const rows = createRowsData(count);
  const replacementRows = createReplacementRowsData(count);
  const instance = runtime.mount(runtime.rowsComponent, { target: host, props: { rows } });

  try {
    validateRows(host, rows);

    const start = performance.now();
    runtime.flushSync(() => instance.setRows(replacementRows));
    const duration = performance.now() - start;

    validateRows(host, replacementRows);
    return { samples: [duration] };
  } finally {
    await runtime.unmount(instance);
  }
}

async function runUpdateEveryTenth({
  count,
  document,
}: PrimitiveRunContext): Promise<PrimitiveCaseResult> {
  const runtime = await getSvelteRuntime();
  const host = document.createElement("div");
  const rows = createRowsData(count);
  const updatedRows = updateEveryTenth(rows);
  const instance = runtime.mount(runtime.rowsComponent, { target: host, props: { rows } });

  try {
    validateRows(host, rows);

    const start = performance.now();
    runtime.flushSync(() => instance.setRows(updatedRows));
    const duration = performance.now() - start;

    validateRows(host, updatedRows);
    return { samples: [duration] };
  } finally {
    await runtime.unmount(instance);
  }
}

async function runSelectRow({ count, document }: PrimitiveRunContext): Promise<PrimitiveCaseResult> {
  const runtime = await getSvelteRuntime();
  const host = document.createElement("div");
  const rows = createRowsData(count);
  const selectedId = Math.floor(count / 2);
  const instance = runtime.mount(runtime.rowsComponent, { target: host, props: { rows } });

  try {
    validateRows(host, rows);

    const start = performance.now();
    runtime.flushSync(() => instance.setSelectedId(selectedId));
    const duration = performance.now() - start;

    validateRows(host, rows);
    validateSelectedRow(host, selectedId);
    return { samples: [duration] };
  } finally {
    await runtime.unmount(instance);
  }
}

async function runAppendRows({ count, document }: PrimitiveRunContext): Promise<PrimitiveCaseResult> {
  const runtime = await getSvelteRuntime();
  const host = document.createElement("div");
  const rows = createRowsData(count);
  const appendedRows = [...rows, ...createRowsDataFrom(count, 1_000)];
  const instance = runtime.mount(runtime.rowsComponent, { target: host, props: { rows } });

  try {
    validateRows(host, rows);

    const start = performance.now();
    runtime.flushSync(() => instance.setRows(appendedRows));
    const duration = performance.now() - start;

    validateRows(host, appendedRows);
    return { samples: [duration] };
  } finally {
    await runtime.unmount(instance);
  }
}

async function runRemoveRow({ count, document }: PrimitiveRunContext): Promise<PrimitiveCaseResult> {
  const runtime = await getSvelteRuntime();
  const host = document.createElement("div");
  const rows = createRowsData(count);
  const remainingRows = rows.filter((_, index) => index !== Math.floor(count / 2));
  const instance = runtime.mount(runtime.rowsComponent, { target: host, props: { rows } });

  try {
    validateRows(host, rows);

    const start = performance.now();
    runtime.flushSync(() => instance.setRows(remainingRows));
    const duration = performance.now() - start;

    validateRows(host, remainingRows);
    return { samples: [duration] };
  } finally {
    await runtime.unmount(instance);
  }
}

async function runClearRows({ count, document }: PrimitiveRunContext): Promise<PrimitiveCaseResult> {
  const runtime = await getSvelteRuntime();
  const host = document.createElement("div");
  const rows = createRowsData(count);
  const instance = runtime.mount(runtime.rowsComponent, { target: host, props: { rows } });

  try {
    validateRows(host, rows);

    const start = performance.now();
    runtime.flushSync(() => instance.setRows([]));
    const duration = performance.now() - start;

    validateRows(host, []);
    return { samples: [duration] };
  } finally {
    await runtime.unmount(instance);
  }
}

async function runKeyedReverse({
  count,
  document,
}: PrimitiveRunContext): Promise<PrimitiveCaseResult> {
  const runtime = await getSvelteRuntime();
  const host = document.createElement("div");
  const rows = createRowsData(count);
  const instance = runtime.mount(runtime.rowsComponent, { target: host, props: { rows } });

  try {
    validateRows(host, rows);
    const initialNodes = [...host.children];

    const start = performance.now();
    runtime.flushSync(() => instance.setRows([...rows].reverse()));
    const duration = performance.now() - start;

    validateRowsReversedWithNodeIdentity(host, rows, initialNodes);
    return { samples: [duration] };
  } finally {
    await runtime.unmount(instance);
  }
}

async function runCreateEventTargets({
  count,
  document,
}: PrimitiveRunContext): Promise<PrimitiveCaseResult> {
  const runtime = await getSvelteRuntime();
  const host = document.createElement("div");
  const items = Array.from({ length: count }, (_, index) => index);
  const start = performance.now();
  const instance = runtime.mount(runtime.eventTargetsComponent, { target: host, props: { items } });
  const duration = performance.now() - start;

  try {
    validateEventTargets(host, count);
    return { samples: [duration] };
  } finally {
    await runtime.unmount(instance);
  }
}

async function runTextBindingUpdate({
  count,
  document,
}: PrimitiveRunContext): Promise<PrimitiveCaseResult> {
  const runtime = await getSvelteRuntime();
  const host = document.createElement("div");
  const items = Array.from({ length: count }, (_, index) => index);
  const instance = runtime.mount(runtime.textComponent, {
    target: host,
    props: { items, value: "0" },
  });

  try {
    assertRenderedTextValues(host, count, "0");

    const start = performance.now();
    runtime.flushSync(() => instance.setValue("1"));
    const duration = performance.now() - start;

    assertRenderedTextValues(host, count, "1");
    return { samples: [duration] };
  } finally {
    await runtime.unmount(instance);
  }
}

async function runComputedFanOut({
  count,
  document,
}: PrimitiveRunContext): Promise<PrimitiveCaseResult> {
  const runtime = await getSvelteRuntime();
  const host = document.createElement("div");
  const items = Array.from({ length: count }, (_, index) => index);
  const instance = runtime.mount(runtime.textComponent, {
    target: host,
    props: { items, value: "0" },
  });

  try {
    assertRenderedTextValues(host, count, "0");

    const start = performance.now();
    runtime.flushSync(() => instance.setValue(String(1 * 2)));
    const duration = performance.now() - start;

    assertRenderedTextValues(host, count, "2");
    return { samples: [duration] };
  } finally {
    await runtime.unmount(instance);
  }
}

async function runComputedFanIn({
  count,
  document,
}: PrimitiveRunContext): Promise<PrimitiveCaseResult> {
  const runtime = await getSvelteRuntime();
  const host = document.createElement("div");
  const values = Array.from({ length: count }, (_, index) => index);
  const instance = runtime.mount(runtime.aggregateComponent, { target: host, props: { values } });

  try {
    assertRenderedTextValues(host, 1, String(sum(values)));

    const updatedValues = values.map((value) => value + 1);
    const start = performance.now();
    runtime.flushSync(() => instance.setValues(updatedValues));
    const duration = performance.now() - start;

    assertRenderedTextValues(host, 1, String(sum(updatedValues)));
    return { samples: [duration] };
  } finally {
    await runtime.unmount(instance);
  }
}

async function runRepeatedMemory({
  count,
  document,
}: PrimitiveRunContext): Promise<PrimitiveCaseResult> {
  const runtime = await getSvelteRuntime();
  const before = await readHeapUsedAfterForcedGc();
  const host = document.createElement("div");
  const instance = runtime.mount(runtime.rowsComponent, { target: host, props: { rows: [] } });

  try {
    for (let cycle = 0; cycle < memoryStressCycles; cycle += 1) {
      const rows = createRowsData(count);
      runtime.flushSync(() => instance.setRows(rows));
      validateRows(host, rows);

      runtime.flushSync(() => instance.setRows(createReplacementRowsData(count)));
      runtime.flushSync(() => instance.setRows([]));
    }
  } finally {
    await runtime.unmount(instance);
  }

  const after = await readHeapUsedAfterForcedGc();
  return {
    samples: [calculateHeapDelta(after, before)],
    notes: [forcedGcMemoryNote],
  };
}

async function getSvelteRuntime(): Promise<SvelteRuntime> {
  runtimePromise ??= loadSvelteRuntime();
  return runtimePromise;
}

async function loadSvelteRuntime(): Promise<SvelteRuntime> {
  const svelteRoot = dirname(require.resolve("svelte/package.json"));
  const outputDir = join(process.cwd(), "tmp", `mreact-svelte-primitive-${process.pid}`);
  await mkdir(outputDir, { recursive: true });

  process.once("exit", () => {
    if (existsSync(outputDir)) {
      rmSync(outputDir, { force: true, recursive: true });
    }
  });

  const modules = {
    Aggregate: compileComponent(
      "Aggregate.svelte",
      `<script>
let { values = [] } = $props();
let total = $derived(values.reduce((sum, value) => sum + value, 0));
export function setValues(next) { values = next; }
</script>{total}`,
    ),
    EventTargets: compileComponent(
      "EventTargets.svelte",
      `<script>
let { items = [] } = $props();
function onClick() {}
</script>{#each items as item (item)}<button type="button" data-index={item} onclick={onClick}>{item}</button>{/each}`,
    ),
    Rows: compileComponent(
      "Rows.svelte",
      `<script>
let { rows = [], selectedId = -1 } = $props();
export function setRows(next) { rows = next; }
export function setSelectedId(next) { selectedId = next; }
</script>{#each rows as row (row.id)}<div data-key={row.id} class:selected={selectedId === row.id} data-selected={selectedId === row.id ? "true" : undefined}>{row.label}</div>{/each}`,
    ),
    Text: compileComponent(
      "Text.svelte",
      `<script>
let { items = [], value = "0" } = $props();
export function setValue(next) { value = next; }
</script>{#each items as item (item)}{value}{/each}`,
    ),
  };

  await Promise.all(
    Object.entries(modules).map(([name, code]) => writeFile(join(outputDir, `${name}.mjs`), code)),
  );

  const [aggregate, eventTargets, rows, text, render, batch] = await Promise.all([
    import(pathToFileURL(join(outputDir, "Aggregate.mjs")).href) as Promise<{
      default: SvelteComponentModule<SvelteAggregateInstance>;
    }>,
    import(pathToFileURL(join(outputDir, "EventTargets.mjs")).href) as Promise<{
      default: SvelteComponentModule<Record<string, never>>;
    }>,
    import(pathToFileURL(join(outputDir, "Rows.mjs")).href) as Promise<{
      default: SvelteComponentModule<SvelteRowsInstance>;
    }>,
    import(pathToFileURL(join(outputDir, "Text.mjs")).href) as Promise<{
      default: SvelteComponentModule<SvelteTextInstance>;
    }>,
    import(pathToFileURL(join(svelteRoot, "src/internal/client/render.js")).href) as Promise<{
      mount<T>(component: SvelteComponentModule<T>, options: { props?: unknown; target: Element }): T;
      unmount(instance: unknown): Promise<void>;
    }>,
    import(pathToFileURL(join(svelteRoot, "src/internal/client/reactivity/batch.js")).href) as Promise<{
      flushSync<T>(fn: () => T): T;
    }>,
  ]);

  const runtime: SvelteRuntime = {
    aggregateComponent: aggregate.default,
    eventTargetsComponent: eventTargets.default,
    flushSync: batch.flushSync,
    mount: render.mount,
    rowsComponent: rows.default,
    textComponent: text.default,
    unmount: render.unmount,
  };

  rmSync(outputDir, { force: true, recursive: true });
  return runtime;
}

function compileComponent(filename: string, source: string): string {
  return compile(source, {
    dev: false,
    filename,
    generate: "client",
  }).js.code;
}
