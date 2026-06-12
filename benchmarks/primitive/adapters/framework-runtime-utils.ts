import type { RowFixture } from "../fixtures/rows.js";

export function updateEveryTenth(rows: readonly RowFixture[]): RowFixture[] {
  return rows.map((row, index) =>
    index % 10 === 0
      ? {
          ...row,
          label: `${row.label} updated`,
        }
      : row,
  );
}

export function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

export function assertRenderedTextValues(host: Element, expectedCount: number, value: string): void {
  const nodes = collectNonEmptyTextNodes(host);

  if (nodes.length !== expectedCount) {
    throw new Error(`expected ${expectedCount} text nodes, received ${nodes.length}`);
  }

  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index]!;
    if (node.data !== value) {
      throw new Error(`text node ${index} expected ${value}, received ${node.data}`);
    }
  }
}

function collectNonEmptyTextNodes(root: Node): Text[] {
  const nodes: Text[] = [];

  for (const child of root.childNodes) {
    if (child.nodeType === 3) {
      const text = child as Text;
      if (text.data.length > 0) {
        nodes.push(text);
      }
      continue;
    }

    nodes.push(...collectNonEmptyTextNodes(child));
  }

  return nodes;
}
