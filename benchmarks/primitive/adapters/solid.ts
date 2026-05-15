import { createRoot, createSignal } from "solid-js";
import type { Setter } from "solid-js";
import { readPackageVersion } from "../../shared/env.js";
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

export const solidAdapter: PrimitiveAdapter = {
  name: "solid",
  version: readPackageVersion("solid-js"),
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

function runUpdateEveryTenth({
  count,
  document,
}: PrimitiveRunContext): PrimitiveCaseResult {
  const host = document.createElement("div");
  const rows = createRowsData(count);
  const updatedRows = updateEveryTenth(rows);
  const root = createRowsRoot(host, document, rows);

  try {
    validateRows(host, rows);

    const start = performance.now();
    root.setRows(updatedRows);
    root.renderRows();
    const duration = performance.now() - start;

    validateRows(host, updatedRows);

    return { samples: [duration] };
  } finally {
    root.dispose();
  }
}

function runKeyedReverse({
  count,
  document,
}: PrimitiveRunContext): PrimitiveCaseResult {
  const host = document.createElement("div");
  const rows = createRowsData(count);
  const root = createRowsRoot(host, document, rows);

  try {
    validateRows(host, rows);

    const start = performance.now();
    root.setRows([...rows].reverse());
    root.renderRows();
    const duration = performance.now() - start;

    validateRowsReversed(host, rows);

    return { samples: [duration] };
  } finally {
    root.dispose();
  }
}

function runTextBindingUpdate({
  count,
  document,
}: PrimitiveRunContext): PrimitiveCaseResult {
  const host = document.createElement("div");
  const textNodes = Array.from({ length: count }, () =>
    document.createTextNode(""),
  );

  host.append(...textNodes);

  const root = createRoot((dispose) => {
    const [value, setValue] = createSignal("0");

    const renderText = () => {
      const next = value();

      for (const node of textNodes) {
        node.data = next;
      }
    };

    renderText();

    return { dispose, renderText, setValue };
  });

  try {
    validateTextNodes(textNodes, "0");

    const start = performance.now();
    root.setValue("1");
    root.renderText();
    const duration = performance.now() - start;

    validateTextNodes(textNodes, "1");

    return { samples: [duration] };
  } finally {
    root.dispose();
  }
}

function createRowsRoot(
  host: Element,
  document: Document,
  rows: RowFixture[],
): {
  dispose: () => void;
  renderRows: () => void;
  setRows: Setter<RowFixture[]>;
} {
  return createRoot((dispose) => {
    const [currentRows, setRows] = createSignal(rows);

    const renderRows = () => {
      host.replaceChildren(
        ...currentRows().map((row) => createRowElement(document, row)),
      );
    };

    renderRows();

    return { dispose, renderRows, setRows };
  });
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
