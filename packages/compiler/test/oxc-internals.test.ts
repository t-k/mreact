import { describe, expect, test } from "vitest";
import { assignOxcAwaitIds } from "../src/oxc-await-ids.js";
import {
  collectOxcExportedComponents,
  readOxcPlainComponent,
} from "../src/oxc-component-detection.js";
import { collectBindingNames, collectImportBindingNames } from "../src/oxc-bindings.js";
import { markOxcClientReferences } from "../src/oxc-component-references.js";
import { validateOxcAwaitCompatComponents } from "../src/oxc-await-validation.js";
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

  test("collects local bindings from imports and nested statements", () => {
    expect(
      collectImportBindingNames({
        type: "ImportDeclaration",
        specifiers: [
          { local: { name: "createElement" } },
          { local: { name: "Fragment" } },
        ],
      }),
    ).toEqual(["createElement", "Fragment"]);

    expect(
      collectBindingNames({
        type: "BlockStatement",
        body: [
          { type: "FunctionDeclaration", id: { name: "helper" } },
          {
            type: "IfStatement",
            consequent: {
              type: "VariableDeclaration",
              declarations: [{ id: { name: "whenTrue" } }],
            },
            alternate: {
              type: "ClassDeclaration",
              id: { name: "WhenFalse" },
            },
          },
        ],
      }),
    ).toEqual(["helper", "whenTrue", "WhenFalse"]);
  });

  test("collects exported component names from function and variable declarations", () => {
    expect(
      collectOxcExportedComponents({
        body: [
          {
            type: "ExportNamedDeclaration",
            declaration: {
              type: "FunctionDeclaration",
              id: { name: "Header" },
              body: {
                body: [{ type: "ReturnStatement", argument: { type: "JSXElement" } }],
              },
            },
          },
          {
            type: "ExportNamedDeclaration",
            declaration: {
              type: "VariableDeclaration",
              declarations: [
                {
                  id: { name: "Footer" },
                  init: {
                    type: "ArrowFunctionExpression",
                    body: { type: "JSXElement" },
                  },
                },
              ],
            },
          },
        ],
      }),
    ).toEqual(["Header", "Footer"]);
  });

  test("marks namespace client component references", () => {
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
            kind: "component",
            name: "UI.Button",
            props: [],
            children: [],
          },
        },
      ],
    };
    const clientReferences = new Map([["UI", { moduleId: "./ui.client", exportName: "*" }]]);

    markOxcClientReferences(ir.components[0]?.root ?? { kind: "fragment", children: [] }, clientReferences);

    expect(ir.components[0]?.root).toMatchObject({
      runtime: "compat",
      clientReference: { moduleId: "./ui.client", exportName: "Button" },
    });
  });

  test("reports client component references inside Await boundaries", () => {
    const diagnostics: { code: string; message: string }[] = [];

    validateOxcAwaitCompatComponents(
      {
        kind: "async-boundary",
        valueCode: "promise",
        valueName: "value",
        children: [
          {
            kind: "component",
            name: "ClientButton",
            runtime: "compat",
            clientReference: { moduleId: "./button.client", exportName: "default" },
            props: [],
            children: [],
          },
        ],
      },
      diagnostics,
    );

    expect(diagnostics).toEqual([
      expect.objectContaining({
        code: "MR_UNSUPPORTED_AWAIT_INNER_COMPONENT",
      }),
    ]);
  });
});
