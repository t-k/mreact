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
