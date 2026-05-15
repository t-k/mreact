import { readPackageVersion } from "../../shared/env.js";
import {
  createRowsData,
  validateRows,
  validateRowsReversedWithNodeIdentity,
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
    "update every 10th in 10k rows": runUpdateEveryTenth,
    "keyed reverse 1k rows": runKeyedReverse,
    "text binding update 1k": runTextBindingUpdate,
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

function renderRows(rows: readonly RowFixture[]) {
  return rows.map((row) =>
    h("div", { "data-key": String(row.id), key: row.id }, row.label),
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
