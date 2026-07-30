import { createRoot, useState } from "octane";

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
] as const;
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
] as const;
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
] as const;

interface Row {
  readonly id: number;
  readonly label: string;
}

let nextId = 1;

function random(max: number): number {
  return Math.round(Math.random() * 1_000) % max;
}

function buildLabel(): string {
  return `${adjectives[random(adjectives.length)]} ${colors[random(colors.length)]} ${
    nouns[random(nouns.length)]
  }`;
}

function buildData(count: number): Row[] {
  return Array.from({ length: count }, () => ({
    id: nextId++,
    label: buildLabel(),
  }));
}

function App() @{
  const [rows, setRows] = useState<readonly Row[]>([]);
  const [selected, setSelected] = useState<number | null>(null);

  const run = () => {
    setRows(buildData(1_000));
    setSelected(null);
  };
  const runLots = () => {
    setRows(buildData(10_000));
    setSelected(null);
  };
  const add = () => {
    setRows((current) => [...current, ...buildData(1_000)]);
  };
  const update = () => {
    setRows((current) =>
      current.map((row, index) =>
        index % 10 === 0 ? { id: row.id, label: `${row.label} !!!` } : row,
      ),
    );
  };
  const clear = () => {
    setRows([]);
    setSelected(null);
  };
  const swapRows = () => {
    setRows((current) => {
      if (current.length <= 998) {
        return current;
      }

      const next = [...current];
      const second = next[1];
      const nineHundredNinetyNinth = next[998];

      if (second === undefined || nineHundredNinetyNinth === undefined) {
        return current;
      }

      next[1] = nineHundredNinetyNinth;
      next[998] = second;
      return next;
    });
  };
  const remove = (id: number) => {
    setRows((current) => current.filter((row) => row.id !== id));
  };

  <div class="container">
    <div class="jumbotron">
      <div class="row">
        <div class="col-md-6">
          <h1>Octane</h1>
        </div>
        <div class="col-md-6">
          <div class="row">
            <div class="col-sm-6 smallpad">
              <button type="button" class="btn btn-primary btn-block" id="run" onClick={run}>Create 1,000 rows</button>
            </div>
            <div class="col-sm-6 smallpad">
              <button type="button" class="btn btn-primary btn-block" id="runlots" onClick={runLots}>Create 10,000 rows</button>
            </div>
            <div class="col-sm-6 smallpad">
              <button type="button" class="btn btn-primary btn-block" id="add" onClick={add}>Append 1,000 rows</button>
            </div>
            <div class="col-sm-6 smallpad">
              <button type="button" class="btn btn-primary btn-block" id="update" onClick={update}>Update every 10th row</button>
            </div>
            <div class="col-sm-6 smallpad">
              <button type="button" class="btn btn-primary btn-block" id="clear" onClick={clear}>Clear</button>
            </div>
            <div class="col-sm-6 smallpad">
              <button type="button" class="btn btn-primary btn-block" id="swaprows" onClick={swapRows}>Swap Rows</button>
            </div>
          </div>
        </div>
      </div>
    </div>
    <table class="table table-hover table-striped test-data">
      <tbody>
        @for (const row of rows; key row.id) {
          <tr class={selected === row.id ? "danger" : ""}>
            <td class="col-md-1">{row.id}</td>
            <td class="col-md-4"><a onClick={() => setSelected(row.id)}>{row.label}</a></td>
            <td class="col-md-1"><a onClick={() => remove(row.id)}><span class="glyphicon glyphicon-remove" aria-hidden="true"></span></a></td>
            <td class="col-md-6"></td>
          </tr>
        }
      </tbody>
    </table>
    <span class="preloadicon glyphicon glyphicon-remove" aria-hidden="true"></span>
  </div>
}

const container = document.getElementById("main");

if (container === null) {
  throw new Error("Missing #main");
}

createRoot(container).render(App);
