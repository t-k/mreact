import { Fragment, createElement, createRoot, flushSync, useState } from "@reckona/mreact-compat";
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

type StateSetter<T> = (value: T | ((previous: T) => T)) => void;

export const reactCompatAdapter: PrimitiveAdapter = {
  name: "mreact react-compat",
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
    "computed fan-in 1k (single array write)": runComputedFanIn,
    "repeated create update clear memory": runRepeatedMemory,
  },
};

function runCreateRows({ count, document }: PrimitiveRunContext): PrimitiveCaseResult {
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

function runReplaceAllRows({ count, document }: PrimitiveRunContext): PrimitiveCaseResult {
  const host = document.createElement("div");
  const rows = createRowsData(count);
  const replacementRows = createReplacementRowsData(count);
  let setRows: StateSetter<RowFixture[]> | undefined;

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
    flushSync(() => setRows!(replacementRows));
    const duration = performance.now() - start;

    validateRows(host, replacementRows);

    return { samples: [duration] };
  } finally {
    root.unmount();
  }
}

function runUpdateEveryTenth({ count, document }: PrimitiveRunContext): PrimitiveCaseResult {
  const host = document.createElement("div");
  const rows = createRowsData(count);
  const updatedRows = updateEveryTenth(rows);
  let setRows: StateSetter<RowFixture[]> | undefined;

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

function runSelectRow({ count, document }: PrimitiveRunContext): PrimitiveCaseResult {
  const host = document.createElement("div");
  const rows = createRowsData(count);
  const selectedId = Math.floor(count / 2);
  let setSelectedId: StateSetter<number> | undefined;

  function App() {
    const [selected, setSelected] = useState(-1);
    setSelectedId = setSelected;

    return createElement(Rows, { rows, selectedId: selected });
  }

  const root = createRoot(host);

  try {
    flushSync(() => root.render(createElement(App)));
    validateRows(host, rows);

    const start = performance.now();
    flushSync(() => setSelectedId!(selectedId));
    const duration = performance.now() - start;

    validateRows(host, rows);
    validateSelectedRow(host, selectedId);

    return { samples: [duration] };
  } finally {
    root.unmount();
  }
}

function runAppendRows({ count, document }: PrimitiveRunContext): PrimitiveCaseResult {
  const host = document.createElement("div");
  const rows = createRowsData(count);
  const appendedRows = [...rows, ...createRowsDataFrom(count, 1_000)];
  let setRows: StateSetter<RowFixture[]> | undefined;

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
    flushSync(() => setRows!(appendedRows));
    const duration = performance.now() - start;

    validateRows(host, appendedRows);

    return { samples: [duration] };
  } finally {
    root.unmount();
  }
}

function runRemoveRow({ count, document }: PrimitiveRunContext): PrimitiveCaseResult {
  const host = document.createElement("div");
  const rows = createRowsData(count);
  const remainingRows = rows.filter((_, index) => index !== Math.floor(count / 2));
  let setRows: StateSetter<RowFixture[]> | undefined;

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
    flushSync(() => setRows!(remainingRows));
    const duration = performance.now() - start;

    validateRows(host, remainingRows);

    return { samples: [duration] };
  } finally {
    root.unmount();
  }
}

function runClearRows({ count, document }: PrimitiveRunContext): PrimitiveCaseResult {
  const host = document.createElement("div");
  const rows = createRowsData(count);
  let setRows: StateSetter<RowFixture[]> | undefined;

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
    flushSync(() => setRows!([]));
    const duration = performance.now() - start;

    validateRows(host, []);

    return { samples: [duration] };
  } finally {
    root.unmount();
  }
}

function runKeyedReverse({ count, document }: PrimitiveRunContext): PrimitiveCaseResult {
  const host = document.createElement("div");
  const rows = createRowsData(count);
  let setRows: StateSetter<RowFixture[]> | undefined;

  function App() {
    const [currentRows, setCurrentRows] = useState(rows);
    setRows = setCurrentRows;

    return createElement(Rows, { rows: currentRows });
  }

  const root = createRoot(host);

  try {
    flushSync(() => root.render(createElement(App)));
    validateRows(host, rows);
    const initialNodes = [...host.children];

    const start = performance.now();
    flushSync(() => setRows!([...rows].reverse()));
    const duration = performance.now() - start;

    validateRowsReversedWithNodeIdentity(host, rows, initialNodes);

    return { samples: [duration] };
  } finally {
    root.unmount();
  }
}

function runCreateEventTargets({ count, document }: PrimitiveRunContext): PrimitiveCaseResult {
  const host = document.createElement("div");
  const root = createRoot(host);
  const start = performance.now();

  try {
    flushSync(() => root.render(createElement(EventTargets, { count })));
    const duration = performance.now() - start;

    validateEventTargets(host, count);

    return { samples: [duration] };
  } finally {
    root.unmount();
  }
}

function runTextBindingUpdate({ count, document }: PrimitiveRunContext): PrimitiveCaseResult {
  const host = document.createElement("div");
  let setValue: StateSetter<string> | undefined;

  function App() {
    const [value, setCurrentValue] = useState("0");
    setValue = setCurrentValue;

    return createElement(
      Fragment,
      null,
      Array.from({ length: count }, (_, index) => createElement("span", { key: index }, value)),
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

function runComputedFanOut({ count, document }: PrimitiveRunContext): PrimitiveCaseResult {
  const host = document.createElement("div");
  let setValue: StateSetter<number> | undefined;

  function App() {
    const [value, setCurrentValue] = useState(0);
    setValue = setCurrentValue;
    const derived = String(value);

    return createElement(
      Fragment,
      null,
      Array.from({ length: count }, (_, index) => createElement("span", { key: index }, derived)),
    );
  }

  const root = createRoot(host);

  try {
    flushSync(() => root.render(createElement(App)));
    validateTextNodes(readTextNodes(host, count), "0");

    const start = performance.now();
    flushSync(() => setValue!(1));
    const duration = performance.now() - start;

    validateTextNodes(readTextNodes(host, count), "1");

    return { samples: [duration] };
  } finally {
    root.unmount();
  }
}

function runComputedFanIn({ count, document }: PrimitiveRunContext): PrimitiveCaseResult {
  const host = document.createElement("div");
  let setValues: StateSetter<number[]> | undefined;

  function App() {
    const [values, setCurrentValues] = useState(() => Array.from({ length: count }, () => 0));
    setValues = setCurrentValues;
    const total = values.reduce((sum, value) => sum + value, 0);

    return createElement("span", null, String(total));
  }

  const root = createRoot(host);

  try {
    flushSync(() => root.render(createElement(App)));
    validateTextNodes(readTextNodes(host, 1), "0");

    const start = performance.now();
    flushSync(() => setValues!(Array.from({ length: count }, () => 1)));
    const duration = performance.now() - start;

    validateTextNodes(readTextNodes(host, 1), String(count));

    return { samples: [duration] };
  } finally {
    root.unmount();
  }
}

async function runRepeatedMemory({
  count,
  document,
}: PrimitiveRunContext): Promise<PrimitiveCaseResult> {
  const host = document.createElement("div");
  const root = createRoot(host);
  const rows = createRowsData(count);
  const updatedRows = updateEveryTenth(rows);
  const before = await readHeapUsedAfterForcedGc();

  try {
    for (let iteration = 0; iteration < memoryStressCycles; iteration += 1) {
      flushSync(() => root.render(createElement(Rows, { rows })));
      flushSync(() => root.render(createElement(Rows, { rows: updatedRows })));
      flushSync(() => root.render(createElement(Rows, { rows: [] })));
    }

    validateRows(host, []);

    return {
      samples: [calculateHeapDelta(await readHeapUsedAfterForcedGc(), before)],
      notes: [forcedGcMemoryNote],
    };
  } finally {
    root.unmount();
  }
}

function Rows({ rows, selectedId = -1 }: { rows: readonly RowFixture[]; selectedId?: number }) {
  return createElement(
    Fragment,
    null,
    rows.map((row) =>
      createElement(
        "div",
        {
          className: selectedId === row.id ? "selected" : undefined,
          "data-key": row.id,
          "data-selected": selectedId === row.id ? "true" : undefined,
          key: row.id,
        },
        row.label,
      ),
    ),
  );
}

function EventTargets({ count }: { count: number }) {
  const onClick = () => {};

  return createElement(
    Fragment,
    null,
    Array.from({ length: count }, (_, index) =>
      createElement(
        "button",
        { "data-index": index, key: index, onClick, type: "button" },
        String(index),
      ),
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
