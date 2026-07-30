import {
  createRoot,
  flushSync,
  memo,
  useReducer,
  type ReactCompatNode,
} from "@reckona/mreact-compat";
// Phase 3 (branch experiment): Row is plain JSX; the mreact compiler (compat
// mode, Option C) lowers it to a prop-bridged reactive DOM block at build time.
// memo is preserved by wrapping the lowered function in a separate const.

const adjectives = [
  "pretty",
  "large",
  "big",
  "small",
  "tall",
  "short",
  "long",
  "handsome",
  "plain",
  "quaint",
  "clean",
  "elegant",
  "easy",
  "angry",
  "crazy",
  "helpful",
  "mushy",
  "odd",
  "unsightly",
  "adorable",
  "important",
  "inexpensive",
  "cheap",
  "expensive",
  "fancy",
];
const colors = [
  "red",
  "yellow",
  "blue",
  "green",
  "pink",
  "brown",
  "purple",
  "brown",
  "white",
  "black",
  "orange",
];
const nouns = [
  "table",
  "chair",
  "house",
  "bbq",
  "desk",
  "car",
  "pony",
  "cookie",
  "sandwich",
  "burger",
  "pizza",
  "mouse",
  "keyboard",
];

interface RowData {
  readonly id: number;
  readonly label: string;
}

interface AppState {
  readonly rows: readonly RowData[];
  readonly selected: number | null;
}

type AppAction =
  | { readonly type: "run"; readonly count: number }
  | { readonly type: "add" }
  | { readonly type: "update" }
  | { readonly type: "clear" }
  | { readonly type: "swap" }
  | { readonly type: "remove"; readonly id: number }
  | { readonly type: "select"; readonly id: number };

let nextId = 1;
let dispatchApp: ((action: AppAction) => void) | undefined;

function random(max: number): number {
  return Math.round(Math.random() * 1000) % max;
}

function buildData(count: number): RowData[] {
  const rows: RowData[] = [];

  rows.length = count;

  for (let index = 0; index < count; index += 1) {
    rows[index] = {
      id: nextId,
      label: `${adjectives[random(adjectives.length)]} ${colors[random(colors.length)]} ${
        nouns[random(nouns.length)]
      }`,
    };
    nextId += 1;
  }

  return rows;
}

function updateEveryTenth(rows: readonly RowData[]): RowData[] {
  const next = rows.slice(0);

  for (let index = 0; index < next.length; index += 10) {
    const row = next[index];

    if (row !== undefined) {
      next[index] = { id: row.id, label: `${row.label} !!!` };
    }
  }

  return next;
}

function swapRows(rows: readonly RowData[]): readonly RowData[] {
  if (rows.length <= 998) {
    return rows;
  }

  const next = [...rows];
  const second = next[1];
  const nineHundredNinetyNinth = next[998];

  if (second === undefined || nineHundredNinetyNinth === undefined) {
    return rows;
  }

  next[1] = nineHundredNinetyNinth;
  next[998] = second;
  return next;
}

function reduceAppState(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case "run":
      return { rows: buildData(action.count), selected: null };
    case "add":
      return { rows: [...state.rows, ...buildData(1_000)], selected: state.selected };
    case "update":
      return { rows: updateEveryTenth(state.rows), selected: state.selected };
    case "clear":
      return { rows: [], selected: null };
    case "swap":
      return { rows: swapRows(state.rows), selected: state.selected };
    case "remove":
      return {
        rows: state.rows.filter((row) => row.id !== action.id),
        selected: state.selected,
      };
    case "select":
      return { rows: state.rows, selected: action.id };
  }
}

function dispatchBenchAction(action: AppAction): void {
  flushSync(() => {
    dispatchApp?.(action);
  });
}

function setData(count: number): void {
  dispatchBenchAction({ type: "run", count });
}

function addRows(): void {
  dispatchBenchAction({ type: "add" });
}

function updateRows(): void {
  dispatchBenchAction({ type: "update" });
}

function clearRows(): void {
  dispatchBenchAction({ type: "clear" });
}

function swapRowsAtBenchPositions(): void {
  dispatchBenchAction({ type: "swap" });
}

function removeRow(id: number): void {
  dispatchBenchAction({ type: "remove", id });
}

function selectRow(id: number): void {
  dispatchBenchAction({ type: "select", id });
}

function requireElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);

  if (element === null) {
    throw new Error(`Missing #${id}`);
  }

  return element as T;
}

type RowProps = Record<string, unknown> & {
  readonly row: RowData;
  readonly selected: boolean;
};

// Plain JSX with a single props parameter, no hooks, and a host-only tree: the
// compiler lowers this to a prop-bridged reactive DOM block.
function Row(props: RowProps): ReactCompatNode {
  return (
    <tr className={props.selected ? "danger" : ""}>
      <td className="col-md-1">{props.row.id}</td>
      <td className="col-md-4">
        <a onClick={() => selectRow(props.row.id)}>{props.row.label}</a>
      </td>
      <td className="col-md-1">
        <a onClick={() => removeRow(props.row.id)}>
          <span aria-hidden="true" className="glyphicon glyphicon-remove" />
        </a>
      </td>
      <td className="col-md-6" />
    </tr>
  );
}

// memo wraps the lowered function so equal-prop rows still bail out of the
// parent re-render (the compiler unwraps inline memo(fn), so wrap separately).
const RowMemo = memo(
  Row,
  (previous: RowProps, next: RowProps) =>
    previous.selected === next.selected && previous.row === next.row,
);

export function App(): ReactCompatNode {
  const [state, dispatch] = useReducer(reduceAppState, { rows: [], selected: null });

  dispatchApp = dispatch;

  return state.rows.map((row) => (
    <RowMemo key={row.id} row={row} selected={state.selected === row.id} />
  ));
}

const root = createRoot(requireElement("tbody"));

flushSync(() => {
  root.render(<App />);
});

requireElement("run").addEventListener("click", () => setData(1_000));
requireElement("runlots").addEventListener("click", () => setData(10_000));
requireElement("add").addEventListener("click", addRows);
requireElement("update").addEventListener("click", updateRows);
requireElement("clear").addEventListener("click", clearRows);
requireElement("swaprows").addEventListener("click", swapRowsAtBenchPositions);
