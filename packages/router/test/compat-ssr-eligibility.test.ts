import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { analyzeCompatSsrEligibility } from "../src/compat-ssr.js";

const counter = `import { useState } from "@reckona/mreact-compat";
export function Counter() { const [count, setCount] = useState(0); return <button onClick={() => setCount(n => n + 1)}>{count}</button>; }`;

test.each([
  ["safe counter", counter, true],
  [
    "proven public default hook",
    counter
      .replace(
        'import { useState } from "@reckona/mreact-compat"',
        'import React from "@reckona/mreact"',
      )
      .replace("= useState(0)", "= React.useState<number>(0)"),
    true,
  ],
  [
    "proven public default ID and insertion effect",
    'import React from "@reckona/mreact"; export function Counter() { const id = React.useId(); React.useInsertionEffect(() => {}, []); return <span id={id}>value</span>; }',
    true,
  ],
  [
    "public default Context reader",
    'import React, { createContext } from "@reckona/mreact"; const Theme = createContext("light"); export function Counter() { const value = React.useContext(Theme); return <span>{value}</span>; }',
    true,
  ],
  [
    "public default cannot hide browser reads",
    'import React from "@reckona/mreact"; export function Counter() { const [value] = React.useState(window.title); return <span>{value}</span>; }',
    false,
  ],
  [
    "public default cannot hide nondeterminism",
    'import React from "@reckona/mreact"; export function Counter() { const [value] = React.useState(Math.random()); return <span>{value}</span>; }',
    false,
  ],
  [
    "mutable compat default remains client-only",
    'import React from "@reckona/mreact-compat"; export function Counter() { const [value] = React.useState(0); return <span>{value}</span>; }',
    false,
  ],
  [
    "public default JSX reference remains unproven",
    'import React from "@reckona/mreact"; export function Counter() { const [value] = React.useState(0); return <React.Fragment>{value}</React.Fragment>; }',
    false,
  ],
  ["invalid syntax", "export function Counter() { return <button>; }", false],
  ["explicit server directive", '"use server";\n' + counter, false],
  [
    "cross-request mutable state",
    'const messages = []; export function Counter({message}) { messages.push(message); return <p>{messages.join(",")}</p> }',
    false,
  ],
  [
    "stateful regexp",
    "const pattern = /x/g; export function Counter({message}) { return <p>{pattern.test(message)}</p> }",
    false,
  ],
  [
    "computed destructuring",
    'export function Counter(){ const { ["con" + "structor"]: Fn } = () => 0; return <p>{Fn("return screen.width")()}</p> }',
    false,
  ],
  ["browser JSX root", "export function Counter(){ return <window.Widget/> }", false],
  ["unknown JSX root", "export function Counter(){ return <Unknown/> }", false],
  [
    "ambient binding",
    "declare const screen: { width: number };\n" + counter.replace("{count}", "{screen.width}"),
    false,
  ],
  [
    "aliased nondeterminism",
    counter
      .replace("useState(0)", "useState(rng.random())")
      .replace("const [count", "const rng = Math; const [count"),
    false,
  ],
  [
    "computed constructor",
    counter.replace("useState(0)", 'useState(({})["con" + "structor"]("return screen")())'),
    false,
  ],
  ["unknown browser global", counter.replace("{count}", "{screen.width}"), false],
  [
    "unrelated binding cannot hide browser global",
    counter.replace("{count}", "{screen.width}") + "\nfunction helper(screen) { return screen; }",
    false,
  ],
  ["cast browser read", counter.replace("{count}", "{(document as any).title}"), false],
  ["runtime enum", counter + "\nenum E { Value = document.title.length }", false],
  ["unknown render call", counter.replace("useState(0)", "useState(register())"), false],
  [
    "indirect constructor",
    counter.replace("useState(0)", 'useState(({}).constructor.constructor("return window")())'),
    false,
  ],
  ["browser global", counter + "\nconst title = document.title;", false],
  ["module side effect", "register();\n" + counter, false],
  ["unknown package", 'import { x } from "unknown-package";\n' + counter, false],
  ["side effect import", 'import "./side-effect";\n' + counter, false],
  ["dynamic import", counter + '\nexport function load() { return import("./browser"); }', false],
  [
    "nondeterministic initializer",
    counter.replace("useState(0)", "useState(Math.random())"),
    false,
  ],
  ["explicit client directive", '"use client";\n' + counter, false],
])("compat SSR eligibility: %s", async (_name, code, eligible) => {
  const root = await mkdtemp(join(tmpdir(), "mreact-compat-eligibility-"));
  try {
    const filename = join(root, "Counter.compat.tsx");
    await writeFile(filename, code);
    expect((await analyzeCompatSsrEligibility(filename)).eligible).toBe(eligible);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test.each(["document.title", "register()"])(
  "inspects transitive unrendered dependencies: %s",
  (expression) => checkDependency(expression),
);
async function checkDependency(expression: string) {
  const root = await mkdtemp(join(tmpdir(), "mreact-compat-graph-"));
  try {
    await mkdir(join(root, "deps"));
    const filename = join(root, "Counter.compat.tsx");
    await writeFile(filename, 'import { value } from "./deps/helper";\n' + counter);
    await writeFile(join(root, "deps/helper.ts"), 'export { value } from "./browser";');
    await writeFile(join(root, "deps/browser.ts"), `export const value = ${expression};`);
    expect((await analyzeCompatSsrEligibility(filename)).eligible).toBe(false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test.each([".tsx", ".compat.tsx", ".ts"])(
  "dependency renderer semantics: %s",
  async (extension) => {
    const root = await mkdtemp(join(tmpdir(), "mreact-compat-renderer-"));
    try {
      const filename = join(root, "Counter.compat.tsx");
      await writeFile(
        filename,
        'import { Label } from "./Label' +
          (extension === ".compat.tsx" ? ".compat" : "") +
          '"; export function Counter() { return <div><Label/></div> }',
      );
      await writeFile(
        join(root, "Label" + extension),
        extension === ".ts"
          ? 'export function Label() { return "Label"; }'
          : "export function Label() { return <strong>Label</strong>; }",
      );
      expect((await analyzeCompatSsrEligibility(filename)).eligible).toBe(extension !== ".tsx");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  },
);

test.each(["cycle", "diamond"])("dependency graph: %s", async (shape) => {
  const root = await mkdtemp(join(tmpdir(), "mreact-compat-graph-shape-"));
  try {
    const filename = join(root, "Counter.compat.tsx");
    await writeFile(
      filename,
      'import { left } from "./left"; import { right } from "./right"; export function Counter() { return <p>{left()}{right()}</p> }',
    );
    await writeFile(join(root, "left.ts"), 'export { value as left } from "./shared";');
    await writeFile(join(root, "right.ts"), 'export { value as right } from "./shared";');
    await writeFile(
      join(root, "shared.ts"),
      shape === "cycle"
        ? 'export { left as value } from "./left";'
        : 'export function value() { return "ok"; }',
    );
    expect((await analyzeCompatSsrEligibility(filename)).eligible).toBe(shape === "diamond");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
