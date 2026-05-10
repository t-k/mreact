import { describe, expect, test } from "vitest";
import { analyzeToIr } from "../src/internal.js";

describe("compiler internal IR", () => {
  test("exposes key-aware list IR for Rust/Oxc parity checks", () => {
    const output = analyzeToIr({
      code: 'export function App() { const items = [{ id: "a", label: "A" }]; return <ul>{items.map((item) => <li key={item.id}>{item.label}</li>)}</ul>; }',
      filename: "App.tsx",
      target: "client",
    });

    expect(output.diagnostics).toEqual([]);
    expect(output.ir.components[0]?.root).toMatchObject({
      kind: "element",
      tagName: "ul",
      children: [
        {
          kind: "list",
          itemsCode: "items",
          itemName: "item",
          keyCode: "item.id",
          children: [
            {
              kind: "element",
              tagName: "li",
              attributes: [],
              children: [{ kind: "expr", code: "item.label" }],
            },
          ],
        },
      ],
    });
  });
});
