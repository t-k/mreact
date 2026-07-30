import { batch, cell } from "@reckona/mreact-reactive-core";

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

let nextId = 1;
const rows = cell<readonly RowData[]>([]);
const selected = cell<number | null>(null);

function random(max: number): number {
  return Math.round(Math.random() * 1_000) % max;
}

function buildData(count: number): RowData[] {
  const data = new Array<RowData>(count);

  for (let index = 0; index < count; index += 1) {
    data[index] = {
      id: nextId,
      label: `${adjectives[random(adjectives.length)]} ${colors[random(colors.length)]} ${nouns[random(nouns.length)]}`,
    };
    nextId += 1;
  }

  return data;
}

function setData(count: number): void {
  batch(() => {
    selected.set(null);
    rows.set(buildData(count));
  });
}

function addRows(): void {
  rows.set([...rows.get(), ...buildData(1_000)]);
}

function updateRows(): void {
  const next = rows.get().slice();

  for (let index = 0; index < next.length; index += 10) {
    const row = next[index];

    if (row !== undefined) {
      next[index] = { id: row.id, label: `${row.label} !!!` };
    }
  }

  rows.set(next);
}

function clearRows(): void {
  batch(() => {
    selected.set(null);
    rows.set([]);
  });
}

function swapRows(): void {
  const current = rows.get();

  if (current.length <= 998) {
    return;
  }

  const next = current.slice();
  const second = next[1];
  const nineHundredNinetyNinth = next[998];

  if (second === undefined || nineHundredNinetyNinth === undefined) {
    return;
  }

  next[1] = nineHundredNinetyNinth;
  next[998] = second;
  rows.set(next);
}

function removeRow(id: number): void {
  rows.set(rows.get().filter((row) => row.id !== id));
}

export function App(): HTMLDivElement {
  return (
    <div id="main">
      <div class="container">
        <div class="jumbotron">
          <div class="row">
            <div class="col-md-6">
              <h1>Mreact</h1>
            </div>
            <div class="col-md-6">
              <div class="row">
                <div class="col-sm-6 smallpad">
                  <button
                    type="button"
                    class="btn btn-primary btn-block"
                    id="run"
                    onClick={() => setData(1_000)}
                  >
                    Create 1,000 rows
                  </button>
                </div>
                <div class="col-sm-6 smallpad">
                  <button
                    type="button"
                    class="btn btn-primary btn-block"
                    id="runlots"
                    onClick={() => setData(10_000)}
                  >
                    Create 10,000 rows
                  </button>
                </div>
                <div class="col-sm-6 smallpad">
                  <button
                    type="button"
                    class="btn btn-primary btn-block"
                    id="add"
                    onClick={addRows}
                  >
                    Append 1,000 rows
                  </button>
                </div>
                <div class="col-sm-6 smallpad">
                  <button
                    type="button"
                    class="btn btn-primary btn-block"
                    id="update"
                    onClick={updateRows}
                  >
                    Update every 10th row
                  </button>
                </div>
                <div class="col-sm-6 smallpad">
                  <button
                    type="button"
                    class="btn btn-primary btn-block"
                    id="clear"
                    onClick={clearRows}
                  >
                    Clear
                  </button>
                </div>
                <div class="col-sm-6 smallpad">
                  <button
                    type="button"
                    class="btn btn-primary btn-block"
                    id="swaprows"
                    onClick={swapRows}
                  >
                    Swap Rows
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
        <table class="table table-hover table-striped test-data">
          <tbody>
            {rows.get().map((row) => (
              <tr key={row.id} class={selected.get() === row.id ? "danger" : ""}>
                <td class="col-md-1">{row.id}</td>
                <td class="col-md-4">
                  <a onClick={() => selected.set(row.id)}>{row.label}</a>
                </td>
                <td class="col-md-1">
                  <a onClick={() => removeRow(row.id)}>
                    <span class="glyphicon glyphicon-remove" aria-hidden="true" />
                  </a>
                </td>
                <td class="col-md-6" />
              </tr>
            ))}
          </tbody>
        </table>
        <span class="preloadicon glyphicon glyphicon-remove" aria-hidden="true" />
      </div>
    </div>
  );
}
