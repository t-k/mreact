import type * as Solid from "solid-js";
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

// solid-js resolves to its server runtime under Node. The benchmark needs the
// client reactive runtime so signal writes drive DOM effects in this process.
// @ts-expect-error solid-js does not publish declarations for dist subpaths.
import * as solidClientRuntime from "solid-js/dist/solid.js";

const { createComputed, createRoot, createSignal, mapArray } =
  solidClientRuntime as Pick<
    typeof Solid,
    "createComputed" | "createRoot" | "createSignal" | "mapArray"
  >;

export const solidAdapterDebugHooks: {
  onRowsCommitted: ((host: Element) => void) | undefined;
} = {
  onRowsCommitted: undefined,
};

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
  const root = createRowsRoot(host, document, rows);
  const duration = performance.now() - start;

  try {
    validateRows(host, rows);

    return { samples: [duration] };
  } finally {
    root.dispose();
  }
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

    createComputed(() => {
      const next = value();

      for (const node of textNodes) {
        node.data = next;
      }
    });

    return { dispose, setValue };
  });

  try {
    validateTextNodes(textNodes, "0");

    const start = performance.now();
    root.setValue("1");
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
  setRows: Solid.Setter<RowFixture[]>;
} {
  return createRoot((dispose) => {
    const [currentRows, setRows] = createSignal(rows);
    const marker = document.createComment("solid rows");
    const mappedRows = mapArray(currentRows, (row) =>
      createRowElement(document, row),
    );
    let previousNodes: HTMLElement[] = [];

    host.append(marker);
    createComputed(() => {
      const nextNodes = mappedRows();
      reconcileBeforeMarker(host, marker, previousNodes, nextNodes);
      previousNodes = [...nextNodes];
      solidAdapterDebugHooks.onRowsCommitted?.(host);
    });

    return { dispose, setRows };
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

function reconcileBeforeMarker(
  host: Element,
  marker: ChildNode,
  previousNodes: readonly HTMLElement[],
  nextNodes: readonly HTMLElement[],
): void {
  const nextNodeSet = new Set(nextNodes);

  for (const node of previousNodes) {
    if (!nextNodeSet.has(node)) {
      node.remove();
    }
  }

  for (const node of nextNodes) {
    host.insertBefore(node, marker);
  }
}
