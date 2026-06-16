import {
  batch,
  cell,
  selector,
  type Cell,
} from "@reckona/mreact-reactive-core";
import {
  bindEvent,
  bindList,
  bindSelectorClass,
  bindText,
  createTemplate,
  createRoot,
} from "@reckona/mreact-reactive-dom";

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

interface Row {
  readonly id: number;
  readonly label: Cell<string>;
}

let nextId = 1;

const data = cell<readonly Row[]>([]);
const selected = cell<number | null>(null);
const selectedRow = selector<number | null, number>(selected);

function random(max: number): number {
  return Math.round(Math.random() * 1000) % max;
}

function buildData(count: number): Row[] {
  const rows: Row[] = [];

  rows.length = count;

  for (let index = 0; index < count; index += 1) {
    rows[index] = {
      id: nextId,
      label: cell(
        `${adjectives[random(adjectives.length)]} ${colors[random(colors.length)]} ${
          nouns[random(nouns.length)]
        }`,
      ),
    };
    nextId += 1;
  }

  return rows;
}

function setRows(count: number): void {
  data.set(buildData(count));
  selected.set(null);
}

function addRows(): void {
  data.set((rows) => [...rows, ...buildData(1_000)]);
}

function updateEveryTenthRow(): void {
  batch(() => {
    const rows = data.get();

    for (let index = 0; index < rows.length; index += 10) {
      const row = rows[index];

      if (row !== undefined) {
        row.label.set((label) => `${label} !!!`);
      }
    }
  });
}

function clearRows(): void {
  data.set([]);
  selected.set(null);
}

function swapRows(): void {
  const rows = data.get();

  if (rows.length <= 998) {
    return;
  }

  const next = [...rows];
  const second = next[1];
  const nineHundredNinetyNinth = next[998];

  if (second === undefined || nineHundredNinetyNinth === undefined) {
    return;
  }

  next[1] = nineHundredNinetyNinth;
  next[998] = second;
  data.set(next);
}

function removeRow(id: number): void {
  data.set((rows) => rows.filter((row) => row.id !== id));
}

function requireElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);

  if (element === null) {
    throw new Error(`Missing #${id}`);
  }

  return element as T;
}

const createRowTemplate = createTemplate(
  '<tr><td class="col-md-1"> </td><td class="col-md-4"><a data-action="select"> </a></td><td class="col-md-1"><a data-action="remove"><span aria-hidden="true" class="glyphicon glyphicon-remove"></span></a></td><td class="col-md-6"></td></tr>',
);
const rowIds = new WeakMap<HTMLTableRowElement, number>();

function renderRow(row: Row): HTMLTableRowElement {
  const fragment = createRowTemplate();
  const tr = fragment.firstElementChild as HTMLTableRowElement;
  const idCell = tr.firstElementChild as HTMLTableCellElement;
  const labelCell = idCell.nextElementSibling as HTMLTableCellElement;
  const selectLink = labelCell.firstElementChild as HTMLAnchorElement;
  const idText = idCell.firstChild as Text;
  const labelText = selectLink.firstChild as Text;

  rowIds.set(tr, row.id);
  idText.data = String(row.id);
  labelText.data = row.label.get();

  bindText(labelText, row.label, { preserveInitial: true });
  bindSelectorClass(tr, "danger", selectedRow, row.id, { preserveInitial: true });

  return tr;
}

const tbody = requireElement<HTMLTableSectionElement>("tbody");
const marker = document.createComment("mreact rows");

function handleRowClick(event: MouseEvent): void {
  const target = event.target;

  if (!(target instanceof Element)) {
    return;
  }

  const actionLink = target.closest<HTMLAnchorElement>("a[data-action]");

  if (actionLink === null || !tbody.contains(actionLink)) {
    return;
  }

  const rowElement = actionLink.closest<HTMLTableRowElement>("tr");
  const id = rowElement === null ? undefined : rowIds.get(rowElement);

  if (id === undefined) {
    return;
  }

  if (actionLink.dataset.action === "select") {
    selected.set(id);
  } else if (actionLink.dataset.action === "remove") {
    removeRow(id);
  }
}

tbody.append(marker);
createRoot(tbody, () => {
  tbody.append(marker);
  bindList(tbody, marker, () => data.get(), renderRow, {
    itemMode: "static",
    key: (row) => row.id,
  });
  return marker;
});

bindEvent(tbody, "click", handleRowClick);
bindEvent(requireElement("run"), "click", () => setRows(1_000));
bindEvent(requireElement("runlots"), "click", () => setRows(10_000));
bindEvent(requireElement("add"), "click", addRows);
bindEvent(requireElement("update"), "click", updateEveryTenthRow);
bindEvent(requireElement("clear"), "click", clearRows);
bindEvent(requireElement("swaprows"), "click", swapRows);
