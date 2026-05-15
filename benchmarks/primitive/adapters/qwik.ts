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
import { validateTextNodes } from "../fixtures/text-binding.js";
import type {
  PrimitiveAdapter,
  PrimitiveCaseResult,
  PrimitiveRunContext,
} from "../types.js";

// Vitest resolves Qwik's development runtime, but the benchmark is explicitly a
// production-mode benchmark. Use the production runtime so tests and measurements
// exercise the same renderer behavior.
// @ts-expect-error Qwik does not publish declarations for dist subpaths.
import { h, render } from "../../../node_modules/@builder.io/qwik/dist/core.prod.mjs";

export const qwikAdapter: PrimitiveAdapter = {
  name: "qwik",
  version: readPackageVersion("@builder.io/qwik"),
  cases: {
    "create 1k rows": runCreateRows,
    "replace all 1k rows": runReplaceAllRows,
    "update every 10th in 10k rows": runUpdateEveryTenth,
    "select row in 10k rows": runSelectRow,
    "append 1k rows to 10k rows": runAppendRows,
    "remove row from 1k rows": runRemoveRow,
    "clear 10k rows": runClearRows,
    "keyed reverse 1k rows": runKeyedReverse,
    "text binding update 1k": runTextBindingUpdate,
    "computed fan-out 1k": runComputedFanOut,
    "computed fan-in 1k": runComputedFanIn,
    "repeated create update clear memory": runRepeatedMemory,
  },
};

async function runCreateRows({
  count,
  document,
}: PrimitiveRunContext): Promise<PrimitiveCaseResult> {
  const host = document.createElement("div");
  const rows = createRowsData(count);
  const start = performance.now();
  const result = await render(host, renderRows(rows));
  const duration = performance.now() - start;

  try {
    validateRows(host, rows);

    return { samples: [duration] };
  } finally {
    result.cleanup();
  }
}

async function runReplaceAllRows({
  count,
  document,
}: PrimitiveRunContext): Promise<PrimitiveCaseResult> {
  const host = document.createElement("div");
  const rows = createRowsData(count);
  const replacementRows = createReplacementRowsData(count);
  const initialResult = await render(host, renderRows(rows));

  try {
    validateRows(host, rows);

    const start = performance.now();
    const updateResult = await render(host, renderRows(replacementRows));
    const duration = performance.now() - start;

    validateRows(host, replacementRows);
    updateResult.cleanup();

    return { samples: [duration] };
  } finally {
    initialResult.cleanup();
  }
}

async function runUpdateEveryTenth({
  count,
  document,
}: PrimitiveRunContext): Promise<PrimitiveCaseResult> {
  const host = document.createElement("div");
  const rows = createRowsData(count);
  const updatedRows = updateEveryTenth(rows);
  const initialResult = await render(host, renderRows(rows));

  try {
    validateRows(host, rows);

    const start = performance.now();
    const updateResult = await render(host, renderRows(updatedRows));
    const duration = performance.now() - start;

    validateRows(host, updatedRows);
    updateResult.cleanup();

    return { samples: [duration] };
  } finally {
    initialResult.cleanup();
  }
}

async function runSelectRow({
  count,
  document,
}: PrimitiveRunContext): Promise<PrimitiveCaseResult> {
  const host = document.createElement("div");
  const rows = createRowsData(count);
  const selectedId = Math.floor(count / 2);
  const initialResult = await render(host, renderRows(rows));

  try {
    validateRows(host, rows);

    const start = performance.now();
    const updateResult = await render(host, renderRows(rows, selectedId));
    const duration = performance.now() - start;

    validateRows(host, rows);
    validateSelectedRow(host, selectedId);
    updateResult.cleanup();

    return { samples: [duration] };
  } finally {
    initialResult.cleanup();
  }
}

async function runAppendRows({
  count,
  document,
}: PrimitiveRunContext): Promise<PrimitiveCaseResult> {
  const host = document.createElement("div");
  const rows = createRowsData(count);
  const appendedRows = [...rows, ...createRowsDataFrom(count, 1_000)];
  const initialResult = await render(host, renderRows(rows));

  try {
    validateRows(host, rows);

    const start = performance.now();
    const updateResult = await render(host, renderRows(appendedRows));
    const duration = performance.now() - start;

    validateRows(host, appendedRows);
    updateResult.cleanup();

    return { samples: [duration] };
  } finally {
    initialResult.cleanup();
  }
}

async function runRemoveRow({
  count,
  document,
}: PrimitiveRunContext): Promise<PrimitiveCaseResult> {
  const host = document.createElement("div");
  const rows = createRowsData(count);
  const remainingRows = rows.filter(
    (_, index) => index !== Math.floor(count / 2),
  );
  const initialResult = await render(host, renderRows(rows));

  try {
    validateRows(host, rows);

    const start = performance.now();
    const updateResult = await render(host, renderRows(remainingRows));
    const duration = performance.now() - start;

    validateRows(host, remainingRows);
    updateResult.cleanup();

    return { samples: [duration] };
  } finally {
    initialResult.cleanup();
  }
}

async function runClearRows({
  count,
  document,
}: PrimitiveRunContext): Promise<PrimitiveCaseResult> {
  const host = document.createElement("div");
  const rows = createRowsData(count);
  const initialResult = await render(host, renderRows(rows));

  try {
    validateRows(host, rows);

    const start = performance.now();
    const updateResult = await render(host, renderRows([]));
    const duration = performance.now() - start;

    validateRows(host, []);
    updateResult.cleanup();

    return { samples: [duration] };
  } finally {
    initialResult.cleanup();
  }
}

async function runKeyedReverse({
  count,
  document,
}: PrimitiveRunContext): Promise<PrimitiveCaseResult> {
  const host = document.createElement("div");
  const rows = createRowsData(count);
  const initialResult = await render(host, renderRows(rows));

  try {
    validateRows(host, rows);
    const initialNodes = [...host.children];

    const start = performance.now();
    const updateResult = await render(host, renderRows([...rows].reverse()));
    const duration = performance.now() - start;

    validateRowsReversedWithNodeIdentity(host, rows, initialNodes);
    updateResult.cleanup();

    return { samples: [duration] };
  } finally {
    initialResult.cleanup();
  }
}

async function runTextBindingUpdate({
  count,
  document,
}: PrimitiveRunContext): Promise<PrimitiveCaseResult> {
  const host = document.createElement("div");
  const initialResult = await render(host, renderTextSpans(count, "0"));

  try {
    validateTextNodes(readTextNodes(host, count), "0");

    const start = performance.now();
    const updateResult = await render(host, renderTextSpans(count, "1"));
    const duration = performance.now() - start;

    validateTextNodes(readTextNodes(host, count), "1");
    updateResult.cleanup();

    return { samples: [duration] };
  } finally {
    initialResult.cleanup();
  }
}

async function runComputedFanOut({
  count,
  document,
}: PrimitiveRunContext): Promise<PrimitiveCaseResult> {
  const host = document.createElement("div");
  const initialResult = await render(host, renderTextSpans(count, "0"));

  try {
    validateTextNodes(readTextNodes(host, count), "0");

    const start = performance.now();
    const updateResult = await render(host, renderTextSpans(count, "1"));
    const duration = performance.now() - start;

    validateTextNodes(readTextNodes(host, count), "1");
    updateResult.cleanup();

    return { samples: [duration] };
  } finally {
    initialResult.cleanup();
  }
}

async function runComputedFanIn({
  count,
  document,
}: PrimitiveRunContext): Promise<PrimitiveCaseResult> {
  const host = document.createElement("div");
  const initialValues = Array.from({ length: count }, () => 0);
  const nextValues = Array.from({ length: count }, () => 1);
  const initialResult = await render(host, renderAggregate(initialValues));

  try {
    validateTextNodes(readTextNodes(host, 1), "0");

    const start = performance.now();
    const updateResult = await render(host, renderAggregate(nextValues));
    const duration = performance.now() - start;

    validateTextNodes(readTextNodes(host, 1), String(count));
    updateResult.cleanup();

    return { samples: [duration] };
  } finally {
    initialResult.cleanup();
  }
}

function renderAggregate(values: readonly number[]) {
  return h(
    "span",
    null,
    String(values.reduce((sum, value) => sum + value, 0)),
  );
}

async function runRepeatedMemory({
  count,
  document,
}: PrimitiveRunContext): Promise<PrimitiveCaseResult> {
  const host = document.createElement("div");
  const rows = createRowsData(count);
  const updatedRows = updateEveryTenth(rows);
  const before = process.memoryUsage().heapUsed;
  let cleanup: (() => void) | undefined;

  try {
    for (let iteration = 0; iteration < 5; iteration += 1) {
      cleanup?.();
      cleanup = (await render(host, renderRows(rows))).cleanup;
      cleanup();
      cleanup = (await render(host, renderRows(updatedRows))).cleanup;
      cleanup();
      cleanup = (await render(host, renderRows([]))).cleanup;
    }

    validateRows(host, []);

    return {
      samples: [Math.max(0, process.memoryUsage().heapUsed - before)],
      notes: ["heapUsed delta without forced GC"],
    };
  } finally {
    cleanup?.();
  }
}

function renderRows(rows: readonly RowFixture[], selectedId = -1) {
  return rows.map((row) =>
    h(
      "div",
      {
        class: selectedId === row.id ? "selected" : undefined,
        "data-key": String(row.id),
        "data-selected": selectedId === row.id ? "true" : undefined,
        key: row.id,
      },
      row.label,
    ),
  );
}

function renderTextSpans(count: number, value: string) {
  return Array.from({ length: count }, (_, index) =>
    h("span", { key: index }, value),
  );
}

function updateEveryTenth(rows: readonly RowFixture[]): RowFixture[] {
  return rows.map((row, index) =>
    index % 10 === 0 ? { ...row, label: `${row.label} updated` } : row,
  );
}

function readTextNodes(host: Node, expectedCount: number): Text[] {
  const nodes = collectTextNodes(host);

  if (nodes.length !== expectedCount) {
    throw new Error(`expected ${expectedCount} text nodes, received ${nodes.length}`);
  }

  return nodes;
}

function collectTextNodes(node: Node): Text[] {
  const nodes: Text[] = [];

  for (const child of node.childNodes) {
    if (child.nodeType === child.TEXT_NODE) {
      nodes.push(child as Text);
      continue;
    }

    nodes.push(...collectTextNodes(child));
  }

  return nodes;
}
