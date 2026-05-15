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

function runCreateRows({
  count,
  document,
}: PrimitiveRunContext): PrimitiveCaseResult {
  const host = document.createElement("div");
  const rows = createRowsData(count);
  const start = performance.now();

  for (const row of rows) {
    host.append(createRowElement(document, row));
  }

  const duration = performance.now() - start;
  validateRows(host, rows);

  return {
    samples: [duration],
    notes: ["direct DOM fixture shared by adapters"],
  };
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
  const value = cell("0");
  const nodes = Array.from({ length: count }, () =>
    document.createTextNode(""),
  );
  const dispose = bindTextBatch(nodes, () => value.get());

  try {
    validateTextNodes(nodes, "0");

    const start = performance.now();
    value.set("1");
    await flushEffects();
    const duration = performance.now() - start;

    validateTextNodes(nodes, "1");

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
