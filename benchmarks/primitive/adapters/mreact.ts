import { batch, cell, computed, effect } from "@reckona/mreact-reactive-core";
import type { Cell } from "@reckona/mreact-reactive-core";
import { flushEffects } from "@reckona/mreact-reactive-core/testing";
import { bindEvent, bindList, bindText, bindTextBatch } from "@reckona/mreact-reactive-dom";
import type { Dispose } from "@reckona/mreact-reactive-dom";
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
import { validateTextNodes } from "../fixtures/text-binding.js";
import {
  calculateHeapDelta,
  forcedGcMemoryNote,
  memoryStressCycles,
  readHeapUsedAfterForcedGc,
} from "../memory.js";
import type { PrimitiveAdapter, PrimitiveCaseResult, PrimitiveRunContext } from "../types.js";

interface MreactRowFixture {
  id: number;
  label: Cell<string>;
}

export const mreactAdapter: PrimitiveAdapter = {
  name: "mreact",
  version: "workspace",
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
    "computed fan-in 1k": runComputedFanIn,
    "repeated create update clear memory": runRepeatedMemory,
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
  const dispose = bindList(
    host,
    marker,
    () => rowsCell.get(),
    (row) => createRowElement(document, row),
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

async function runReplaceAllRows({
  count,
  document,
}: PrimitiveRunContext): Promise<PrimitiveCaseResult> {
  const host = document.createElement("div");
  const marker = document.createComment("rows");
  const rows = createRowsData(count);
  const replacementRows = createReplacementRowsData(count);
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
    rowsCell.set(replacementRows);
    await flushEffects();
    const duration = performance.now() - start;

    validateRows(host, replacementRows);

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
    });
    await flushEffects();
    const duration = performance.now() - start;

    validateRows(host, readMreactRows(rows));

    return { samples: [duration] };
  } finally {
    dispose();
    for (const disposeText of textDisposers) {
      disposeText();
    }
  }
}

async function runSelectRow({
  count,
  document,
}: PrimitiveRunContext): Promise<PrimitiveCaseResult> {
  const host = document.createElement("div");
  const marker = document.createComment("rows");
  const rows = createRowsData(count);
  const selectedId = Math.floor(count / 2);
  const selectedCell = cell(-1);
  const rowsCell = cell(rows);
  const rowElements = new Map<number, HTMLElement>();

  host.append(marker);
  const dispose = bindList(
    host,
    marker,
    () => rowsCell.get(),
    (row) => {
      const item = createRowElement(document, row);
      rowElements.set(row.id, item);
      return item;
    },
    { key: (row) => row.id },
  );
  let previousSelectedId = -1;
  const disposeSelection = effect(() => {
    const nextSelectedId = selectedCell.get();

    if (Object.is(previousSelectedId, nextSelectedId)) {
      return;
    }

    const previous = rowElements.get(previousSelectedId);
    if (previous !== undefined) {
      previous.className = "";
      previous.removeAttribute("data-selected");
    }

    const next = rowElements.get(nextSelectedId);
    if (next !== undefined) {
      next.className = "selected";
      next.dataset.selected = "true";
    }

    previousSelectedId = nextSelectedId;
  });

  try {
    validateRows(host, rows);

    const start = performance.now();
    selectedCell.set(selectedId);
    await flushEffects();
    const duration = performance.now() - start;

    validateRows(host, rows);
    validateSelectedRow(host, selectedId);

    return { samples: [duration] };
  } finally {
    disposeSelection();
    dispose();
  }
}

async function runAppendRows({
  count,
  document,
}: PrimitiveRunContext): Promise<PrimitiveCaseResult> {
  const host = document.createElement("div");
  const marker = document.createComment("rows");
  const rows = createRowsData(count);
  const appendedRows = [...rows, ...createRowsDataFrom(count, 1_000)];
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
    rowsCell.set(appendedRows);
    await flushEffects();
    const duration = performance.now() - start;

    validateRows(host, appendedRows);

    return { samples: [duration] };
  } finally {
    dispose();
  }
}

async function runRemoveRow({
  count,
  document,
}: PrimitiveRunContext): Promise<PrimitiveCaseResult> {
  const host = document.createElement("div");
  const marker = document.createComment("rows");
  const rows = createRowsData(count);
  const removeIndex = Math.floor(count / 2);
  const remainingRows = rows.filter((_, index) => index !== removeIndex);
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
    rowsCell.set(remainingRows);
    await flushEffects();
    const duration = performance.now() - start;

    validateRows(host, remainingRows);

    return { samples: [duration] };
  } finally {
    dispose();
  }
}

async function runClearRows({
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
    rowsCell.set([]);
    await flushEffects();
    const duration = performance.now() - start;

    validateRows(host, []);

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

function runCreateEventTargets({ count, document }: PrimitiveRunContext): PrimitiveCaseResult {
  const host = document.createElement("div");
  const onClick = () => {};
  const start = performance.now();
  const disposers: Array<() => void> = [];

  document.body.append(host);

  for (let index = 0; index < count; index += 1) {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.index = String(index);
    button.textContent = String(index);
    host.append(button);
    disposers.push(bindEvent(button, "click", onClick));
  }

  const duration = performance.now() - start;
  validateEventTargets(host, count);

  for (const dispose of disposers) {
    dispose();
  }

  return { samples: [duration] };
}

async function runComputedFanOut({
  count,
  document,
}: PrimitiveRunContext): Promise<PrimitiveCaseResult> {
  const host = document.createElement("div");
  const value = cell(0);
  const derived = computed(() => String(value.get()));
  const nodes = Array.from({ length: count }, () => document.createTextNode(""));

  host.append(...nodes);
  const dispose = bindTextBatch(nodes, () => derived.get());

  try {
    validateTextNodes(readTextNodes(host, count), "0");

    const start = performance.now();
    value.set(1);
    await flushEffects();
    const duration = performance.now() - start;

    validateTextNodes(readTextNodes(host, count), "1");

    return { samples: [duration] };
  } finally {
    dispose();
  }
}

async function runComputedFanIn({
  count,
  document,
}: PrimitiveRunContext): Promise<PrimitiveCaseResult> {
  const host = document.createElement("div");
  const values = Array.from({ length: count }, () => cell(0));
  const total = computed(() => values.reduce((sum, value) => sum + value.get(), 0));
  const text = document.createTextNode("");

  host.append(text);
  const dispose = bindText(text, () => total.get());

  try {
    validateTextNodes([text], "0");

    const start = performance.now();
    batch(() => {
      for (const value of values) {
        value.set(1);
      }
    });
    await flushEffects();
    const duration = performance.now() - start;

    validateTextNodes([text], String(count));

    return { samples: [duration] };
  } finally {
    dispose();
  }
}

async function runRepeatedMemory({
  count,
  document,
}: PrimitiveRunContext): Promise<PrimitiveCaseResult> {
  const host = document.createElement("div");
  const marker = document.createComment("rows");
  const rowsCell = cell<RowFixture[]>([]);
  const rows = createRowsData(count);
  const updatedRows = updateEveryTenth(rows);

  host.append(marker);
  const dispose = bindList(
    host,
    marker,
    () => rowsCell.get(),
    (row) => createRowElement(document, row),
    { key: (row) => row.id },
  );
  const before = await readHeapUsedAfterForcedGc();

  try {
    for (let iteration = 0; iteration < memoryStressCycles; iteration += 1) {
      rowsCell.set(rows);
      await flushEffects();
      rowsCell.set(updatedRows);
      await flushEffects();
      rowsCell.set([]);
      await flushEffects();
    }

    validateRows(host, []);

    return {
      samples: [calculateHeapDelta(await readHeapUsedAfterForcedGc(), before)],
      notes: [forcedGcMemoryNote],
    };
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
  const nodes = Array.from({ length: count }, () => document.createTextNode(""));

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
  item.setAttribute("data-key", String(row.id));
  item.textContent = row.label;
  return item;
}

function createReactiveRowElement(
  document: Document,
  row: MreactRowFixture,
  textDisposers: Dispose[],
): HTMLElement {
  const item = document.createElement("div");
  const text = document.createTextNode("");

  item.setAttribute("data-key", String(row.id));
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
  return rows
    .filter((_, index) => index % 10 === 0)
    .map((row) => ({
      ...row,
      nextLabel: `${row.label.get()} updated`,
    }));
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
