// Framework-agnostic js-framework-benchmark micro harness.
// Measures the synchronous (script) cost of each operation via performance.now()
// around flushSync(dispatch), mirroring the official "script" sub-metric.

export interface Adapter {
  readonly name: string;
  readonly createElement: (type: unknown, props: unknown, ...children: unknown[]) => unknown;
  readonly createRoot: (container: Element) => { render: (node: unknown) => void };
  readonly memo: (component: unknown, areEqual?: (a: any, b: any) => boolean) => unknown;
  readonly useReducer: (reducer: any, initial: any) => [any, (action: any) => void];
  readonly flushSync: (cb: () => void) => void;
  // When present, Row is built as a prop-bridged reactive-dom-block (the
  // compiler-lowered form), updating bound text/class via cells instead of
  // re-reconciling the row subtree.
  readonly reactive?: {
    createReactiveDomBlock: (render: (props: any) => { node: ChildNode; dispose?: () => void }, props: any) => unknown;
    bindText: (node: Text, value: () => unknown, options?: { preserveInitial?: boolean }) => () => void;
    effect: (fn: () => void) => () => void;
  };
}

interface RowData {
  readonly id: number;
  readonly label: string;
}
interface AppState {
  readonly rows: readonly RowData[];
  readonly selected: number | null;
}
type AppAction =
  | { type: "run"; count: number }
  | { type: "add" }
  | { type: "update" }
  | { type: "clear" }
  | { type: "swap" }
  | { type: "remove"; id: number }
  | { type: "select"; id: number };

const adjectives = ["pretty","large","big","small","tall","short","long","handsome","plain","quaint","clean","elegant","easy","angry","crazy","helpful","mushy","odd","unsightly","adorable","important","inexpensive","cheap","expensive","fancy"];
const colors = ["red","yellow","blue","green","pink","brown","purple","brown","white","black","orange"];
const nouns = ["table","chair","house","bbq","desk","car","pony","cookie","sandwich","burger","pizza","mouse","keyboard"];

let nextId = 1;
function random(max: number): number {
  return Math.round(Math.random() * 1000) % max;
}
function buildData(count: number): RowData[] {
  const rows: RowData[] = new Array(count);
  for (let i = 0; i < count; i += 1) {
    rows[i] = {
      id: nextId++,
      label: `${adjectives[random(adjectives.length)]} ${colors[random(colors.length)]} ${nouns[random(nouns.length)]}`,
    };
  }
  return rows;
}
function updateEveryTenth(rows: readonly RowData[]): RowData[] {
  const next = rows.slice(0);
  for (let i = 0; i < next.length; i += 10) {
    const row = next[i];
    next[i] = { id: row.id, label: `${row.label} !!!` };
  }
  return next;
}
function swapRows(rows: readonly RowData[]): readonly RowData[] {
  if (rows.length <= 998) return rows;
  const next = rows.slice(0);
  const tmp = next[1];
  next[1] = next[998];
  next[998] = tmp;
  return next;
}
function reduce(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case "run": return { rows: buildData(action.count), selected: null };
    case "add": return { rows: [...state.rows, ...buildData(1000)], selected: state.selected };
    case "update": return { rows: updateEveryTenth(state.rows), selected: state.selected };
    case "clear": return { rows: [], selected: null };
    case "swap": return { rows: swapRows(state.rows), selected: state.selected };
    case "remove": return { rows: state.rows.filter((r) => r.id !== action.id), selected: state.selected };
    case "select": return { rows: state.rows, selected: action.id };
  }
}

export interface OpResult {
  median: number;
  min: number;
  mean: number;
  p25: number;
  samples: number;
}

function summarize(times: number[]): OpResult {
  const sorted = times.slice().sort((a, b) => a - b);
  const n = sorted.length;
  const median = n % 2 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
  return {
    median: round(median),
    min: round(sorted[0]),
    mean: round(times.reduce((a, b) => a + b, 0) / n),
    p25: round(sorted[Math.floor(n * 0.25)]),
    samples: n,
  };
}
function round(v: number): number {
  return Math.round(v * 100) / 100;
}

export function createHarness(adapter: Adapter, container: Element) {
  const { createElement, memo, useReducer, createRoot, flushSync } = adapter;
  let appDispatch: ((action: AppAction) => void) | undefined;
  let currentRows: readonly RowData[] = [];

  function selectRow(id: number) { dispatch({ type: "select", id }); }
  function removeRow(id: number) { dispatch({ type: "remove", id }); }

  const rowAreEqual = (p: any, n: any) => p.selected === n.selected && p.row === n.row;

  // Marked exactly as the mreact compiler stamps a lowered props-transparent
  // block component, so the micro-bench exercises the reconciler's changed-row
  // cell-update fast path (update without re-invoking the component).
  const reactiveRow = function Row(props: { row: RowData; selected: boolean }) {
    const { createReactiveDomBlock, bindText, effect } = adapter.reactive!;
    return createReactiveDomBlock((p: { row: RowData; selected: boolean }) => {
      const tr = document.createElement("tr");
          const td1 = document.createElement("td");
          td1.className = "col-md-1";
          const idText = document.createTextNode("");
          td1.appendChild(idText);
          const td2 = document.createElement("td");
          td2.className = "col-md-4";
          const a1 = document.createElement("a");
          const labelText = document.createTextNode("");
          a1.appendChild(labelText);
          a1.addEventListener("click", () => selectRow(p.row.id));
          td2.appendChild(a1);
          const td3 = document.createElement("td");
          td3.className = "col-md-1";
          const a2 = document.createElement("a");
          a2.addEventListener("click", () => removeRow(p.row.id));
          const span = document.createElement("span");
          span.setAttribute("aria-hidden", "true");
          span.className = "glyphicon glyphicon-remove";
          a2.appendChild(span);
          td3.appendChild(a2);
          const td4 = document.createElement("td");
          td4.className = "col-md-6";
          tr.append(td1, td2, td3, td4);
          void bindText;
          // One effect per block: all bindings read the same prop cell, so they
          // would all re-run on any change anyway. Guard each write so an update
          // only touches the DOM that actually changed, and dispose is 1 effect.
          const dispose = effect(() => {
            const row = p.row;
            const id = String(row.id);
            if (idText.data !== id) idText.data = id;
            if (labelText.data !== row.label) labelText.data = row.label;
            const cls = p.selected ? "danger" : "";
            if (tr.className !== cls) tr.className = cls;
          });
          return { node: tr, dispose };
        }, props);
  };
  (reactiveRow as any).__mreactStaticBlock = true;

  const Row: any = adapter.reactive
    ? memo(reactiveRow, rowAreEqual)
    : memo(function Row({ row, selected }: { row: RowData; selected: boolean }) {
        return createElement(
          "tr",
          { className: selected ? "danger" : "", key: row.id },
          createElement("td", { className: "col-md-1" }, row.id),
          createElement("td", { className: "col-md-4" },
            createElement("a", { onClick: () => selectRow(row.id) }, row.label)),
          createElement("td", { className: "col-md-1" },
            createElement("a", { onClick: () => removeRow(row.id) },
              createElement("span", { "aria-hidden": "true", className: "glyphicon glyphicon-remove" }))),
          createElement("td", { className: "col-md-6" }),
        );
      }, rowAreEqual);

  function App(): unknown {
    const [state, dispatch] = useReducer(reduce, { rows: [], selected: null });
    appDispatch = dispatch;
    currentRows = state.rows;
    return state.rows.map((row) =>
      createElement(Row, { key: row.id, row, selected: state.selected === row.id }),
    );
  }

  function dispatch(action: AppAction): void {
    flushSync(() => { appDispatch?.(action); });
  }

  const root = createRoot(container);
  flushSync(() => { root.render(createElement(App, null)); });

  // --- ops ---
  const reset = () => dispatch({ type: "clear" });
  const create1k = () => dispatch({ type: "run", count: 1000 });
  const create10k = () => dispatch({ type: "run", count: 10000 });
  const update10th = () => dispatch({ type: "update" });
  const swap = () => dispatch({ type: "swap" });
  const append1k = () => dispatch({ type: "add" });
  const clear = () => dispatch({ type: "clear" });
  const selectNth = (i: number) => {
    const row = currentRows[i % currentRows.length];
    if (row) dispatch({ type: "select", id: row.id });
  };
  const removeNth = (i: number) => {
    const row = currentRows[Math.min(i, currentRows.length - 1)];
    if (row) dispatch({ type: "remove", id: row.id });
  };

  const gc = (globalThis as any).gc as (() => void) | undefined;

  function timed(fn: () => void): number {
    const t0 = performance.now();
    fn();
    return performance.now() - t0;
  }

  function measure(warmup: number, runs: number, setupEach: (() => void) | null, op: (i: number) => void): OpResult {
    for (let i = 0; i < warmup; i += 1) { setupEach?.(); op(i); }
    const times: number[] = [];
    for (let i = 0; i < runs; i += 1) {
      setupEach?.();
      gc?.();
      times.push(timed(() => op(i)));
    }
    return summarize(times);
  }

  // Batched timing for sub-millisecond ops: run `batch` ops inside one timed
  // region and divide, to escape performance.now() resolution noise.
  // `roundSetup` runs untimed before each round (e.g. recreate the table so
  // partial-update labels stay bounded like the official x16 case).
  function measureBatched(
    warmup: number,
    rounds: number,
    batch: number,
    op: (i: number) => void,
    roundSetup: (() => void) | null = null,
  ): OpResult {
    let counter = 0;
    for (let i = 0; i < warmup; i += 1) {
      roundSetup?.();
      for (let j = 0; j < batch; j += 1) op(counter++);
    }
    const times: number[] = [];
    for (let r = 0; r < rounds; r += 1) {
      roundSetup?.();
      gc?.();
      const t0 = performance.now();
      for (let i = 0; i < batch; i += 1) op(counter++);
      times.push((performance.now() - t0) / batch);
    }
    return summarize(times);
  }

  function runAll(warmup = 6, runs = 24): Record<string, OpResult> {
    const out: Record<string, OpResult> = {};

    // create rows: empty -> 1k
    out.create = measure(warmup, runs, reset, create1k);

    // replace all rows: 1k -> 1k
    create1k();
    out.replace = measure(warmup, runs, null, create1k);

    // partial update: 16 updates on a fresh 1k table per round (matches x16,
    // keeps " !!!" label growth bounded like the official case).
    out.partialUpdate = measureBatched(warmup, runs, 16, update10th, create1k);

    // select row: select varying rows (batched)
    create1k();
    out.select = measureBatched(warmup, runs, 50, (i) => selectNth(i * 37 + 1));

    // swap rows: toggle swap (batched)
    create1k();
    out.swap = measureBatched(warmup, runs, 16, swap);

    // remove row: from a fresh 1k each time, remove the 5th row
    out.remove = measure(warmup, runs, create1k, () => removeNth(4));

    // append rows to large table: 1k -> 2k (reset to 1k each)
    out.append = measure(warmup, Math.min(runs, 12), create1k, append1k);

    // create many rows: empty -> 10k
    out.createMany = measure(Math.min(warmup, 3), Math.min(runs, 8), reset, create10k);

    // clear rows: 1k -> empty (reset to 1k each)
    out.clear = measure(warmup, runs, create1k, clear);

    reset();
    return out;
  }

  const ops: Record<string, (i: number) => void> = {
    create: create1k,
    createMany: create10k,
    replace: create1k,
    partialUpdate: update10th,
    select: (i) => selectNth(i * 37 + 1),
    swap,
    remove: () => removeNth(4),
    append: append1k,
    clear,
  };

  // Drive a named op `count` times for CPU profiling. `setup` is the precondition
  // the official benchmark establishes before the measured click.
  function runOp(name: string, count: number): void {
    const setup: Record<string, () => void> = {
      create: reset, createMany: reset, replace: create1k, partialUpdate: create1k,
      select: create1k, swap: create1k, remove: create1k, append: create1k, clear: create1k,
    };
    const perOpSetup = name === "remove" || name === "append" || name === "clear" || name === "create" || name === "createMany";
    setup[name]?.();
    const op = ops[name];
    for (let i = 0; i < count; i += 1) {
      if (perOpSetup) setup[name]?.();
      // Keep partial-update label growth bounded like the official x16 case.
      else if (name === "partialUpdate" && i % 16 === 0) create1k();
      op(i);
    }
  }

  return { runAll, reset, create1k, ops, runOp };
}
