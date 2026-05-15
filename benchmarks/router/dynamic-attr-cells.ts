// Shared shape for the dynamic-attribute heavy fixture used by every
// router adapter. Each cell carries ~9 dynamic attribute-like
// values, several of which contain HTML special characters (`<` `>` `&`
// `"`). The fixture exercises each framework's attribute escape hot path
// (mreact compiler の batch escape lowering, React DOM の attribute
// stringify, Marko の vdom-less SSR, Qwik の `_jsxBranch` 等).
export interface DynamicAttrCell {
  row: number;
  col: number;
  kind: string;
  title: string;
  label: string;
  bg: string;
  fg: string;
  text: string;
}

export function buildDynamicAttrCells(cellCount: number): DynamicAttrCell[] {
  const kinds = ["alpha", "beta", "gamma"];
  return Array.from({ length: cellCount }, (_, i) => {
    const row = Math.floor(i / 20);
    const col = i % 20;
    const kind = kinds[i % 3] ?? "alpha";
    return {
      row,
      col,
      kind,
      // Forces &lt; / &gt; escape in `title` attribute
      title: `Cell ${i} <important>`,
      // Forces &amp; / &quot; escape in `aria-label` attribute
      label: `Row ${row} & "main"`,
      bg: `hsl(${(i * 7) % 360},50%,60%)`,
      fg: `hsl(${(i * 7 + 180) % 360},50%,30%)`,
      // Forces &lt; / &gt; escape in text content
      text: `Item #${i} <data>`,
    };
  });
}
