import { Fragment, createElement, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
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

export const reactAdapter: PrimitiveAdapter = {
  name: "react",
  version: readPackageVersion("react"),
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
  const root = createRoot(host);
  const start = performance.now();

  try {
    flushSync(() => root.render(createElement(Rows, { rows })));
    const duration = performance.now() - start;

    validateRows(host, rows);

    return { samples: [duration] };
  } finally {
    root.unmount();
  }
}

function runUpdateEveryTenth({
  count,
  document,
}: PrimitiveRunContext): PrimitiveCaseResult {
  const host = document.createElement("div");
  const rows = createRowsData(count);
  const updatedRows = updateEveryTenth(rows);
  let setRows: Dispatch<SetStateAction<RowFixture[]>> | undefined;

  function App() {
    const [currentRows, setCurrentRows] = useState(rows);
    setRows = setCurrentRows;

    return createElement(Rows, { rows: currentRows });
  }

  const root = createRoot(host);

  try {
    flushSync(() => root.render(createElement(App)));
    validateRows(host, rows);

    const start = performance.now();
    flushSync(() => setRows!(updatedRows));
    const duration = performance.now() - start;

    validateRows(host, updatedRows);

    return { samples: [duration] };
  } finally {
    root.unmount();
  }
}

function runKeyedReverse({
  count,
  document,
}: PrimitiveRunContext): PrimitiveCaseResult {
  const host = document.createElement("div");
  const rows = createRowsData(count);
  let setRows: Dispatch<SetStateAction<RowFixture[]>> | undefined;

  function App() {
    const [currentRows, setCurrentRows] = useState(rows);
    setRows = setCurrentRows;

    return createElement(Rows, { rows: currentRows });
  }

  const root = createRoot(host);

  try {
    flushSync(() => root.render(createElement(App)));
    validateRows(host, rows);

    const start = performance.now();
    flushSync(() => setRows!([...rows].reverse()));
    const duration = performance.now() - start;

    validateRowsReversed(host, rows);

    return { samples: [duration] };
  } finally {
    root.unmount();
  }
}

function runTextBindingUpdate({
  count,
  document,
}: PrimitiveRunContext): PrimitiveCaseResult {
  const host = document.createElement("div");
  let setValue: Dispatch<SetStateAction<string>> | undefined;

  function App() {
    const [value, setCurrentValue] = useState("0");
    setValue = setCurrentValue;

    return createElement(
      Fragment,
      null,
      Array.from({ length: count }, (_, index) =>
        createElement("span", { key: index }, value),
      ),
    );
  }

  const root = createRoot(host);

  try {
    flushSync(() => root.render(createElement(App)));
    validateTextNodes(readTextNodes(host, count), "0");

    const start = performance.now();
    flushSync(() => setValue!("1"));
    const duration = performance.now() - start;

    validateTextNodes(readTextNodes(host, count), "1");

    return { samples: [duration] };
  } finally {
    root.unmount();
  }
}

function Rows({ rows }: { rows: readonly RowFixture[] }) {
  return createElement(
    Fragment,
    null,
    rows.map((row) =>
      createElement("div", { "data-key": row.id, key: row.id }, row.label),
    ),
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
