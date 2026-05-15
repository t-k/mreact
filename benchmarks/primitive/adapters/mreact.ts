import { cell } from "@reckona/mreact-reactive-core";
import { flushEffects } from "@reckona/mreact-reactive-core/testing";
import { bindList, bindTextBatch } from "@reckona/mreact-reactive-dom";
import {
  createRowsData,
  validateRows,
  validateRowsReversed,
} from "../fixtures/rows.js";
import type { RowFixture } from "../fixtures/rows.js";
import { validateTextNodes } from "../fixtures/text-binding.js";
import type {
  PrimitiveAdapter,
  PrimitiveCaseResult,
  PrimitiveRunContext,
} from "../types.js";

export const mreactAdapter: PrimitiveAdapter = {
  name: "mreact",
  version: "workspace",
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
  const marker = document.createComment("rows");
  const rows = createRowsData(count);
  const rowsCell = cell(rows);

  host.append(marker);

  const start = performance.now();
  const dispose = bindList(host, marker, () => rowsCell.get(), (row) =>
    createRowElement(document, row),
  );

  try {
    await flushEffects();
    const duration = performance.now() - start;

    validateRows(host, rows);

    return { samples: [duration] };
  } finally {
    dispose();
  }
}

async function runUpdateEveryTenth({
  count,
  document,
}: PrimitiveRunContext): Promise<PrimitiveCaseResult> {
  const host = document.createElement("div");
  const marker = document.createComment("rows");
  const rows = createRowsData(count);
  const updatedRows = updateEveryTenth(rows);
  const rowsCell = cell(rows);

  host.append(marker);

  const dispose = bindList(host, marker, () => rowsCell.get(), (row) =>
    createRowElement(document, row),
  );

  try {
    validateRows(host, rows);

    const start = performance.now();
    rowsCell.set(updatedRows);
    await flushEffects();
    const duration = performance.now() - start;

    validateRows(host, updatedRows);

    return { samples: [duration] };
  } finally {
    dispose();
  }
}

async function runKeyedReverse({
  count,
  document,
}: PrimitiveRunContext): Promise<PrimitiveCaseResult> {
  const host = document.createElement("div");
  const marker = document.createComment("rows");
  const rows = createRowsData(count);
  const rowsCell = cell(rows);

  host.append(marker);

  const dispose = bindList(
    host,
    marker,
    () => rowsCell.get(),
    (row) => createRowElement(document, row),
    { key: (row) => row.id },
  );

  try {
    validateRows(host, rows);

    const start = performance.now();
    rowsCell.set([...rows].reverse());
    await flushEffects();
    const duration = performance.now() - start;

    validateRowsReversed(host, rows);

    return { samples: [duration] };
  } finally {
    dispose();
  }
}

async function runTextBindingUpdate({
  count,
  document,
}: PrimitiveRunContext): Promise<PrimitiveCaseResult> {
  const host = document.createElement("div");
  const value = cell("0");
  const nodes = Array.from({ length: count }, () =>
    document.createTextNode(""),
  );

  host.append(...nodes);

  const dispose = bindTextBatch(nodes, () => value.get());

  try {
    validateTextNodes(readTextNodes(host, count), "0");

    const start = performance.now();
    value.set("1");
    await flushEffects();
    const duration = performance.now() - start;

    validateTextNodes(readTextNodes(host, count), "1");

    return { samples: [duration] };
  } finally {
    dispose();
  }
}

function createRowElement(document: Document, row: RowFixture): HTMLElement {
  const item = document.createElement("div");
  item.dataset.key = String(row.id);
  item.textContent = row.label;
  return item;
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
