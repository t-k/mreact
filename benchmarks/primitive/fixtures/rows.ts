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
