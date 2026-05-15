export interface RowFixture {
  id: number;
  label: string;
}

export function createRowsData(count: number): RowFixture[] {
  return Array.from({ length: count }, (_, index) => ({
    id: index,
    label: `Row ${index}`,
  }));
}

export function createRowsDataFrom(start: number, count: number): RowFixture[] {
  return Array.from({ length: count }, (_, index) => {
    const id = start + index;

    return {
      id,
      label: `Row ${id}`,
    };
  });
}

export function createReplacementRowsData(count: number): RowFixture[] {
  return Array.from({ length: count }, (_, index) => {
    const id = count + index;

    return {
      id,
      label: `Replacement Row ${index}`,
    };
  });
}

export function validateRows(host: Element, rows: readonly RowFixture[]): void {
  const children = [...host.children];

  if (children.length !== rows.length) {
    throw new Error(`expected ${rows.length} rows, received ${children.length}`);
  }

  for (const [index, row] of rows.entries()) {
    const child = children[index]!;
    assertRow(child, row, index);
  }
}

export function validateRowsReversed(
  host: Element,
  rows: readonly RowFixture[],
): void {
  validateRows(host, [...rows].reverse());
}

export function validateRowsReversedWithNodeIdentity(
  host: Element,
  rows: readonly RowFixture[],
  initialNodes: readonly Element[],
): void {
  validateRowsReversed(host, rows);

  if (initialNodes.length !== rows.length) {
    throw new Error(
      `expected ${rows.length} initial row nodes, received ${initialNodes.length}`,
    );
  }

  const children = [...host.children];
  const initialByKey = new Map<string, Element>();

  for (const [index, row] of rows.entries()) {
    initialByKey.set(String(row.id), initialNodes[index]!);
  }

  for (const [index, row] of [...rows].reverse().entries()) {
    const expectedNode = initialByKey.get(String(row.id));

    if (children[index] !== expectedNode) {
      throw new Error(
        `row ${index} expected preserved node for key ${row.id}`,
      );
    }
  }
}

export function validateSelectedRow(host: Element, selectedId: number): void {
  const selectedRows = [...host.children].filter(
    (child) =>
      child.getAttribute("data-selected") === "true" ||
      child.classList.contains("selected"),
  );

  if (selectedRows.length !== 1) {
    throw new Error(`expected 1 selected row, received ${selectedRows.length}`);
  }

  const selectedKey = selectedRows[0]?.getAttribute("data-key");

  if (selectedKey !== String(selectedId)) {
    throw new Error(
      `expected selected data-key ${selectedId}, received ${selectedKey}`,
    );
  }
}

function assertRow(element: Element, row: RowFixture, index: number): void {
  const receivedKey = element.getAttribute("data-key");

  if (receivedKey !== String(row.id)) {
    throw new Error(
      `row ${index} expected data-key ${row.id}, received ${receivedKey}`,
    );
  }

  const receivedLabel = element.textContent;

  if (receivedLabel !== row.label) {
    throw new Error(
      `row ${index} expected label ${row.label}, received ${receivedLabel}`,
    );
  }
}
