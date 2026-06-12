import { readPackageVersion } from "../../shared/env.js";
import { validateEventTargets } from "../fixtures/event-targets.js";
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
import {
  calculateHeapDelta,
  forcedGcMemoryNote,
  memoryStressCycles,
  readHeapUsedAfterForcedGc,
} from "../memory.js";
import type { PrimitiveAdapter, PrimitiveCaseResult, PrimitiveRunContext } from "../types.js";

interface SimpleDomAdapterOptions {
  name: PrimitiveAdapter["name"];
  packageName: string;
}

export function createSimpleDomPrimitiveAdapter(
  options: SimpleDomAdapterOptions,
): PrimitiveAdapter {
  return {
    name: options.name,
    version: readPackageVersion(options.packageName),
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
}

function runCreateRows({ count, document }: PrimitiveRunContext): PrimitiveCaseResult {
  const host = document.createElement("div");
  const rows = createRowsData(count);
  const start = performance.now();
  renderRows(host, document, rows);
  const duration = performance.now() - start;

  validateRows(host, rows);
  return { samples: [duration] };
}

function runReplaceAllRows({ count, document }: PrimitiveRunContext): PrimitiveCaseResult {
  const host = document.createElement("div");
  const rows = createRowsData(count);
  const replacementRows = createReplacementRowsData(count);
  renderRows(host, document, rows);
  validateRows(host, rows);

  const start = performance.now();
  renderRows(host, document, replacementRows);
  const duration = performance.now() - start;

  validateRows(host, replacementRows);
  return { samples: [duration] };
}

function runUpdateEveryTenth({ count, document }: PrimitiveRunContext): PrimitiveCaseResult {
  const host = document.createElement("div");
  const rows = createRowsData(count);
  const updatedRows = updateEveryTenth(rows);
  renderRows(host, document, rows);
  validateRows(host, rows);

  const children = [...host.children] as HTMLElement[];
  const start = performance.now();
  for (let index = 0; index < updatedRows.length; index += 10) {
    const child = children[index];
    const row = updatedRows[index];
    if (child !== undefined && row !== undefined) {
      child.textContent = row.label;
    }
  }
  const duration = performance.now() - start;

  validateRows(host, updatedRows);
  return { samples: [duration] };
}

function runSelectRow({ count, document }: PrimitiveRunContext): PrimitiveCaseResult {
  const host = document.createElement("div");
  const rows = createRowsData(count);
  const selectedId = Math.floor(count / 2);
  renderRows(host, document, rows);
  validateRows(host, rows);

  const start = performance.now();
  const selected = host.children[selectedId] as HTMLElement | undefined;
  if (selected !== undefined) {
    selected.className = "selected";
    selected.dataset.selected = "true";
  }
  const duration = performance.now() - start;

  validateRows(host, rows);
  validateSelectedRow(host, selectedId);
  return { samples: [duration] };
}

function runAppendRows({ count, document }: PrimitiveRunContext): PrimitiveCaseResult {
  const host = document.createElement("div");
  const rows = createRowsData(count);
  const appendedRows = [...rows, ...createRowsDataFrom(count, 1_000)];
  renderRows(host, document, rows);
  validateRows(host, rows);

  const start = performance.now();
  host.append(...createRowElements(document, createRowsDataFrom(count, 1_000)));
  const duration = performance.now() - start;

  validateRows(host, appendedRows);
  return { samples: [duration] };
}

function runRemoveRow({ count, document }: PrimitiveRunContext): PrimitiveCaseResult {
  const host = document.createElement("div");
  const rows = createRowsData(count);
  const removeIndex = Math.floor(count / 2);
  const remainingRows = rows.filter((_, index) => index !== removeIndex);
  renderRows(host, document, rows);
  validateRows(host, rows);

  const start = performance.now();
  host.children[removeIndex]?.remove();
  const duration = performance.now() - start;

  validateRows(host, remainingRows);
  return { samples: [duration] };
}

function runClearRows({ count, document }: PrimitiveRunContext): PrimitiveCaseResult {
  const host = document.createElement("div");
  const rows = createRowsData(count);
  renderRows(host, document, rows);
  validateRows(host, rows);

  const start = performance.now();
  host.replaceChildren();
  const duration = performance.now() - start;

  validateRows(host, []);
  return { samples: [duration] };
}

function runKeyedReverse({ count, document }: PrimitiveRunContext): PrimitiveCaseResult {
  const host = document.createElement("div");
  const rows = createRowsData(count);
  renderRows(host, document, rows);
  validateRows(host, rows);
  const initialNodes = [...host.children];

  const start = performance.now();
  host.replaceChildren(...[...initialNodes].reverse());
  const duration = performance.now() - start;

  validateRowsReversedWithNodeIdentity(host, rows, initialNodes);
  return { samples: [duration] };
}

function runCreateEventTargets({ count, document }: PrimitiveRunContext): PrimitiveCaseResult {
  const host = document.createElement("div");
  const listener = () => undefined;
  const start = performance.now();

  for (let index = 0; index < count; index += 1) {
    const button = document.createElement("button");
    button.dataset.index = String(index);
    button.addEventListener("click", listener);
    host.append(button);
  }

  const duration = performance.now() - start;
  validateEventTargets(host, count);
  return { samples: [duration] };
}

function runTextBindingUpdate({ count, document }: PrimitiveRunContext): PrimitiveCaseResult {
  const nodes = Array.from({ length: count }, () => document.createTextNode("0"));
  const host = document.createElement("div");
  host.append(...nodes);

  const start = performance.now();
  for (const node of nodes) {
    node.data = "1";
  }
  const duration = performance.now() - start;

  validateTextNodes(nodes, "1");
  return { samples: [duration] };
}

function runComputedFanOut({ count, document }: PrimitiveRunContext): PrimitiveCaseResult {
  const nodes = Array.from({ length: count }, () => document.createTextNode("0"));
  const host = document.createElement("div");
  host.append(...nodes);

  const start = performance.now();
  const next = String(1 * 2);
  for (const node of nodes) {
    node.data = next;
  }
  const duration = performance.now() - start;

  validateTextNodes(nodes, "2");
  return { samples: [duration] };
}

function runComputedFanIn({ count, document }: PrimitiveRunContext): PrimitiveCaseResult {
  const values = Array.from({ length: count }, (_, index) => index);
  const text = document.createTextNode(String(sum(values)));
  const host = document.createElement("div");
  host.append(text);

  const start = performance.now();
  const updatedValues = values.map((value) => value + 1);
  text.data = String(sum(updatedValues));
  const duration = performance.now() - start;

  validateTextNodes([text], String(sum(updatedValues)));
  return { samples: [duration] };
}

async function runRepeatedMemory({
  count,
  document,
}: PrimitiveRunContext): Promise<PrimitiveCaseResult> {
  const before = await readHeapUsedAfterForcedGc();
  const host = document.createElement("div");

  for (let cycle = 0; cycle < memoryStressCycles; cycle += 1) {
    const rows = createRowsData(count);
    renderRows(host, document, rows);
    validateRows(host, rows);
    renderRows(host, document, createReplacementRowsData(count));
    host.replaceChildren();
  }

  const after = await readHeapUsedAfterForcedGc();
  return {
    samples: [calculateHeapDelta(after, before)],
    notes: [forcedGcMemoryNote],
  };
}

function renderRows(host: Element, document: Document, rows: readonly RowFixture[]): void {
  host.replaceChildren(...createRowElements(document, rows));
}

function createRowElements(document: Document, rows: readonly RowFixture[]): HTMLElement[] {
  return rows.map((row) => {
    const item = document.createElement("div");
    item.dataset.key = String(row.id);
    item.textContent = row.label;
    return item;
  });
}

function updateEveryTenth(rows: readonly RowFixture[]): RowFixture[] {
  return rows.map((row, index) =>
    index % 10 === 0
      ? {
          ...row,
          label: `${row.label} updated`,
        }
      : row,
  );
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}
