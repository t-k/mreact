import {
  createElement,
  createRoot,
  flushSync,
  memo,
  useState,
  type ReactCompatNode,
} from "@reckona/mreact-compat";

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

type StateSetter<T> = (value: T | ((previous: T) => T)) => void;

let nextId = 1;
let setRows: StateSetter<readonly RowData[]> | undefined;
let setSelected: StateSetter<number | null> | undefined;

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

function setData(count: number): void {
  flushSync(() => {
    setRows?.(buildData(count));
    setSelected?.(null);
  });
}

function addRows(): void {
  flushSync(() => {
    setRows?.((rows) => [...rows, ...buildData(1_000)]);
  });
}

function updateRows(): void {
  flushSync(() => {
    setRows?.(updateEveryTenth);
  });
}

function clearRows(): void {
  flushSync(() => {
    setRows?.([]);
    setSelected?.(null);
  });
}

function swapRowsAtBenchPositions(): void {
  flushSync(() => {
    setRows?.(swapRows);
  });
}

function removeRow(id: number): void {
  flushSync(() => {
    setRows?.((rows) => rows.filter((row) => row.id !== id));
  });
}

function selectRow(id: number): void {
  flushSync(() => {
    setSelected?.(id);
  });
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

const Row = memo(
  function Row({ row, selected }: RowProps): ReactCompatNode {
    return createElement(
      "tr",
      {
        className: selected ? "danger" : "",
        key: row.id,
      },
      createElement("td", { className: "col-md-1" }, row.id),
      createElement(
        "td",
        { className: "col-md-4" },
        createElement("a", { onClick: () => selectRow(row.id) }, row.label),
      ),
      createElement(
        "td",
        { className: "col-md-1" },
        createElement(
          "a",
          { onClick: () => removeRow(row.id) },
          createElement("span", {
            "aria-hidden": "true",
            className: "glyphicon glyphicon-remove",
          }),
        ),
      ),
      createElement("td", { className: "col-md-6" }),
    );
  },
  (previous, next) => previous.selected === next.selected && previous.row === next.row,
);

function App(): ReactCompatNode {
  const [rows, updateRowsState] = useState<readonly RowData[]>([]);
  const [selected, updateSelected] = useState<number | null>(null);

  setRows = updateRowsState;
  setSelected = updateSelected;

  return rows.map((row) => createElement(Row, { key: row.id, row, selected: selected === row.id }));
}

const root = createRoot(requireElement("tbody"));

flushSync(() => {
  root.render(createElement(App, null));
});

requireElement("run").addEventListener("click", () => setData(1_000));
requireElement("runlots").addEventListener("click", () => setData(10_000));
requireElement("add").addEventListener("click", addRows);
requireElement("update").addEventListener("click", updateRows);
requireElement("clear").addEventListener("click", clearRows);
requireElement("swaprows").addEventListener("click", swapRowsAtBenchPositions);
