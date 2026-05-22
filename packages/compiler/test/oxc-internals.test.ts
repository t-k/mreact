import { describe, expect, test } from "vitest";
import {
  collectClientRouteModuleAnalysis,
} from "../src/index.js";
import {
  collectClientRouteModuleAnalysisFromContext,
  createCompilerModuleContext,
  transformCompilerModuleContext,
} from "../src/internal.js";
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
import {
  analyzeOxcComponentProp,
  readOxcConsumerRenderProp,
} from "../src/oxc-component-props.js";
import {
  collectOxcVariableInitializers,
  detectUnserializableAwaitValueReason,
  readOxcExpressionAttribute,
  readOxcExpressionAttributeNode,
} from "../src/oxc-await-analysis.js";
import {
  findOxcKeyCodeInChildren,
  isOxcJsxBranch,
  readOxcReturnExpressionFromStatement,
} from "../src/oxc-expression-utils.js";
import {
  formatOxcBodyStatement,
  lowerOxcBodyStatementJsx,
  lowerOxcTopLevelStatement,
} from "../src/oxc-body-lowering.js";
import {
  analyzeOxcExpressionChild,
  analyzeOxcJsxNode,
} from "../src/oxc-child-analysis.js";
import {
  lowerOxcCompatReactNodeExpression,
  lowerOxcNestedJsxExpression,
  lowerOxcReactiveValueExpression,
} from "../src/oxc-nested-lowering.js";
import {
  emitOxcCompatObjectChildren,
  emitOxcServerStringChildren,
} from "../src/oxc-runtime-emit.js";
import { lowerOxcDomNodeExpression } from "../src/oxc-dom-lowering.js";
import { containsRawJsxInIr } from "../src/oxc-raw-jsx.js";
import type { ModuleIr } from "../src/ir.js";

describe("compiler OXC internals", () => {
  test("collects client route inference analysis from one parser summary", () => {
    const analysis = collectClientRouteModuleAnalysis({
      code: `"use client";
import { Counter as ImportedCounter } from "./Counter";

const Alias = ImportedCounter;

export default function Page() {
  return <Alias onClick={() => window.location.reload()} />;
}`,
      filename: "page.tsx",
    });

    expect(analysis.hasUseClientDirective).toBe(true);
    expect(analysis.hasUseServerDirective).toBe(false);
    expect(analysis.clientRuntime).toBe(true);
    expect(analysis.componentCallRoots).toEqual([]);
    expect(analysis.jsxComponentRoots).toContain("ImportedCounter");
    expect(analysis.identifierReferences).toContain("window");
    expect(analysis.staticImports).toMatchObject([
      {
        source: "./Counter",
        specifiers: [{ importedName: "Counter", kind: "named", localName: "ImportedCounter" }],
      },
    ]);
    expect(analysis.topLevelExportRenderInfo).toMatchObject([
      {
        calledComponentRoots: [],
        clientRuntime: true,
        name: "default",
        renderedComponentRoots: ["Alias", "ImportedCounter"],
      },
    ]);
  });

  test("shares a compiler module context between transform and route inference analysis", () => {
    const code = `import { Counter } from "./Counter";

export default function Page() {
  return <Counter />;
}`;
    const context = createCompilerModuleContext({ code, filename: "page.tsx" });
    const analysis = collectClientRouteModuleAnalysisFromContext(context);
    const output = transformCompilerModuleContext({
      code,
      dev: false,
      filename: "page.tsx",
      moduleContext: context,
      target: "server",
    });

    expect(analysis.staticImports).toMatchObject([{ source: "./Counter" }]);
    expect(analysis.topLevelExportRenderInfo).toMatchObject([
      {
        calledComponentRoots: [],
        name: "default",
        renderedComponentRoots: ["Counter"],
      },
    ]);
    expect(output.diagnostics).toEqual([]);
    expect(output.metadata.components).toEqual([{ exportName: "default", name: "Page" }]);
  });

  test("collects component roots rendered through function calls", () => {
    const analysis = collectClientRouteModuleAnalysis({
      code: `import { LegalPage } from "./LegalPage";

const Alias = LegalPage;

export default function Page() {
  return Alias({ title: "Terms" });
}`,
      filename: "page.tsx",
    });

    expect(analysis.componentCallRoots).toEqual(["Alias", "LegalPage"]);
    expect(analysis.topLevelExportRenderInfo).toMatchObject([
      {
        calledComponentRoots: ["Alias", "LegalPage"],
        name: "default",
        renderedComponentRoots: [],
      },
    ]);
  });

  test("marks exports using route-local function-call components as client runtime", () => {
    const analysis = collectClientRouteModuleAnalysis({
      code: `import { cell } from "@reckona/mreact-reactive-core";

const currentTheme = cell("system");

function ThemeToggle() {
  return <button onClick={() => currentTheme.set("dark")}>Dark</button>;
}

export default function Page() {
  return <main>{ThemeToggle()}</main>;
}`,
      filename: "page.tsx",
    });

    expect(analysis.topLevelExportRenderInfo).toMatchObject([
      {
        calledComponentRoots: ["ThemeToggle"],
        clientRuntime: true,
        name: "default",
        renderedComponentRoots: [],
      },
    ]);
  });

  test("detects raw JSX only outside strings and comments", () => {
    const createIr = (bodyStatements: string[]): ModuleIr => ({
      userImports: [],
      moduleStatements: [],
      moduleBindingNames: [],
      components: [
        {
          name: "App",
          exportName: "App",
          parameters: [],
          bodyStatements,
          bindingNames: [],
          root: { kind: "fragment", children: [] },
        },
      ],
    });

    expect(
      containsRawJsxInIr(
        createIr([
          'const text = "<Panel />";',
          "const single = '<Panel data-id=\"x\">';",
          "const tpl = `<Panel />`;",
          "/* <Panel /> */ const value = 1;",
          "// <Panel />\nconst next = 2;",
        ]),
      ),
    ).toBe(false);
    expect(containsRawJsxInIr(createIr(["return <Panel />;"]))).toBe(true);
    expect(containsRawJsxInIr(createIr(["const value = condition ? <Panel /> : null;"]))).toBe(
      true,
    );
  });

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
    expect(diagnostics).toEqual([]);
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

  test("analyzes component props with callback-based JSX child analysis", () => {
    const code = '<Card title="Ada" count={total} header={<h1>Ada</h1>} {...rest} />';
    const countStart = code.indexOf("total");
    const restStart = code.indexOf("rest");
    const headerExpression = { type: "JSXElement", openingElement: {}, children: [] };
    const analyzeJsxNode = () =>
      ({
        kind: "element",
        tagName: "h1",
        attributes: [],
        children: [{ kind: "text", value: "Ada" }],
      }) as const;

    expect(
      analyzeOxcComponentProp(
        code,
        {
          type: "JSXAttribute",
          name: { name: "title" },
          value: { type: "Literal", value: "Ada" },
        },
        analyzeJsxNode,
      ),
    ).toEqual([{ kind: "prop", name: "title", code: '"Ada"' }]);
    expect(
      analyzeOxcComponentProp(
        code,
        {
          type: "JSXAttribute",
          name: { name: "count" },
          value: {
            type: "JSXExpressionContainer",
            expression: { start: countStart, end: countStart + "total".length },
          },
        },
        analyzeJsxNode,
      ),
    ).toEqual([{ kind: "prop", name: "count", code: "total" }]);
    expect(
      analyzeOxcComponentProp(
        code,
        {
          type: "JSXAttribute",
          name: { name: "header" },
          value: { type: "JSXExpressionContainer", expression: headerExpression },
        },
        analyzeJsxNode,
      ),
    ).toEqual([
      {
        kind: "render-prop",
        name: "header",
        children: [
          {
            kind: "element",
            tagName: "h1",
            attributes: [],
            children: [{ kind: "text", value: "Ada" }],
          },
        ],
      },
    ]);
    expect(
      analyzeOxcComponentProp(
        code,
        { type: "JSXSpreadAttribute", argument: { start: restStart, end: restStart + 4 } },
        analyzeJsxNode,
      ),
    ).toEqual([{ kind: "spread-prop", code: "rest" }]);
  });

  test("reads consumer arrow render props", () => {
    const code = "{(value) => value}";
    const rendererStart = code.indexOf("value}");
    const renderProp = readOxcConsumerRenderProp(
      code,
      [
        {
          type: "JSXExpressionContainer",
          expression: {
            type: "ArrowFunctionExpression",
            params: [{ name: "value" }],
            body: { start: rendererStart, end: rendererStart + "value".length },
          },
        },
      ],
      () => ({ kind: "fragment", children: [] }),
    );

    expect(renderProp).toEqual({
      kind: "render-prop",
      name: "children",
      valueName: "value",
      children: [{ kind: "expr", code: "value" }],
    });
  });

  test("reads Await expression attributes and resolves obvious unserializable values", () => {
    const code = '<Await value={Promise.resolve(new Date())} />';
    const valueStart = code.indexOf("Promise.resolve");
    const dateStart = code.indexOf("new Date()");
    const expression = {
      type: "CallExpression",
      callee: {
        type: "MemberExpression",
        object: { name: "Promise" },
        property: { name: "resolve" },
      },
      arguments: [
        {
          type: "NewExpression",
          callee: { name: "Date" },
          start: dateStart,
          end: dateStart + "new Date()".length,
        },
      ],
      start: valueStart,
      end: code.indexOf("}") ,
    };
    const attributes = [
      {
        type: "JSXAttribute",
        name: { name: "value" },
        value: { type: "JSXExpressionContainer", expression },
      },
    ];

    expect(readOxcExpressionAttribute(code, attributes, "value")).toBe(
      "Promise.resolve(new Date())",
    );
    expect(readOxcExpressionAttributeNode(attributes, "value")).toBe(expression);
    expect(detectUnserializableAwaitValueReason(expression)).toBe(
      "new Date() is not JSON-serializable",
    );
  });

  test("collects simple component variable initializers for Await diagnostics", () => {
    const initializer = { type: "NewExpression", callee: { name: "Map" } };

    expect(
      collectOxcVariableInitializers([
        {
          type: "VariableDeclaration",
          declarations: [
            {
              type: "VariableDeclarator",
              id: { type: "Identifier", name: "value" },
              init: initializer,
            },
            {
              type: "VariableDeclarator",
              id: { type: "Identifier", name: "ignored" },
              init: { type: "Literal", value: 1 },
            },
          ],
        },
      ]),
    ).toEqual(
      new Map([
        ["value", initializer],
        ["ignored", { type: "Literal", value: 1 }],
      ]),
    );
  });

  test("reads return expressions and child key codes", () => {
    const jsxExpression = { type: "JSXElement", keyCode: "row.id" };

    expect(
      readOxcReturnExpressionFromStatement({
        type: "BlockStatement",
        body: [{ type: "ReturnStatement", argument: jsxExpression }],
      }),
    ).toBe(jsxExpression);
    expect(isOxcJsxBranch({ type: "ParenthesizedExpression", expression: jsxExpression })).toBe(
      true,
    );
    expect(
      findOxcKeyCodeInChildren([
        {
          kind: "element",
          tagName: "li",
          keyCode: "row.id",
          attributes: [],
          children: [],
        },
      ]),
    ).toBe("row.id");
    expect(findOxcKeyCodeInChildren([{ kind: "text", value: "Ada" }])).toBeUndefined();
  });

  test("lowers JSX variable and push body statements through callbacks", () => {
    const code = "const view = <span />;\nitems.push(<li />);";
    const jsx = { type: "JSXElement" };
    const diagnostics: never[] = [];
    const lowerers = {
      lowerDomNodeExpression: () => "document.createElement(\"span\")",
      lowerCompatObjectExpression: () => "compatNode",
      lowerServerStringExpression: () => '"<span></span>"',
    };

    expect(
      lowerOxcBodyStatementJsx(
        code,
        {
          type: "VariableDeclaration",
          kind: "const",
          declarations: [{ id: { name: "view" }, init: jsx }],
        },
        new Set(),
        "client",
        diagnostics,
        "dom-node",
        lowerers,
      ),
    ).toBe('const view = document.createElement("span");');
    expect(
      lowerOxcBodyStatementJsx(
        code,
        {
          type: "ForOfStatement",
          left: { start: 0, end: 0 },
          right: { start: 0, end: 0 },
          body: {
            type: "BlockStatement",
            body: [
              {
                type: "ExpressionStatement",
                expression: {
                  type: "CallExpression",
                  callee: {
                    type: "MemberExpression",
                    property: { name: "push" },
                    start: code.indexOf("items.push"),
                    end: code.indexOf("items.push") + "items.push".length,
                  },
                  arguments: [jsx],
                },
              },
            ],
          },
        },
        new Set(),
        "client",
        diagnostics,
        "compat-object",
        lowerers,
      ),
    ).toBe("for ( of ) {\n  items.push(compatNode);\n}");
  });

  test("formats preserved body statements and top-level JSX lowering", () => {
    const code = "const view = <span />;";
    const jsx = { type: "JSXElement" };
    const lowerers = {
      lowerDomNodeExpression: () => "node",
      lowerCompatObjectExpression: () => "compatNode",
      lowerServerStringExpression: () => '"html"',
    };

    expect(
      lowerOxcTopLevelStatement(
        code,
        {
          type: "VariableDeclaration",
          kind: "const",
          declarations: [{ id: { name: "view" }, init: jsx }],
        },
        new Set(),
        "server",
        [],
        { topLevelJsx: "server-string" },
        lowerers,
      ),
    ).toBe('const view = "html";');
    expect(formatOxcBodyStatement("const x: number = 1;", { start: 0, end: 19 }, "dom-node")).toBe(
      "const x = 1;",
    );
  });

  test("emits server strings and compat objects from JSX IR", () => {
    expect(
      emitOxcServerStringChildren([
        { kind: "text", value: "Hello " },
        {
          kind: "element",
          tagName: "span",
          attributes: [{ kind: "static-attr", name: "title", value: 'A "B"' }],
          children: [{ kind: "expr", code: "name" }],
        },
      ]),
    ).toBe(
      '"Hello " + "<span" + " title=\\"A &quot;B&quot;\\"" + ">" + _escapeHtml(name) + "</span>"',
    );

    const compatCode = emitOxcCompatObjectChildren([
      {
        kind: "component",
        name: "Card",
        keyCode: "row.id",
        props: [{ kind: "prop", name: "data-id", code: "row.id" }],
        children: [{ kind: "text", value: "Ada" }],
      },
    ]);

    expect(compatCode).toContain("type: Card");
    expect(compatCode).toContain('String(row.id)');
    expect(compatCode).toContain('"data-id": (row.id)');
    expect(compatCode).toContain('children: "Ada"');
  });

  test("lowers DOM JSX elements into imperative node creation", () => {
    const code = '<button className="primary" disabled>{label}<span>Child</span></button>';
    const labelStart = code.indexOf("label");

    expect(
      lowerOxcDomNodeExpression(code, {
        type: "JSXElement",
        openingElement: {
          name: { type: "JSXIdentifier", name: "button" },
          attributes: [
            {
              type: "JSXAttribute",
              name: { name: "className" },
              value: { type: "Literal", value: "primary" },
            },
            { type: "JSXAttribute", name: { name: "disabled" }, value: undefined },
          ],
        },
        children: [
          {
            type: "JSXExpressionContainer",
            expression: { start: labelStart, end: labelStart + "label".length },
          },
          {
            type: "JSXElement",
            openingElement: {
              name: { type: "JSXIdentifier", name: "span" },
              attributes: [],
            },
            children: [{ type: "JSXText", value: "Child" }],
          },
        ],
      }),
    ).toBe(
      [
        "(() => {",
        '  const _node = document.createElement("button");',
        '  _node.setAttribute("class", "primary");',
        '  _node.setAttribute("disabled", "");',
        "  _node.append(String(label));",
        "  _node.append((() => {",
        '  const _node = document.createElement("span");',
        '  _node.append("Child");',
        "  return _node;",
        "})());",
        "  return _node;",
        "})()",
      ].join("\n"),
    );
  });

  test("analyzes JSX nodes and expression children through child analysis context", () => {
    const diagnostics: never[] = [];
    const context = {
      componentNames: new Set(["Card"]),
      target: "client" as const,
      diagnostics,
      bodyStatementJsx: "dom-node" as const,
      lowerNestedJsxExpression: () => "loweredNested",
      bodyLowerers: {
        lowerDomNodeExpression: () => "node",
        lowerCompatObjectExpression: () => "compatNode",
        lowerServerStringExpression: () => '"html"',
      },
    };

    expect(
      analyzeOxcJsxNode(
        "<Card><span>Hi</span></Card>",
        {
          type: "JSXElement",
          openingElement: {
            name: { type: "JSXIdentifier", name: "Card" },
            attributes: [],
          },
          children: [
            {
              type: "JSXElement",
              openingElement: {
                name: { type: "JSXIdentifier", name: "span" },
                attributes: [],
              },
              children: [{ type: "JSXText", value: "Hi" }],
            },
          ],
        },
        context,
      ),
    ).toEqual({
      kind: "component",
      name: "Card",
      props: [],
      children: [
        {
          kind: "element",
          tagName: "span",
          attributes: [],
          children: [{ kind: "text", value: "Hi" }],
        },
      ],
    });

    expect(
      analyzeOxcExpressionChild(
        "[<span />]",
        {
          type: "ArrayExpression",
          start: 0,
          end: "[<span />]".length,
          elements: [{ type: "JSXElement" }],
        },
        context,
      ),
    ).toEqual([{ kind: "expr", code: "loweredNested" }]);
  });

  test("lowers nested JSX expressions for DOM, compat, and reactive component values", () => {
    const code = "[<span>Hi</span>]";
    const jsxElement = {
      type: "JSXElement",
      start: code.indexOf("<span>"),
      end: code.indexOf("</span>") + "</span>".length,
      openingElement: {
        name: { type: "JSXIdentifier", name: "span" },
        attributes: [],
      },
      children: [{ type: "JSXText", value: "Hi" }],
    };
    const diagnostics: never[] = [];

    expect(
      lowerOxcNestedJsxExpression(
        code,
        {
          type: "ArrayExpression",
          start: 0,
          end: code.length,
          elements: [jsxElement],
        },
        new Set(),
        "client",
        diagnostics,
        "dom-node",
      ),
    ).toContain('document.createElement("span")');

    expect(
      lowerOxcCompatReactNodeExpression(
        code,
        {
          type: "ArrayExpression",
          elements: [jsxElement],
        },
        new Set(),
        "client",
        diagnostics,
      ),
    ).toContain('type: "span"');

    const reactiveCode = '<Card title={<span>Hi</span>}>Body</Card>';
    const reactiveSpan = {
      type: "JSXElement",
      start: reactiveCode.indexOf("<span>"),
      end: reactiveCode.indexOf("</span>") + "</span>".length,
      openingElement: {
        name: { type: "JSXIdentifier", name: "span" },
        attributes: [],
      },
      children: [{ type: "JSXText", value: "Hi" }],
    };

    const reactiveCodeResult = lowerOxcReactiveValueExpression(
      reactiveCode,
      {
        type: "JSXElement",
        openingElement: {
          name: { type: "JSXIdentifier", name: "Card" },
          attributes: [
            {
              type: "JSXAttribute",
              name: { name: "title" },
              value: {
                type: "JSXExpressionContainer",
                expression: reactiveSpan,
              },
            },
          ],
        },
        children: [{ type: "JSXText", value: "Body" }],
      },
      new Set(["Card"]),
    );

    expect(reactiveCodeResult).toContain("Card({");
    expect(reactiveCodeResult).toContain('"title": (() => {');
  });
});
