import { describe, expect, test } from "vitest";
import { assignOxcAwaitIds } from "../src/oxc-await-ids.js";
import {
  collectOxcExportedComponents,
  readOxcPlainComponent,
} from "../src/oxc-component-detection.js";
import { collectBindingNames, collectImportBindingNames } from "../src/oxc-bindings.js";
import { markOxcClientReferences } from "../src/oxc-component-references.js";
import { validateOxcAwaitCompatComponents } from "../src/oxc-await-validation.js";
import {
  analyzeOxcAttribute,
  findOxcJsxAttributeCode,
  readOxcJsxTagName,
} from "../src/oxc-jsx-attributes.js";
import {
  collectOxcBodyJsxBindingNames,
  isOxcRenderValueExpression,
  markOxcRenderValueExpressions,
} from "../src/oxc-render-values.js";
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

  test("reads member JSX tag names", () => {
    expect(
      readOxcJsxTagName({
        type: "JSXMemberExpression",
        object: { name: "Dialog" },
        property: { name: "Title" },
      }),
    ).toBe("Dialog.Title");
  });

  test("analyzes static, dynamic, event, and spread attributes", () => {
    const code = '<button id="save" disabled onClick={save} {...props} />';
    const diagnostics: { code: string; message: string }[] = [];
    const propsStart = code.indexOf("props");

    expect(
      analyzeOxcAttribute(
        code,
        {
          type: "JSXAttribute",
          name: { name: "id", start: 8, end: 10 },
          value: { type: "Literal", value: "save" },
        },
        "client",
        diagnostics,
      ),
    ).toEqual([{ kind: "static-attr", name: "id", value: "save" }]);
    expect(
      analyzeOxcAttribute(
        code,
        {
          type: "JSXAttribute",
          name: { name: "onClick", start: 27, end: 34 },
          value: { type: "JSXExpressionContainer", expression: { start: 36, end: 40 } },
        },
        "client",
        diagnostics,
      ),
    ).toEqual([{ kind: "event", name: "onClick", eventName: "click", code: "save" }]);
    expect(
      analyzeOxcAttribute(
        code,
        { type: "JSXSpreadAttribute", argument: { start: propsStart, end: propsStart + 5 } },
        "server",
        diagnostics,
      ),
    ).toEqual([{ kind: "spread-attr", code: "props" }]);
    expect(diagnostics).toEqual([
      expect.objectContaining({ code: "MR_UNSUPPORTED_SPREAD_ATTRIBUTE" }),
    ]);
  });

  test("reads JSX attribute code for boolean, literal, and expression values", () => {
    const code = '<Panel enabled title="Ada" count={items.length} />';
    const countStart = code.indexOf("items.length");
    const attributes = [
      { type: "JSXAttribute", name: { name: "enabled" }, value: undefined },
      { type: "JSXAttribute", name: { name: "title" }, value: { type: "Literal", value: "Ada" } },
      {
        type: "JSXAttribute",
        name: { name: "count" },
        value: {
          type: "JSXExpressionContainer",
          expression: { start: countStart, end: countStart + "items.length".length },
        },
      },
    ];

    expect(findOxcJsxAttributeCode(code, attributes, "enabled")).toBe("true");
    expect(findOxcJsxAttributeCode(code, attributes, "title")).toBe('"Ada"');
    expect(findOxcJsxAttributeCode(code, attributes, "count")).toBe("items.length");
  });

  test("collects JSX-producing body bindings without reassigned let bindings", () => {
    expect(
      [...collectOxcBodyJsxBindingNames([
        {
          type: "VariableDeclaration",
          kind: "const",
          declarations: [{ id: { name: "stable" }, init: { type: "JSXElement" } }],
        },
        {
          type: "VariableDeclaration",
          kind: "let",
          declarations: [{ id: { name: "mutable" }, init: { type: "JSXElement" } }],
        },
        {
          type: "ExpressionStatement",
          expression: {
            type: "AssignmentExpression",
            left: { type: "Identifier", name: "mutable" },
            right: { type: "Literal", value: "" },
          },
        },
        {
          type: "ForOfStatement",
          body: {
            type: "BlockStatement",
            body: [
              {
                type: "ExpressionStatement",
                expression: {
                  type: "CallExpression",
                  callee: {
                    type: "MemberExpression",
                    object: { name: "items" },
                    property: { name: "push" },
                  },
                  arguments: [{ type: "JSXElement" }],
                },
              },
            ],
          },
        },
        {
          type: "ForStatement",
          body: {
            type: "BlockStatement",
            body: [
              {
                type: "ExpressionStatement",
                expression: {
                  type: "CallExpression",
                  callee: {
                    type: "MemberExpression",
                    object: { name: "moreItems" },
                    property: { name: "push" },
                  },
                  arguments: [{ type: "JSXElement" }],
                },
              },
            ],
          },
        },
        {
          type: "ExpressionStatement",
          expression: {
            type: "CallExpression",
            callee: {
              type: "MemberExpression",
              object: { name: "ignoredTopLevelPush" },
              property: { name: "push" },
            },
            arguments: [{ type: "JSXElement" }],
          },
        },
      ])],
    ).toEqual(["stable", "items", "moreItems"]);
  });

  test("marks render value expressions recursively", () => {
    const nodes = [
      {
        kind: "conditional" as const,
        conditionCode: "ok",
        whenTrue: [{ kind: "expr" as const, code: "header" }],
        whenFalse: [
          {
            kind: "fragment" as const,
            children: [{ kind: "expr" as const, code: "footer" }],
          },
        ],
      },
    ];

    markOxcRenderValueExpressions(nodes, new Set(["header", "footer"]), "html");

    expect(nodes).toEqual([
      {
        kind: "conditional",
        conditionCode: "ok",
        whenTrue: [{ kind: "expr", code: "header", renderMode: "html" }],
        whenFalse: [
          {
            kind: "fragment",
            children: [{ kind: "expr", code: "footer", renderMode: "html" }],
          },
        ],
      },
    ]);
  });

  test("recognizes render-value props member expressions", () => {
    expect(
      isOxcRenderValueExpression({
        type: "MemberExpression",
        object: { type: "Identifier", name: "props" },
        property: { name: "children" },
      }),
    ).toBe(true);
    expect(
      isOxcRenderValueExpression({
        type: "MemberExpression",
        object: { type: "Identifier", name: "state" },
        property: { name: "children" },
      }),
    ).toBe(false);
  });
});
