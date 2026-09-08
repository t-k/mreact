import { describe, expect, test } from "vitest";
import { parseSync } from "oxc-parser";
import {
  UNKNOWN_EXPRESSION_FACTS,
  invalidateExpressionFacts,
  mergeExpressionFacts,
  readExpressionFacts,
  sameResolvedBinding,
  type ExpressionFactsIr,
  type ResolvedBindingIr,
} from "../src/expression-facts.js";
import {
  analyzeOxcExpressionFacts,
  collectOxcModuleExpressionFacts,
  collectOxcEscapedBindingNames,
  collectOxcMutatedBindingNames,
  collectOxcNativeCellBindings,
  collectOxcNativeCellFactoryNames,
  resolveOxcComponentNativeCellBindings,
} from "../src/oxc-expression-facts.js";

function parseStatements(code: string): unknown[] {
  const parsed = parseSync("Facts.tsx", code, { lang: "tsx", sourceType: "module", astType: "ts" });

  expect(parsed.errors).toEqual([]);
  return (parsed.program as unknown as { body: unknown[] }).body;
}

function parseProgram(code: string): { body: unknown[]; program: unknown } {
  const parsed = parseSync("Facts.tsx", code, { lang: "tsx", sourceType: "module", astType: "ts" });

  expect(parsed.errors).toEqual([]);
  return {
    body: (parsed.program as unknown as { body: unknown[] }).body,
    program: parsed.program,
  };
}

/** Parses one expression statement and returns the expression node it holds. */
function parseExpression(code: string): Record<string, unknown> {
  const [statement] = parseStatements(`${code};`) as Record<string, unknown>[];

  return (statement as { expression: Record<string, unknown> }).expression;
}

const cellImport = 'import { cell } from "@reckona/mreact-reactive-core";\n';

describe("native cell factory import collection", () => {
  test("collects the local name of a named cell import", () => {
    expect([...collectOxcNativeCellFactoryNames(parseStatements(cellImport))]).toEqual(["cell"]);
  });

  test("collects the alias of a renamed cell import", () => {
    const statements = parseStatements(
      'import { cell as makeCell, computed } from "@reckona/mreact-reactive-core";',
    );

    expect([...collectOxcNativeCellFactoryNames(statements)]).toEqual(["makeCell"]);
  });

  test("ignores cell exports from other modules and non-named import forms", () => {
    const sources = [
      'import { cell } from "@reckona/mreact-store";',
      'import { cell } from "@reckona/mreact-reactive-core/internal";',
      'import cell from "@reckona/mreact-reactive-core";',
      'import * as cell from "@reckona/mreact-reactive-core";',
      'export { cell } from "@reckona/mreact-reactive-core";',
      'export * from "@reckona/mreact-reactive-core";',
      'export const cell = 1;',
    ];

    for (const source of sources) {
      expect([...collectOxcNativeCellFactoryNames(parseStatements(source))], source).toEqual([]);
    }
  });
});

describe("native cell binding collection", () => {
  const factories = new Set(["cell"]);

  test("records the declarator span of a const cell binding", () => {
    const code = `${cellImport}const count = cell(0);`;
    const bindings = collectOxcNativeCellBindings(parseStatements(code), factories);
    const binding = bindings.get("count") as ResolvedBindingIr;

    expect(binding.name).toBe("count");
    expect(code.slice(binding.start, binding.end)).toBe("count = cell(0)");
  });

  test("records exported const cell bindings", () => {
    const bindings = collectOxcNativeCellBindings(
      parseStatements(`${cellImport}export const count = cell(0);`),
      factories,
    );

    expect(bindings.has("count")).toBe(true);
  });

  test("returns nothing when no factory name is known", () => {
    expect(
      collectOxcNativeCellBindings(parseStatements(`${cellImport}const count = cell(0);`), new Set())
        .size,
    ).toBe(0);
  });

  test("rejects declarations that do not prove a stable native cell", () => {
    const sources = [
      "let count = cell(0);",
      "var count = cell(0);",
      "const { count } = cell(0);",
      "const [count] = cell(0);",
      "const count = other(0);",
      "const count = core.cell(0);",
      "const count = cell;",
      "const count = cell?.(0);",
      "const count = new cell(0);",
    ];

    for (const source of sources) {
      const bindings = collectOxcNativeCellBindings(
        parseStatements(`${cellImport}${source}`),
        factories,
      );

      expect(bindings.has("count"), source).toBe(false);
    }
  });

  test("keeps the last declaration when a name is declared twice", () => {
    const code = `${cellImport}const count = cell(0);\nconst count = cell(1);`;
    const binding = collectOxcNativeCellBindings(
      parseStatements(code),
      factories,
    ).get("count") as ResolvedBindingIr;

    expect(code.slice(binding.start, binding.end)).toBe("count = cell(1)");
  });
});

describe("mutated binding collection", () => {
  test("records every write shape that could replace a cell method", () => {
    const cases: [string, string][] = [
      ["count = other;", "count"],
      ["count.get = other;", "count"],
      ["count[name] = other;", "count"],
      ["count.value += 1;", "count"],
      ["count.value += 1;", "count"],
      ["delete count.get;", "count"],
      ["count.total++;", "count"],
      ["function inner() { count.get = other; }", "count"],
    ];

    for (const [source, expected] of cases) {
      expect([...collectOxcMutatedBindingNames(parseStatements(source))], source).toContain(
        expected,
      );
    }
  });

  test("does not record reads or unrelated writes", () => {
    const names = collectOxcMutatedBindingNames(
      parseStatements("const value = count.get(); other.field = 1; count.get();"),
    );

    expect(names.has("count")).toBe(false);
    expect(names.has("other")).toBe(true);
  });

  test("does not mistake operands of other expression shapes for writes", () => {
    const names = collectOxcMutatedBindingNames(
      parseStatements(
        "const total = first + second; const negated = !third; function read() { return fourth; }",
      ),
    );

    expect([...names]).toEqual([]);
  });
});

describe("escaped binding collection", () => {
  test("records every use that could hand the cell to code replacing its methods", () => {
    const cases: [string, string][] = [
      ["const alias = count;", "count"],
      ["helper(count);", "count"],
      ["Object.assign(count, { get: other });", "count"],
      ["const read = count.get;", "count"],
      ["const list = [count];", "count"],
      ["const bag = { count };", "count"],
      ["const bag = { value: count };", "count"],
      ["function inner() { return count; }", "count"],
      ["count.get = other;", "count"],
      ["count[name]();", "count"],
      ["count.get.call(other);", "count"],
    ];

    for (const [source, expected] of cases) {
      expect([...collectOxcEscapedBindingNames(parseStatements(source))], source).toContain(
        expected,
      );
    }
  });

  test("keeps a cell that is only ever a method call receiver", () => {
    const names = collectOxcEscapedBindingNames(
      parseStatements(
        [
          'import { cell } from "@reckona/mreact-reactive-core";',
          "const count = cell(0);",
          "count.get();",
          "count.set(count.get() + 1);",
          "const onClick = () => count.setValue(2);",
          "const bag = { count: 1 };",
          "other.count = 2;",
          "other.count();",
        ].join("\n"),
      ),
    );

    expect(names.has("count")).toBe(false);
    expect(names.has("other")).toBe(true);
  });
});

describe("expression facts analysis", () => {
  const bindings = new Map<string, ResolvedBindingIr>([
    ["count", { name: "count", start: 1, end: 2 }],
  ]);

  test("proves a plain zero-argument get call on a known binding", () => {
    expect(analyzeOxcExpressionFacts(parseExpression("count.get()"), bindings)).toEqual({
      value: { kind: "native-cell-read", binding: bindings.get("count") },
      dependencies: [bindings.get("count")],
      effectFree: "proven",
      escape: "unknown",
    });
  });

  test("looks through parentheses and type arguments that cannot change the read", () => {
    for (const source of ["(count.get())", "(count).get()", "count.get<number>()"]) {
      expect(analyzeOxcExpressionFacts(parseExpression(source), bindings)?.value.kind, source).toBe(
        "native-cell-read",
      );
    }
  });

  test("proves nothing without a binding map", () => {
    expect(analyzeOxcExpressionFacts(parseExpression("count.get()"), undefined)).toBeUndefined();
    expect(analyzeOxcExpressionFacts(parseExpression("count.get()"), new Map())).toBeUndefined();
  });

  test("proves nothing for call shapes outside the supported subset", () => {
    const sources = [
      "count",
      "count.get",
      "count.get(1)",
      "count?.get()",
      "count[read]()",
      "count[get]()",
      'count["get"]()',
      "new count.get()",
      "count.peek()",
      "make().get()",
      "unknown.get()",
      "this.get()",
    ];

    for (const source of sources) {
      expect(analyzeOxcExpressionFacts(parseExpression(source), bindings), source).toBeUndefined();
    }
  });
});

describe("component-scoped native cell resolution", () => {
  test("returns nothing when the module never imports the cell factory", () => {
    const { body, program } = parseProgram("export function App() { return null; }");
    const moduleFacts = collectOxcModuleExpressionFacts(program, body);

    expect(moduleFacts.nativeCellFactoryNames.size).toBe(0);
    expect(resolveOxcComponentNativeCellBindings(moduleFacts, body, [])).toBeUndefined();
    expect(resolveOxcComponentNativeCellBindings(undefined, body, [])).toBeUndefined();
  });

  test("prefers a component-local declaration over a module-level one", () => {
    const code = `${cellImport}const count = cell(0);\nexport function App() { const count = cell(1); return null; }`;
    const { body, program } = parseProgram(code);
    const componentBody = (
      (body[2] as { declaration: { body: { body: unknown[] } } }).declaration.body as {
        body: unknown[];
      }
    ).body;
    const resolved = resolveOxcComponentNativeCellBindings(
      collectOxcModuleExpressionFacts(program, body),
      componentBody,
      [],
    ) as Map<string, ResolvedBindingIr>;

    expect(code.slice(resolved.get("count")?.start, resolved.get("count")?.end)).toBe(
      "count = cell(1)",
    );
  });

  test("drops shadowed names and names written anywhere in the module", () => {
    const code = `${cellImport}const count = cell(0);\nconst other = cell(1);\nfunction touch() { other.get = null; }`;
    const { body, program } = parseProgram(code);
    const moduleFacts = collectOxcModuleExpressionFacts(program, body);

    expect([...(resolveOxcComponentNativeCellBindings(moduleFacts, [], []) ?? [])].map(
      ([name]) => name,
    )).toEqual(["count"]);
    expect(resolveOxcComponentNativeCellBindings(moduleFacts, [], ["count"])).toBeUndefined();
  });
});

describe("expression facts contract", () => {
  const binding: ResolvedBindingIr = { name: "count", start: 3, end: 9 };
  const other: ResolvedBindingIr = { name: "label", start: 20, end: 26 };
  const proven: ExpressionFactsIr = {
    value: { kind: "native-cell-read", binding },
    dependencies: [binding],
    effectFree: "proven",
    escape: "contained",
    phases: ["update"],
  };

  test("treats a node without facts as fully unknown", () => {
    expect(readExpressionFacts({ facts: undefined })).toBe(UNKNOWN_EXPRESSION_FACTS);
    expect(readExpressionFacts({ facts: proven })).toBe(proven);
    expect(invalidateExpressionFacts()).toBe(UNKNOWN_EXPRESSION_FACTS);
  });

  test("compares resolved bindings by name and by declaration span", () => {
    expect(sameResolvedBinding(binding, { ...binding })).toBe(true);
    expect(sameResolvedBinding(binding, { ...binding, name: "other" })).toBe(false);
    expect(sameResolvedBinding(binding, { ...binding, start: 4 })).toBe(false);
    expect(sameResolvedBinding(binding, { ...binding, end: 10 })).toBe(false);
  });

  test("keeps a fact only when both merged sides prove it", () => {
    expect(mergeExpressionFacts(proven, proven)).toEqual(proven);
    expect(mergeExpressionFacts(proven, { ...proven, effectFree: "unknown" }).effectFree).toBe(
      "unknown",
    );
    expect(mergeExpressionFacts(proven, { ...proven, escape: "unknown" }).escape).toBe("unknown");
    expect(
      mergeExpressionFacts(proven, {
        ...proven,
        value: { kind: "native-cell-read", binding: other },
      }).value,
    ).toEqual({ kind: "unknown" });
    expect(mergeExpressionFacts(proven, { ...proven, value: { kind: "unknown" } }).value).toEqual({
      kind: "unknown",
    });
  });

  test("unions dependencies and phases and degrades when one side is unknown", () => {
    const merged = mergeExpressionFacts(proven, {
      ...proven,
      dependencies: [other, binding],
      phases: ["mount", "update"],
    });

    expect(merged.dependencies).toEqual([binding, other]);
    expect(merged.phases).toEqual(["update", "mount"]);
    expect(
      mergeExpressionFacts(proven, { ...proven, dependencies: undefined }).dependencies,
    ).toBeUndefined();
    expect(mergeExpressionFacts(proven, { ...proven, phases: undefined }).phases).toBeUndefined();
  });

  test("merging with the unknown fact set erases every proven fact", () => {
    expect(mergeExpressionFacts(proven, UNKNOWN_EXPRESSION_FACTS)).toEqual(UNKNOWN_EXPRESSION_FACTS);
    expect(mergeExpressionFacts(UNKNOWN_EXPRESSION_FACTS, proven)).toEqual(UNKNOWN_EXPRESSION_FACTS);
  });
});
