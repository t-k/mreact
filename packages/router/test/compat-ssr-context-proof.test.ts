import { parseSync } from "oxc-parser";
import { expect, test } from "vitest";
import {
  compatContextModuleNames,
  hasCompatContextReflection,
  isCompatContextInitializer,
  unsafeCompatContextUse,
} from "../src/compat-ssr-context.js";

function parse(code: string, lang: "ts" | "tsx" = "tsx") {
  const result = parseSync("proof.compat.tsx", code, { lang, astType: "ts" });
  expect(result.errors).toEqual([]);
  return result.program;
}

test.each([
  "null",
  "undefined",
  '"light"',
  "true",
  "false",
  "0",
  "1.5",
  "-1",
  "+2",
  "null as string | null",
  "null!",
  "null satisfies unknown",
  "(null)",
])("the Context initializer proof accepts %s", (argument) => {
  const program = parse(`const Theme = createContext(${argument});`);
  const init = (program.body[0] as any).declarations[0].init;
  expect(isCompatContextInitializer(init, new Set(["createContext"]), new Set())).toBe(true);
});

test("the Context initializer proof accepts type assertions in a plain TypeScript dependency", () => {
  const program = parse("const Theme = createContext(<null>null);", "ts");
  expect(
    isCompatContextInitializer(
      (program.body[0] as any).declarations[0].init,
      new Set(["createContext"]),
      new Set(),
    ),
  ).toBe(true);
});

test.each([
  "createContext({})",
  "createContext([])",
  "createContext(() => null)",
  "createContext(/x/)",
  "createContext(1n)",
  "createContext(1e999)",
  "createContext(-1e999)",
  'createContext(-"1")',
  "createContext(-null)",
  "createContext(-true)",
  "createContext(!false)",
  "createContext(value)",
  "createContext()",
  "createContext(null, 1)",
  "createContext(...values)",
  "createContext?.(null)",
  "other(null)",
  "object.createContext(null)",
  "new createContext(null)",
  "null",
  "undefined",
])("the Context initializer proof rejects %s", (expression) => {
  const program = parse(`const Theme = ${expression};`);
  const init = (program.body[0] as any).declarations[0].init;
  expect(isCompatContextInitializer(init, new Set(["createContext"]), new Set())).toBe(false);
});

test("module bindings include imports, exports, declarations, and destructuring", () => {
  const program = parse(`import { value as imported } from "./value";
    export const { x: local, ...rest } = source;
    const [first, ...remaining] = source;
    export default function Default() {}
    export function Named() {}
    class LocalClass {}
    type TypeOnly = string;
    interface InterfaceOnly {}
    export { local as aliased };`);
  expect([...compatContextModuleNames(program)].sort()).toEqual([
    "Default",
    "LocalClass",
    "Named",
    "first",
    "imported",
    "local",
    "remaining",
    "rest",
  ]);
  expect(
    isCompatContextInitializer(
      (parse("const Theme = createContext(undefined);").body[0] as any).declarations[0].init,
      new Set(["createContext"]),
      new Set(["undefined"]),
    ),
  ).toBe(false);
});

function contextUse(code: string) {
  return unsafeCompatContextUse(parse(code), {
    contexts: new Set(["Theme"]),
    factories: new Set(["createContext"]),
    readers: new Set(["useContext"]),
  });
}

test.each([
  "function Panel() { return useContext(Theme); }",
  "function Panel() { return useContext(Theme as unknown); }",
  'function Panel() { return <Theme value="dark"><Theme.Provider><Theme.Consumer>{value => <p>{value}</p>}</Theme.Consumer></Theme.Provider></Theme>; }',
  "export { Theme };",
  'export { Theme as "theme-context" };',
  'import { Theme } from "./context";',
  'export { Theme } from "./context";',
  'export * from "./context";',
  "function Panel(Theme) { return Theme.values; }",
  "function Panel(...Theme) { return Theme.values; }",
  "function Panel([Theme]) { return Theme.values; }",
  "function Panel({x: Theme}) { return Theme.values; }",
  "function Panel({ ...Theme }) { return Theme.values; }",
  "function Panel(Theme = null) { return Theme.values; }",
  "function Panel() { { const Theme = null; Theme.values; } return useContext(Theme); }",
  "function Panel() { Theme.values; if (true) { var Theme; } }",
  "function Panel() { function Inner() { var Theme; } return useContext(Theme); }",
  "function Panel() { const Inner = () => { var Theme; }; return useContext(Theme); }",
  "function Panel() { const Inner = function() { var Theme; }; return useContext(Theme); }",
  "function Panel() { const Inner = class Theme { static { Theme.values; } }; return useContext(Theme); }",
  "function Panel() { try {} catch (Theme) { Theme.values; } return useContext(Theme); }",
  "function Panel() { switch(0) { default: const Theme = null; Theme.values; } return useContext(Theme); }",
  "function Panel() { for (const Theme of []) { Theme.values; } return useContext(Theme); }",
  "function Panel() { for (const Theme in {}) { Theme.values; } return useContext(Theme); }",
  "function Panel() { for (let Theme = 0; false;) { Theme.values; } return useContext(Theme); }",
  "function Panel() { const value = { Theme: null }; return value.Theme; }",
  "function Panel() { return Other.Theme; }",
  "function Panel() { const other = { Theme: null }; return other; }",
  "type Alias = typeof Theme; interface Props { value: typeof Theme; }",
  "type Theme = string; interface Theme { value: string; }",
  "class Local<Theme> { field: Theme; }",
  "function Panel(): typeof Theme { return null; }",
  "function Panel<T extends typeof Theme>() { return null; }",
  "function Panel() { return other<typeof Theme>(); }",
])("the Context use proof accepts local scope or renderer use: %s", (source) => {
  expect(contextUse(source)).toBeUndefined();
});

test.each([
  "function Panel() { return Theme; }",
  "function Panel() { return {Theme}; }",
  "function Panel() { return Other[Theme]; }",
  "function Panel() { return { [Theme]: 1 }; }",
  "function Panel() { return new useContext(Theme); }",
  "function Panel() { return Theme.values; }",
  "function Panel() { return Theme['values']; }",
  "function Panel() { return useContext?.(Theme); }",
  "function Panel() { return useContext(Theme, null); }",
  "function Panel() { const useContext = other; return useContext(Theme); }",
  "function Panel(useContext) { return useContext(Theme); }",
  "function Panel() { var useContext; return useContext(Theme); }",
  "function useContext() { return useContext(Theme); }",
  "const other = class useContext { static { useContext(Theme); } };",
  "function Panel() { return <Theme.Other />; }",
  "function Panel() { return <Theme.Provider.Other />; }",
  "function Panel() { return <Theme.Provider value={Theme} />; }",
  "function Panel() { return <p {...Theme} />; }",
  "function Panel(value = Theme) { var Theme; }",
  "function Panel() { const {value = Theme} = props; }",
  "function Panel() { const [value = Theme] = props; }",
  "function Panel({[Theme]: value}) {}",
  "function Panel({value = Theme}) {}",
  "function Panel() { try {} catch ({value = Theme}) {} }",
  "function Panel() { switch(Theme) { default: const Theme = null; } }",
  "function Panel() { const Inner = class { static { var Theme; } }; return Theme; }",
  "function Panel() { class Inner { static { var Theme; } } return Theme; }",
  "function Panel() { for (const useContext of []) { useContext(Theme); } }",
  "function Panel() { for (const useContext in {}) { useContext(Theme); } }",
  "function Panel() { for (let useContext = other; false;) { useContext(Theme); } }",
  "function Panel() { switch(0) { default: const useContext = other; useContext(Theme); } }",
  "function Panel() { function Inner() { var Theme; } return Theme; }",
  "function Panel() { const Inner = () => { var Theme; }; return Theme; }",
  "function Panel() { const Inner = function() { var Theme; }; return Theme; }",
  "function Panel() { return (function useContext() { return useContext(Theme); })(); }",
  "function Panel() { class useContext { static { useContext(Theme); } } }",
  "function Panel() { const Inner = class { static { var useContext; useContext(Theme); } }; }",
  "function Panel(...[value = Theme]) {}",
  "function Panel(...{value = Theme}) {}",
  "function Panel() { const [first, second = Theme] = source; }",
  "function Panel() { const { [Theme]: value } = props; }",
  "function Panel() { return <Other.Theme value={Theme} />; }",
])(
  "the Context use proof rejects identity escape independently of other syntax guards: %s",
  (source) => {
    expect(contextUse(source)).toMatch(/^Context Theme /);
  },
);

test.each([
  "element.type",
  "element['type']",
  "const {type: alias} = element;",
  "const {['type']: alias} = element;",
  "const stringify = JSON.stringify;",
  "const json = JSON;",
  "function Panel() { return <element.type />; }",
])("the reflection proof rejects %s", (source) => {
  expect(hasCompatContextReflection(parse(source))).toBe(true);
});

test.each([
  "element.props",
  "element['props']",
  "const {value} = props;",
  'function Panel() { return <button type="button" />; }',
  "type Props = {type: string; json: typeof JSON};",
  "interface Props { type: string; json: typeof JSON; }",
  "type JSON = string; interface JSON { value: string; }",
  "const value: JSON = null;",
  "function Panel() { return <JSON />; }",
  "function Panel(): typeof JSON { return null; }",
  "function Panel<T extends typeof JSON>() { return null; }",
  "function Panel() { return other<typeof JSON>(); }",
])("the reflection proof accepts ordinary data and type annotations: %s", (source) => {
  expect(hasCompatContextReflection(parse(source))).toBe(false);
});
