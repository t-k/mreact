import { batch, cell } from "@reckona/mreact-reactive-core";
import type { Cell } from "@reckona/mreact-reactive-core";
import { flushEffects } from "@reckona/mreact-reactive-core/testing";
import { bindList, bindText, bindTextBatch } from "@reckona/mreact-reactive-dom";
import type { Dispose } from "@reckona/mreact-reactive-dom";
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

interface MreactRowFixture {
  id: number;
  label: Cell<string>;
}

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
  const rows = createMreactRowsData(count);
  const expectedRows = readMreactRows(rows);
  const updatedRows = prepareEveryTenthMreactUpdate(rows);
  const rowsCell = cell(rows);
  const textDisposers: Dispose[] = [];

  host.append(marker);

  const dispose = bindList(
    host,
    marker,
    () => rowsCell.get(),
    (row) => createReactiveRowElement(document, row, textDisposers),
    { key: (row) => row.id },
  );

  try {
    validateRows(host, expectedRows);

    const start = performance.now();
    batch(() => {
      for (const row of updatedRows) {
        row.label.set(row.nextLabel);
      }

      rowsCell.set(updatedRows.map(({ nextLabel: _nextLabel, ...row }) => row));
    });
    await flushEffects();
    const duration = performance.now() - start;

    validateRows(host, readMreactRows(rowsCell.get()));

    return { samples: [duration] };
  } finally {
    dispose();
    for (const disposeText of textDisposers) {
      disposeText();
    }
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
    const initialNodes = [...host.children];

    const start = performance.now();
    rowsCell.set([...rows].reverse());
    await flushEffects();
    const duration = performance.now() - start;

    validateRowsReversedWithNodeIdentity(host, rows, initialNodes);

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

function createReactiveRowElement(
  document: Document,
  row: MreactRowFixture,
  textDisposers: Dispose[],
): HTMLElement {
  const item = document.createElement("div");
  const text = document.createTextNode(row.label.get());

  item.dataset.key = String(row.id);
  item.append(text);
  textDisposers.push(bindText(text, () => row.label.get()));

  return item;
}

function createMreactRowsData(count: number): MreactRowFixture[] {
  return createRowsData(count).map((row) => ({
    id: row.id,
    label: cell(row.label),
  }));
}

function readMreactRows(rows: readonly MreactRowFixture[]): RowFixture[] {
  return rows.map((row) => ({
    id: row.id,
    label: row.label.get(),
  }));
}

function prepareEveryTenthMreactUpdate(
  rows: readonly MreactRowFixture[],
): Array<MreactRowFixture & { nextLabel: string }> {
  return rows.map((row, index) => ({
    ...row,
    nextLabel:
      index % 10 === 0 ? `${row.label.get()} updated` : row.label.get(),
  }));
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
