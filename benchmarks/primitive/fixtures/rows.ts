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
    assertRow(child, row);
  }
}

export function validateRowsReversed(
  host: Element,
  rows: readonly RowFixture[],
): void {
  validateRows(host, rows.toReversed());
}

function assertRow(element: Element, row: RowFixture): void {
  if (element.getAttribute("data-key") !== String(row.id)) {
    throw new Error(`expected data-key ${row.id}`);
  }

  if (element.textContent !== row.label) {
    throw new Error(`expected row label ${row.label}`);
  }
}
