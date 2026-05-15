import { describe, expect, test } from "vitest";
import { assignOxcAwaitIds } from "../src/oxc-await-ids.js";
import { readOxcPlainComponent } from "../src/oxc-component-detection.js";
import type { ModuleIr } from "../src/ir.js";

describe("compiler OXC internals", () => {
  test("assigns await ids in stable depth-first render order", () => {
    const ir: ModuleIr = {
      userImports: [],
      moduleStatements: [],
      moduleBindingNames: [],
      components: [
        {
          name: "App",
          exportName: "App",
          parameters: [],
          bodyStatements: [],
          bindingNames: [],
          root: {
            kind: "fragment",
            children: [
              {
                kind: "async-boundary",
                valueCode: "first",
                valueName: "value",
                children: [
                  {
                    kind: "async-boundary",
                    valueCode: "nested",
                    valueName: "nested",
                    children: [],
                  },
                ],
                placeholderChildren: [
                  {
                    kind: "async-boundary",
                    valueCode: "placeholder",
                    valueName: "placeholder",
                    children: [],
                  },
                ],
              },
            ],
          },
        },
      ],
    };

    assignOxcAwaitIds(ir);

    const [first] = ir.components[0]?.root.kind === "fragment" ? ir.components[0].root.children : [];
    expect(first?.kind).toBe("async-boundary");
    if (first?.kind !== "async-boundary") {
      throw new Error("expected async boundary");
    }

    expect(first.awaitId).toBe("await0");
    expect(first.children[0]?.kind === "async-boundary" ? first.children[0].awaitId : undefined).toBe(
      "await1",
    );
    expect(
      first.placeholderChildren?.[0]?.kind === "async-boundary"
        ? first.placeholderChildren[0].awaitId
        : undefined,
    ).toBe("await2");
  });

  test("detects plain uppercase function components with JSX returns", () => {
    const statement = {
      type: "FunctionDeclaration",
      id: { type: "Identifier", name: "Card" },
      body: {
        type: "BlockStatement",
        body: [
          {
            type: "ReturnStatement",
            argument: { type: "JSXElement" },
          },
        ],
      },
    };

    expect(readOxcPlainComponent(statement)?.name).toBe("Card");
    expect(
      readOxcPlainComponent({
        ...statement,
        id: { type: "Identifier", name: "notComponent" },
      }),
    ).toBeUndefined();
  });
});
