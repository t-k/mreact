import { describe, expect, test } from "vitest";
import {
  collectClientRouteCapabilityFacts,
  scanModuleSource,
  type ClientRouteCapabilityFacts,
} from "../src/route-client-capabilities.js";

function createGraph(
  modules: Readonly<Record<string, string>>,
): Pick<
  Parameters<typeof collectClientRouteCapabilityFacts>[0],
  "readModule" | "resolveImport"
> {
  return {
    readModule: async (file) => {
      const source = modules[file];

      if (source === undefined) {
        throw new Error(`missing module ${file}`);
      }

      return source;
    },
    resolveImport: async ({ specifier }) => {
      const candidate = specifier.replace(/^\.\//u, "").replace(/\.js$/u, "");

      return Object.keys(modules).find((file) => file === candidate) ?? undefined;
    },
  };
}

async function factsFor(
  code: string,
  modules: Readonly<Record<string, string>> = {},
  overrides: Partial<Parameters<typeof collectClientRouteCapabilityFacts>[0]> = {},
): Promise<ClientRouteCapabilityFacts> {
  return await collectClientRouteCapabilityFacts({
    code,
    filename: "route",
    ...createGraph(modules),
    ...overrides,
  });
}

describe("client route capability facts", () => {
  test("reports every capability unused for a route that uses none", async () => {
    const facts = await factsFor(`export default function Page() {
  return <main>Static</main>;
}`);

    expect(facts).toEqual({
      cells: "known-unused",
      domRefs: "known-unused",
      eventBindings: "known-unused",
      reactiveEffect: "known-unused",
      requestLocation: "known-unused",
    });
  });

  test("reads capabilities from the route module itself", async () => {
    const facts = await factsFor(`import { cell, effect } from "@reckona/mreact-reactive-core";
import { bindDomRef } from "@reckona/mreact-reactive-dom";

export default function Page(props) {
  const node = cell(null);
  effect(() => { document.title = props.request.pathname; });
  return <div ref={bindDomRef(node)} onClick={() => node.get()?.focus()} />;
}`);

    expect(facts).toEqual({
      cells: "known-used",
      domRefs: "known-used",
      eventBindings: "known-used",
      reactiveEffect: "known-used",
      requestLocation: "known-used",
    });
  });

  test("follows an aliased import binding to its call site", async () => {
    const facts = await factsFor(`import { cell as makeCell } from "@reckona/mreact-reactive-core";

export default function Page() {
  const count = makeCell(0);
  return <span>{count.get()}</span>;
}`);

    expect(facts.cells).toBe("known-used");
  });

  test("does not read a shadowed local named cell as reactive state", async () => {
    const facts = await factsFor(`export default function Page() {
  const cell = (value) => value;
  return <span>{cell("plain")}</span>;
}`);

    expect(facts.cells).toBe("known-unused");
  });

  test("does not read a member access named cell as a cell call", async () => {
    const facts = await factsFor(`import { cell } from "@reckona/mreact-reactive-core";

export default function Page(props) {
  return <span>{props.table.cell(1)}</span>;
}`);

    expect(facts.cells).toBe("known-unused");
  });

  test("ignores capability words inside comments and string literals", async () => {
    const facts = await factsFor(`// cell(0) and effect(() => {}) and props.request.pathname
export default function Page() {
  const note = "cell(0) request.pathname onClick=";
  return <main>{note}</main>;
}`);

    expect(facts).toEqual({
      cells: "known-unused",
      domRefs: "known-unused",
      eventBindings: "known-unused",
      reactiveEffect: "known-unused",
      requestLocation: "known-unused",
    });
  });

  test("propagates a child capability through a relative import", async () => {
    const facts = await factsFor(
      `import { Counter } from "./counter.js";

export default function Page() {
  return <main><Counter /></main>;
}`,
      {
        counter: `import { cell } from "@reckona/mreact-reactive-core";

export function Counter() {
  const count = cell(0);
  return <button onClick={() => count.set((value) => value + 1)}>{count.get()}</button>;
}`,
      },
    );

    expect(facts.cells).toBe("known-used");
    expect(facts.eventBindings).toBe("known-used");
    expect(facts.domRefs).toBe("known-unused");
  });

  test("follows a re-export without losing the capability behind it", async () => {
    const facts = await factsFor(
      `import { Counter } from "./barrel.js";

export default function Page() {
  return <main><Counter /></main>;
}`,
      {
        barrel: `export { Counter } from "./counter.js";`,
        counter: `import { cell } from "@reckona/mreact-reactive-core";

export function Counter() {
  const count = cell(0);
  return <span>{count.get()}</span>;
}`,
      },
    );

    expect(facts.cells).toBe("known-used");
  });

  test("terminates on an import cycle", async () => {
    const facts = await factsFor(
      `import { A } from "./a.js";

export default function Page() {
  return <main><A /></main>;
}`,
      {
        a: `import { B } from "./b.js";
import { effect } from "@reckona/mreact-reactive-core";

export function A() {
  effect(() => undefined);
  return <span><B /></span>;
}`,
        b: `import { A } from "./a.js";

export function B() {
  return <em>{typeof A}</em>;
}`,
      },
    );

    expect(facts.reactiveEffect).toBe("known-used");
    expect(facts.cells).toBe("known-unused");
  });

  test("falls back to unknown when a relative import cannot be resolved", async () => {
    const facts = await factsFor(`import { Missing } from "./missing.js";

export default function Page() {
  return <main><Missing /></main>;
}`);

    expect(facts.cells).toBe("unknown");
    expect(facts.requestLocation).toBe("unknown");
  });

  test("falls back to unknown for a dynamic import", async () => {
    const facts = await factsFor(`const load = () => import("./panel.js");

export default function Page() {
  return <main>{String(load)}</main>;
}`);

    expect(facts.requestLocation).toBe("unknown");
  });

  test("falls back to unknown for an opaque package but not for a runtime package", async () => {
    const opaque = await factsFor(`import { chart } from "some-charting-library";

export default function Page() {
  return <main>{chart()}</main>;
}`);
    const runtime = await factsFor(`import { computed } from "@reckona/mreact-reactive-core";

export default function Page() {
  return <main>{computed(() => 1).get()}</main>;
}`);

    expect(opaque.cells).toBe("unknown");
    expect(runtime.cells).toBe("known-unused");
  });

  test("keeps a style side-effect import out of the opaque set", async () => {
    const facts = await factsFor(`import "./page.css";

export default function Page() {
  return <main>Styled</main>;
}`);

    expect(facts.cells).toBe("known-unused");
  });

  test("skips excluded modules instead of adopting their capabilities", async () => {
    const modules = {
      "island.client": `import { cell } from "@reckona/mreact-reactive-core";

export function Island() {
  const count = cell(0);
  return <span>{count.get()}</span>;
}`,
    };
    const code = `import { Island } from "./island.client.js";

export default function Page() {
  return <main><Island /></main>;
}`;

    const included = await factsFor(code, modules);
    const excluded = await factsFor(code, modules, {
      isExcludedModule: (file) => file.endsWith(".client"),
    });

    expect(included.cells).toBe("known-used");
    expect(excluded.cells).toBe("known-unused");
  });

  test("ignores a module that imports a Node builtin", async () => {
    const facts = await factsFor(
      `import { readTitle } from "./store.js";

export default function Page() {
  return <main>{readTitle("id")}</main>;
}`,
      {
        store: `import { basename } from "node:path";
import { cell } from "@reckona/mreact-reactive-core";

const title = cell("");

export function readTitle(id) {
  return basename(id) + title.get();
}`,
      },
    );

    expect(facts.cells).toBe("known-unused");
  });

  test("degrades to unknown once the module budget is exhausted", async () => {
    const modules: Record<string, string> = {};
    for (let index = 0; index < 6; index += 1) {
      modules[`m${index}`] =
        index === 5
          ? "export const leaf = 1;"
          : `export { leaf } from "./m${index + 1}.js";\nexport const value = ${index};`;
    }

    const withinBudget = await factsFor(`export { leaf } from "./m0.js";`, modules);
    const overBudget = await factsFor(`export { leaf } from "./m0.js";`, modules, {
      maxModules: 3,
    });

    expect(withinBudget.cells).toBe("known-unused");
    expect(overBudget.cells).toBe("unknown");
  });

  test("treats an unterminated literal as an unresolved module", async () => {
    const facts = await factsFor('export const broken = "unterminated;');

    expect(facts.cells).toBe("unknown");
  });

  test("reads an aliased and a type-prefixed named import binding", async () => {
    const aliased = await factsFor(`import { type Cell, effect as runEffect } from "@reckona/mreact-reactive-core";

export default function Page() {
  runEffect(() => undefined);
  return <main>{String(0 as unknown as Cell)}</main>;
}`);
    const defaultOnly = await factsFor(`import reactiveCore from "@reckona/mreact-reactive-core";

export default function Page() {
  return <main>{String(reactiveCore)}</main>;
}`);

    expect(aliased.reactiveEffect).toBe("known-used");
    expect(aliased.cells).toBe("known-unused");
    expect(defaultOnly.reactiveEffect).toBe("known-unused");
  });

  test("survives empty and trailing entries in a named import clause", async () => {
    const trailingComma = await factsFor(`import { cell, } from "@reckona/mreact-reactive-core";

export const value = cell(0);`);
    const emptyClause = await factsFor(`import {} from "@reckona/mreact-reactive-core";

export const value = 1;`);
    const namespaceOnly = await factsFor(`import * as core from "@reckona/mreact-reactive-core";

export const value = core.cell(0);`);

    expect(trailingComma.cells).toBe("known-used");
    expect(emptyClause.cells).toBe("known-unused");
    // A namespace import binds no name we track, so nothing is claimed either way beyond the module.
    expect(namespaceOnly.cells).toBe("known-unused");
  });

  test("reads a use client directive on a child but not on the route itself", async () => {
    const routeDirective = await factsFor(`"use client";
import { cell } from "@reckona/mreact-reactive-core";

export default function Page() {
  return <main>{cell(0).get()}</main>;
}`);
    const childDirective = await factsFor(
      `import { Island } from "./island.js";

export default function Page() {
  return <main><Island /></main>;
}`,
      {
        island: `"use client";
import { cell } from "@reckona/mreact-reactive-core";

export function Island() {
  return <span>{cell(0).get()}</span>;
}`,
      },
    );

    expect(routeDirective.cells).toBe("known-used");
    expect(childDirective.cells).toBe("known-unused");
  });

  test("reads a generic cell call that a call-shaped pattern would miss", async () => {
    const facts = await factsFor(`import { cell } from "@reckona/mreact-reactive-core";

export const locale = cell<string>("ja");`);

    expect(facts.cells).toBe("known-used");
  });

  test("does not read the import statement itself as a use of the binding", async () => {
    const facts = await factsFor(`import { cell } from "@reckona/mreact-reactive-core";

export default function Page() {
  return <main>Static</main>;
}`);

    expect(facts.cells).toBe("known-unused");
  });

  test("keeps a query string on a style specifier out of the opaque set", async () => {
    const facts = await factsFor(`import "./page.css?inline";

export default function Page() {
  return <main>Styled</main>;
}`);

    expect(facts.cells).toBe("known-unused");
  });

  test("reads request only through a member access or a destructured binding", async () => {
    const member = await factsFor(`export default function Page(props) {
  return <main>{props.request.pathname}</main>;
}`);
    const bareIdentifier = await factsFor(`export default function Page() {
  const request = 1;
  return <main>{request}</main>;
}`);
    const bareRead = await factsFor(`export default function Page() {
  return <main>{request.search}</main>;
}`);

    expect(member.requestLocation).toBe("known-used");
    expect(bareIdentifier.requestLocation).toBe("known-unused");
    expect(bareRead.requestLocation).toBe("known-used");
  });

  test("reads a destructured request binding as a location read", async () => {
    const facts = await factsFor(`export default function Page({ request }) {
  return <main>{request.pathname}</main>;
}`);

    expect(facts.requestLocation).toBe("known-used");
  });
});

describe("module source scanning", () => {
  test("blanks comments in both views and literals only in the capability view", () => {
    const scanned = scanModuleSource(`import { a } from "./a.js"; // cell(0)
const text = "cell(1)";`);

    expect(scanned?.withoutComments).toContain('"./a.js"');
    expect(scanned?.withoutComments).not.toContain("cell(0)");
    expect(scanned?.withoutLiterals).not.toContain("./a.js");
    expect(scanned?.withoutLiterals).not.toContain("cell(1)");
    expect(scanned?.withoutComments.length).toBe(scanned?.withoutLiterals.length);
  });

  test("keeps a JSX closing tag from being read as a regular expression", () => {
    const scanned = scanModuleSource(`export function Page() {
  return <div onClick={() => cell(0)}>text</div>;
}`);

    expect(scanned?.withoutLiterals).toContain("cell(0)");
    expect(scanned?.withoutLiterals).toContain("</div>");
  });

  test("blanks a regular expression literal so its contents are not evidence", () => {
    const scanned = scanModuleSource(`const pattern = /cell\\(0\\)/u;
export const test = pattern;`);

    expect(scanned?.withoutLiterals).not.toContain("cell");
  });

  test("blanks template literal text but keeps the surrounding code", () => {
    const scanned = scanModuleSource("const label = `cell(0) ${value} effect(1)`;\nexport { label };");

    expect(scanned?.withoutLiterals).not.toContain("cell(0)");
    expect(scanned?.withoutLiterals).toContain("const label");
    expect(scanned?.withoutLiterals).toContain("export { label }");
  });

  test("returns undefined for an unterminated block comment", () => {
    expect(scanModuleSource("/* unterminated")).toBeUndefined();
  });

  test("returns undefined for a string literal broken by a newline", () => {
    expect(scanModuleSource('const broken = "start\nend";')).toBeUndefined();
  });

  test("returns undefined for an unterminated template literal", () => {
    expect(scanModuleSource("const broken = `start")).toBeUndefined();
  });

  test("returns undefined for a regular expression broken by a newline", () => {
    expect(scanModuleSource("const broken = /start\nend/;")).toBeUndefined();
  });

  test("keeps an escaped quote from ending a string literal early", () => {
    const scanned = scanModuleSource('const value = "a \\" cell(0) b";\nexport const done = 1;');

    expect(scanned?.withoutLiterals).not.toContain("cell(0)");
    expect(scanned?.withoutLiterals).toContain("export const done");
  });

  test("keeps a nested template substitution from ending the literal early", () => {
    const scanned = scanModuleSource(
      "const value = `outer ${ `inner cell(0)` } tail`;\nexport const done = 1;",
    );

    expect(scanned?.withoutLiterals).not.toContain("cell(0)");
    expect(scanned?.withoutLiterals).toContain("export const done");
  });

  test("keeps a slash inside a regular expression character class from closing it", () => {
    const scanned = scanModuleSource("const pattern = ([/[/]cell/giu]);\nexport const done = 1;");

    expect(scanned?.withoutLiterals).not.toContain("cell");
    expect(scanned?.withoutLiterals).toContain("export const done");
  });

  test("blanks an escaped character inside a regular expression", () => {
    const scanned = scanModuleSource("const pattern = (/\\/cell\\//u);\nexport const done = 1;");

    expect(scanned?.withoutLiterals).not.toContain("cell");
    expect(scanned?.withoutLiterals).toContain("export const done");
  });

  test("treats a slash after an identifier as division rather than a regular expression", () => {
    const scanned = scanModuleSource("const ratio = total / count;\nexport const done = 1;");

    expect(scanned?.withoutLiterals).toContain("total / count");
  });

  test("blanks a terminated block comment in both views", () => {
    const scanned = scanModuleSource("/* cell(0) */ export const done = 1;");

    expect(scanned?.withoutComments).not.toContain("cell(0)");
    expect(scanned?.withoutLiterals).toContain("export const done");
  });

  test("blanks a line comment that runs to the end of the file", () => {
    const scanned = scanModuleSource("export const done = 1; // cell(0)");

    expect(scanned?.withoutComments).not.toContain("cell(0)");
    expect(scanned?.withoutComments).toContain("export const done");
  });

  test("consumes regular expression flags so the next slash is read as division", () => {
    const scanned = scanModuleSource('const a = (/x/giu);\nconst b = 1 / 2;\nconst c = "cell(0)";');

    expect(scanned?.withoutLiterals).toContain("1 / 2");
    expect(scanned?.withoutLiterals).not.toContain("cell(0)");
  });

  test("tracks brace depth inside a template substitution", () => {
    const scanned = scanModuleSource(
      "const value = `a${ { key: 1 } }b`;\nconst other = \"cell(0)\";\nexport const done = 1;",
    );

    expect(scanned?.withoutLiterals).not.toContain("cell(0)");
    expect(scanned?.withoutLiterals).toContain("export const done");
  });

  test("keeps both views the same length so their offsets line up", () => {
    const source = `import { cell } from "./a.js"; /* note */ const t = \`x\${1}y\`; // tail
export const done = /re/u;`;
    const scanned = scanModuleSource(source);

    expect(scanned?.withoutComments.length).toBe(source.length);
    expect(scanned?.withoutLiterals.length).toBe(source.length);
  });
});
