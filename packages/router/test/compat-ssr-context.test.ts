import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { analyzeCompatSsrEligibility } from "../src/compat-ssr.js";

async function eligibility(files: Record<string, string>) {
  const root = await mkdtemp(join(tmpdir(), "mreact-context-eligibility-"));
  try {
    for (const [name, code] of Object.entries(files)) await writeFile(join(root, name), code);
    return await analyzeCompatSsrEligibility(join(root, "Panel.compat.tsx"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

const imports = 'import { createContext, useContext } from "@reckona/mreact-compat";';
const panel =
  'export function Panel() { return <Theme.Provider value="dark"><Label /></Theme.Provider>; } function Label() { return <p>{useContext(Theme)}</p>; }';

test.each([
  'const element = <Theme.Provider value="dark" />; element.type.context.values.push("leaked");',
  'const element = <Theme value="dark" />; element["type"].context.values.push("leaked");',
  'const element = <Theme.Consumer>{value => <p>{value}</p>}</Theme.Consumer>; const { type: provider } = element; provider.context.values.push("leaked");',
  'const { ["type"]: provider } = <Theme.Provider />; provider.context.values.push("leaked");',
  'function Probe({ children }) { children.type().type.context.values.push("leaked"); return <p />; } return <Probe><Panel /></Probe>;',
  'const element = <Theme.Provider />; return <element.type value="dark" />;',
  'const element = Panel(); element.type.context.values.push("leaked");',
  'function Probe({ value }) { const { type } = value; type.context.values.push("leaked"); return <p />; } return <Probe value={<Theme.Provider />} />;',
  'const stringify = JSON.stringify; stringify(<Theme.Provider />, (key, value) => key === "values" ? value.push("leaked") : value);',
  'JSON.stringify(<Theme.Provider />, (key, value) => key === "values" ? value.push("leaked") : value);',
])("SSR rejects Context identity exposed through ReactElements: %s", async (operation) => {
  const result = await eligibility({
    "Panel.compat.tsx": `${imports} const Theme = createContext(null); ${panel} export function ProbeRoot() { ${operation} return <p />; }`,
  });
  expect(result.eligible).toBe(false);
  expect(result.reason).toContain("Panel.compat.tsx");
});

test("SSR rejects reflection in a relative helper when the graph contains Context", async () => {
  const result = await eligibility({
    "inspect.ts":
      'export function inspect(element) { JSON.stringify(element, (key, value) => key === "values" ? value.push("leaked") : value); }',
    "Panel.compat.tsx": `${imports} import { inspect } from "./inspect"; const Theme = createContext(null); export function Panel() { inspect(<Theme.Provider />); return <p />; }`,
  });
  expect(result.eligible).toBe(false);
  expect(result.reason).toContain("inspect.ts");
});

test("SSR preserves nested component children without element introspection", async () => {
  const result = await eligibility({
    "Panel.compat.tsx": `${imports} const Theme = createContext(null); function Wrapper({children}) { return <section>{children}</section>; } ${panel} export function App() { return <Wrapper><Panel /></Wrapper>; }`,
  });
  expect(result.eligible).toBe(true);
});

test("SSR retains ordinary property and JSON operations in graphs without Context", async () => {
  const result = await eligibility({
    "Panel.compat.tsx":
      "export function Panel(props) { const { type } = props; return <p>{JSON.stringify(type)}{props.type}</p>; }",
  });
  expect(result.eligible).toBe(true);
});

test.each(["@reckona/mreact", "@reckona/mreact-compat", "react"])(
  "SSR supports module context from %s",
  async (entry) => {
    expect(
      (
        await eligibility({
          "Panel.compat.tsx": `import { createContext as makeContext, useContext as read } from "${entry}";
const Theme = makeContext<string | null>(null);
function Label() { return <p>{read(Theme)}</p>; }
export function Panel() { return <Theme.Provider value="dark"><Label /></Theme.Provider>; }`,
        })
      ).eligible,
    ).toBe(true);
  },
);

test.each([
  "null",
  "undefined",
  '"light"',
  "true",
  "false",
  "0",
  "-1",
  "1.5",
  "null as string | null",
])("SSR accepts immutable context default %s", async (value) => {
  expect(
    (
      await eligibility({
        "Panel.compat.tsx": `${imports} const Theme = createContext(${value}); ${panel}`,
      })
    ).eligible,
  ).toBe(true);
});

test.each([
  ["provider shorthand", '<Theme value="dark"><Label /></Theme>'],
  ["consumer render prop", "<Theme.Consumer>{value => <p>{value}</p>}</Theme.Consumer>"],
  ["shadowed context", '<p>{((Theme) => Theme)("local")}{useContext(Theme)}</p>'],
])("SSR accepts %s", async (_name, body) => {
  expect(
    (
      await eligibility({
        "Panel.compat.tsx": `${imports} const Theme = createContext("light"); function Label() { return <p>{useContext(Theme)}</p>; } export function Panel() { return ${body}; }`,
      })
    ).eligible,
  ).toBe(true);
});

test.each(["named", "star", "alias"])("SSR follows %s context re-exports", async (kind) => {
  const reexport =
    kind === "star"
      ? 'export * from "./context";'
      : kind === "alias"
        ? 'export { Theme as ThemeAlias } from "./context";'
        : 'export { Theme } from "./context";';
  const imported = kind === "alias" ? "ThemeAlias as Theme" : "Theme";
  expect(
    (
      await eligibility({
        "context.ts": `${imports} export const Theme = createContext(null);`,
        "barrel.ts": reexport,
        "Panel.compat.tsx": `import { useContext } from "@reckona/mreact-compat"; import { ${imported} } from "./barrel"; ${panel}`,
      })
    ).eligible,
  ).toBe(true);
});

test.each(["default", "string"])("SSR tracks %s exported context identities", async (kind) => {
  const exported = kind === "default" ? "default" : '"theme-context"';
  const imported = kind === "default" ? "Theme" : '{ "theme-context" as Theme }';
  const result = await eligibility({
    "context.ts": `${imports} const Theme = createContext(null); export { Theme as ${exported} };`,
    "Panel.compat.tsx": `import ${imported} from "./context"; function helper(value) { return value; } export function Panel() { helper(Theme); return <p>safe</p>; }`,
  });
  expect(result.eligible).toBe(false);
});

test("SSR tracks string-named context re-exports", async () => {
  const result = await eligibility({
    "context.ts": `${imports} const Theme = createContext(null); export { Theme as "theme-context" };`,
    "barrel.ts": 'export { "theme-context" as Theme } from "./context";',
    "Panel.compat.tsx":
      'import { Theme } from "./barrel"; function helper(value) { return value; } export function Panel() { helper(Theme); return <p>safe</p>; }',
  });
  expect(result.eligible).toBe(false);
});

test.each([
  "{}",
  "[]",
  "{items: []}",
  "() => null",
  "/x/g",
  "1n",
  "NaN",
  "Infinity",
  "-Infinity",
  "Math.random()",
  "document.title",
  "String(0)",
  "...[]",
])("SSR rejects context default %s", async (value) => {
  expect(
    (
      await eligibility({
        "Panel.compat.tsx": `${imports} const Theme = createContext(${value}); ${panel}`,
      })
    ).eligible,
  ).toBe(false);
});

test.each([
  ["local factory", "function createContext(value) { return value; }", "createContext(null)"],
  ["unknown factory", 'import { createContext } from "unknown-package";', "createContext(null)"],
  [
    "type-only factory",
    'import type { createContext } from "@reckona/mreact-compat";',
    "createContext(null)",
  ],
  [
    "hooks subpath",
    'import { createContext } from "@reckona/mreact-compat/hooks";',
    "createContext(null)",
  ],
  ["namespace factory", 'import * as React from "react";', "React.createContext(null)"],
  ["default factory", 'import React from "react";', "React.createContext(null)"],
  ["shadowed undefined", `${imports} const undefined = "different";`, "createContext(undefined)"],
  ["missing default", imports, "createContext()"],
  ["extra argument", imports, "createContext(null, 1)"],
  ["optional factory", imports, "createContext?.(null)"],
])("SSR rejects %s", async (_name, declarations, initializer) => {
  expect(
    (
      await eligibility({
        "Panel.compat.tsx": `${declarations} const Theme = ${initializer}; export function Panel() { return <p>safe</p>; }`,
      })
    ).eligible,
  ).toBe(false);
});

test.each([
  ["internal array mutation", "Theme.values.push('leaked'); return <p>{useContext(Theme)}</p>;"],
  ["computed internal mutation", "Theme['values'].push('leaked'); return <p>safe</p>;"],
  ["provider escape", "const provider = Theme.Provider; return <provider value='dark'/>;"],
  ["context alias", "const alias = Theme; return <p>{useContext(alias)}</p>;"],
  ["helper escape", "helper(Theme); return <p>safe</p>;"],
  ["context return", "return Theme;"],
  ["object escape", "return <p>{helper({Theme})}</p>;"],
  ["prop escape", "return <Label value={Theme}/>;"],
  ["spread escape", "return <p {...Theme}/>;"],
  ["shadowed hook", "const useContext = helper; return <p>{useContext(Theme)}</p>;"],
  ["shadowed hook parameter", "return <p>{((useContext) => useContext(Theme))(helper)}</p>;"],
  ["context destructuring", "const {values} = Theme; values.push('leaked'); return <p>safe</p>;"],
  ["consumer introspection", "return <p>{Theme.Consumer.context.values.length}</p>;"],
  ["provider method", "return <p>{Theme.Provider.toString()}</p>;"],
  ["type cast escape", "helper(Theme as any); return <p>safe</p>;"],
  ["event escape", "return <button onClick={() => helper(Theme)}>safe</button>;"],
])("SSR rejects context %s", async (_name, body) => {
  const result = await eligibility({
    "Panel.compat.tsx": `${imports} const Theme = createContext(null); function helper(value) { return value; } function Label() { return <p>label</p>; } export function Panel() { ${body} }`,
  });
  expect(result.eligible).toBe(false);
  expect(result.reason).toContain("Panel.compat.tsx");
});

test("SSR rejects imported context mutation in an unrendered dependency", async () => {
  const result = await eligibility({
    "context.ts": `${imports} export const Theme = createContext(null);`,
    "unused.ts":
      'import { Theme } from "./context"; export function mutate() { Theme.values.push("leaked"); }',
    "Panel.compat.tsx": `import { Theme } from "./context"; import { mutate } from "./unused"; import { useContext } from "@reckona/mreact-compat"; ${panel}`,
  });
  expect(result.eligible).toBe(false);
  expect(result.reason).toContain("unused.ts");
});

test("SSR keeps context factory re-exports client-only", async () => {
  expect(
    (
      await eligibility({
        "factory.ts": 'export { createContext } from "react";',
        "Panel.compat.tsx":
          'import { createContext } from "./factory"; const Theme = createContext(null); export function Panel() { return <Theme.Provider value="dark"/>; }',
      })
    ).eligible,
  ).toBe(false);
});

test("SSR rejects namespace imports of context exports", async () => {
  expect(
    (
      await eligibility({
        "context.ts": `${imports} export const Theme = createContext(null);`,
        "Panel.compat.tsx":
          'import * as contexts from "./context"; export function Panel() { return <p>{contexts.Theme.values.push("leaked")}</p>; }',
      })
    ).eligible,
  ).toBe(false);
});

test.each([
  [
    "switch discriminant",
    'switch(Theme.values.push("leaked")) { default: const Theme = null; } return <p>safe</p>;',
  ],
  [
    "parameter default before body vars",
    "mutate(); return <p>safe</p>;",
    'function mutate(value = Theme) { var Theme; value.values.push("leaked"); }',
  ],
  [
    "class static vars stay inside the class",
    'const Unused = class { static { var Theme; } }; Theme.values.push("leaked"); return <p>safe</p>;',
  ],
  [
    "named class reader shadow",
    "const Local = class useContext { static { useContext(Theme); } }; return <p>safe</p>;",
  ],
  [
    "catch destructuring defaults",
    'try { throw {}; } catch({value: helper = Theme.values.push("leaked")}) {} return <p>safe</p>;',
  ],
])("SSR keeps Context identity across %s", async (_name, body, extra = "") => {
  const result = await eligibility({
    "Panel.compat.tsx": `${imports} const Theme = createContext(null); function helper(value) { return value; } ${extra} export function Panel() { ${body} }`,
  });
  expect(result.eligible).toBe(false);
});
