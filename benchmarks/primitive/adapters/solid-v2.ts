import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import type * as Solid from "solid-js-2";
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
import { validateTextNodes } from "../fixtures/text-binding.js";
import {
  calculateHeapDelta,
  forcedGcMemoryNote,
  memoryStressCycles,
  readHeapUsedAfterForcedGc,
} from "../memory.js";
import type { PrimitiveAdapter, PrimitiveCaseResult, PrimitiveRunContext } from "../types.js";

const require = createRequire(import.meta.url);

// solid-js-2 resolves to its server runtime under Node and does not export its
// browser runtime as a package subpath. The benchmark intentionally loads the
// package file directly so signal writes drive DOM effects in this process.
const solidClientRuntime = (await import(
  pathToFileURL(join(dirname(require.resolve("solid-js-2/package.json")), "dist", "solid.js")).href
)) as typeof Solid;

const { createRenderEffect, createRoot, createSignal, flush, mapArray } =
  solidClientRuntime as Pick<
    typeof Solid,
    "createRenderEffect" | "createRoot" | "createSignal" | "flush" | "mapArray"
  >;

function createComputed(fn: () => void): void {
  createRenderEffect(fn, () => undefined);
}

export const solidV2AdapterDebugHooks: {
  onRowsCommitted: ((host: Element) => void) | undefined;
} = {
  onRowsCommitted: undefined,
};

export const solidV2Adapter: PrimitiveAdapter = {
  name: "solid-v2",
  version: readPackageVersion("solid-js-2"),
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
    "source write with subscriber 1k": runSourceWriteWithSubscriber,
    "text binding update 1k": runTextBindingUpdate,
    "computed fan-out 1k": runComputedFanOut,
    "computed fan-in 1k": runComputedFanIn,
    "source write 1k": runSourceWrite,
    "repeated create update clear memory": runRepeatedMemory,
  },
};

function runCreateRows({ count, document }: PrimitiveRunContext): PrimitiveCaseResult {
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

function runUpdateEveryTenth({ count, document }: PrimitiveRunContext): PrimitiveCaseResult {
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

function runReplaceAllRows({ count, document }: PrimitiveRunContext): PrimitiveCaseResult {
  const host = document.createElement("div");
  const rows = createRowsData(count);
  const replacementRows = createReplacementRowsData(count);
  const root = createRowsRoot(host, document, rows);

  try {
    validateRows(host, rows);

    const start = performance.now();
    root.setRows(replacementRows);
    const duration = performance.now() - start;

    validateRows(host, replacementRows);

    return { samples: [duration] };
  } finally {
    root.dispose();
  }
}

function runSelectRow({ count, document }: PrimitiveRunContext): PrimitiveCaseResult {
  const host = document.createElement("div");
  const rows = createRowsData(count);
  const selectedId = Math.floor(count / 2);
  const root = createSelectableRowsRoot(host, document, rows);

  try {
    validateRows(host, rows);

    const start = performance.now();
    root.setSelectedId(selectedId);
    const duration = performance.now() - start;

    validateRows(host, rows);
    validateSelectedRow(host, selectedId);

    return { samples: [duration] };
  } finally {
    root.dispose();
  }
}

function runAppendRows({ count, document }: PrimitiveRunContext): PrimitiveCaseResult {
  const host = document.createElement("div");
  const rows = createRowsData(count);
  const appendedRows = [...rows, ...createRowsDataFrom(count, 1_000)];
  const root = createRowsRoot(host, document, rows);

  try {
    validateRows(host, rows);

    const start = performance.now();
    root.setRows(appendedRows);
    const duration = performance.now() - start;

    validateRows(host, appendedRows);

    return { samples: [duration] };
  } finally {
    root.dispose();
  }
}

function runRemoveRow({ count, document }: PrimitiveRunContext): PrimitiveCaseResult {
  const host = document.createElement("div");
  const rows = createRowsData(count);
  const remainingRows = rows.filter((_, index) => index !== Math.floor(count / 2));
  const root = createRowsRoot(host, document, rows);

  try {
    validateRows(host, rows);

    const start = performance.now();
    root.setRows(remainingRows);
    const duration = performance.now() - start;

    validateRows(host, remainingRows);

    return { samples: [duration] };
  } finally {
    root.dispose();
  }
}

function runClearRows({ count, document }: PrimitiveRunContext): PrimitiveCaseResult {
  const host = document.createElement("div");
  const rows = createRowsData(count);
  const root = createRowsRoot(host, document, rows);

  try {
    validateRows(host, rows);

    const start = performance.now();
    root.setRows([]);
    const duration = performance.now() - start;

    validateRows(host, []);

    return { samples: [duration] };
  } finally {
    root.dispose();
  }
}

function runKeyedReverse({ count, document }: PrimitiveRunContext): PrimitiveCaseResult {
  const host = document.createElement("div");
  const rows = createRowsData(count);
  const root = createRowsRoot(host, document, rows);

  try {
    validateRows(host, rows);
    const initialNodes = [...host.children];

    const start = performance.now();
    root.setRows([...rows].reverse());
    const duration = performance.now() - start;

    validateRowsReversedWithNodeIdentity(host, rows, initialNodes);

    return { samples: [duration] };
  } finally {
    root.dispose();
  }
}

function runCreateEventTargets({ count, document }: PrimitiveRunContext): PrimitiveCaseResult {
  const host = document.createElement("div");
  const onClick = () => {};
  const start = performance.now();

  for (let index = 0; index < count; index += 1) {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.index = String(index);
    button.textContent = String(index);
    button.addEventListener("click", onClick);
    host.append(button);
  }

  const duration = performance.now() - start;
  validateEventTargets(host, count);

  return { samples: [duration] };
}

function runTextBindingUpdate({ count, document }: PrimitiveRunContext): PrimitiveCaseResult {
  const host = document.createElement("div");
  const textNodes = Array.from({ length: count }, () => document.createTextNode(""));

  host.append(...textNodes);

  const root = createRoot((dispose) => {
    const [value, setValue] = createSignal("0");

    createComputed(() => {
      const next = value();

      for (const node of textNodes) {
        node.data = next;
      }
    });

    return {
      dispose,
      setValue(next: string) {
        const result = setValue(next);
        flush();
        return result;
      },
    };
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

function runComputedFanOut({ count, document }: PrimitiveRunContext): PrimitiveCaseResult {
  const host = document.createElement("div");
  const textNodes = Array.from({ length: count }, () => document.createTextNode(""));

  host.append(...textNodes);

  const root = createRoot((dispose) => {
    const [value, setValue] = createSignal(0);

    createComputed(() => {
      const next = String(value());

      for (const node of textNodes) {
        node.data = next;
      }
    });

    return {
      dispose,
      setValue(next: number) {
        const result = setValue(next);
        flush();
        return result;
      },
    };
  });

  try {
    validateTextNodes(textNodes, "0");

    const start = performance.now();
    root.setValue(1);
    const duration = performance.now() - start;

    validateTextNodes(textNodes, "1");

    return { samples: [duration] };
  } finally {
    root.dispose();
  }
}

function runComputedFanIn({ count, document }: PrimitiveRunContext): PrimitiveCaseResult {
  const host = document.createElement("div");
  const text = document.createTextNode("");
  host.append(text);

  const root = createRoot((dispose) => {
    const signals = Array.from({ length: count }, () => createSignal(0));

    createComputed(() => {
      let total = 0;

      for (const [value] of signals) {
        total += value();
      }

      text.data = String(total);
    });

    return {
      dispose,
      setAll(next: number) {
        for (const [, setValue] of signals) {
          setValue(next);
        }
        flush();
      },
    };
  });

  try {
    validateTextNodes([text], "0");

    const start = performance.now();
    root.setAll(1);
    const duration = performance.now() - start;

    validateTextNodes([text], String(count));

    return { samples: [duration] };
  } finally {
    root.dispose();
  }
}

function runSourceWrite({ count }: PrimitiveRunContext): PrimitiveCaseResult {
  const root = createRoot((dispose) => {
    const signals = Array.from({ length: count }, () => createSignal(0));

    return {
      dispose,
      setAll(next: number) {
        for (let index = 0; index < signals.length; index += 1) {
          signals[index]![1](next);
        }
        flush();
      },
      sum() {
        let total = 0;
        for (let index = 0; index < signals.length; index += 1) {
          total += signals[index]![0]();
        }
        return total;
      },
    };
  });

  try {
    const start = performance.now();
    root.setAll(1);
    const duration = performance.now() - start;
    const total = root.sum();

    if (total !== count) {
      throw new Error(`expected source total ${count}, received ${total}`);
    }

    return { samples: [duration] };
  } finally {
    root.dispose();
  }
}

function runSourceWriteWithSubscriber({ count }: PrimitiveRunContext): PrimitiveCaseResult {
  const root = createRoot((dispose) => {
    const signals = Array.from({ length: count }, () => createSignal(0));
    let observedTotal = 0;

    for (const [value] of signals) {
      createComputed(() => {
        observedTotal += value();
      });
    }
    flush();
    observedTotal = 0;

    return {
      dispose,
      observedTotal() {
        return observedTotal;
      },
      setAll(next: number) {
        for (let index = 0; index < signals.length; index += 1) {
          signals[index]![1](next);
        }
        flush();
      },
    };
  });

  try {
    const start = performance.now();
    root.setAll(1);
    const duration = performance.now() - start;
    const total = root.observedTotal();

    if (total !== count) {
      throw new Error(`expected subscribed source total ${count}, received ${total}`);
    }

    return { samples: [duration] };
  } finally {
    root.dispose();
  }
}

async function runRepeatedMemory({
  count,
  document,
}: PrimitiveRunContext): Promise<PrimitiveCaseResult> {
  const host = document.createElement("div");
  const rows = createRowsData(count);
  const updatedRows = updateEveryTenth(rows);
  const root = createRowsRoot(host, document, []);
  const before = await readHeapUsedAfterForcedGc();

  try {
    for (let iteration = 0; iteration < memoryStressCycles; iteration += 1) {
      root.setRows(rows);
      root.setRows(updatedRows);
      root.setRows([]);
    }

    validateRows(host, []);

    return {
      samples: [calculateHeapDelta(await readHeapUsedAfterForcedGc(), before)],
      notes: [forcedGcMemoryNote],
    };
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
    const mappedRows = mapArray(currentRows, (row) => createRowElement(document, row));
    let previousNodes: HTMLElement[] = [];

    host.append(marker);
    createComputed(() => {
      const nextNodes = mappedRows();
      reconcileBeforeMarker(host, marker, previousNodes, nextNodes);
      previousNodes = [...nextNodes];
      solidV2AdapterDebugHooks.onRowsCommitted?.(host);
    });

    return {
      dispose,
      setRows(nextRows: RowFixture[]) {
        const result = setRows(nextRows);
        flush();
        return result;
      },
    };
  });
}

function createSelectableRowsRoot(
  host: Element,
  document: Document,
  rows: RowFixture[],
): {
  dispose: () => void;
  setSelectedId: Solid.Setter<number>;
} {
  return createRoot((dispose) => {
    const [selectedId, setSelectedId] = createSignal(-1);
    const marker = document.createComment("solid selectable rows");
    const rowNodes = rows.map((row) => createSelectableRowElement(document, row, selectedId));

    host.append(...rowNodes, marker);

    return {
      dispose,
      setSelectedId(nextSelectedId: number) {
        const result = setSelectedId(nextSelectedId);
        flush();
        return result;
      },
    };
  });
}

function createRowElement(document: Document, row: RowFixture): HTMLElement {
  const item = document.createElement("div");
  item.dataset.key = String(row.id);
  item.textContent = row.label;
  return item;
}

function createSelectableRowElement(
  document: Document,
  row: RowFixture,
  selectedId: () => number,
): HTMLElement {
  const item = createRowElement(document, row);

  createComputed(() => {
    const selected = selectedId() === row.id;
    item.className = selected ? "selected" : "";

    if (selected) {
      item.setAttribute("data-selected", "true");
    } else {
      item.removeAttribute("data-selected");
    }
  });

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
