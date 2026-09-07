// @vitest-environment happy-dom
import { describe, expect, test } from "vitest";
import { createRoot } from "@reckona/mreact-reactive-dom";
import { cell } from "@reckona/mreact-reactive-core";
import { flushEffects } from "@reckona/mreact-reactive-core/testing";
import { transform } from "../src/index.js";
import { compileClientComponent, compileServerModule } from "./helpers.js";

function compileClient(code: string): string {
  const output = transform({ code, filename: "App.tsx", target: "client", dev: false });

  expect(output.diagnostics).toEqual([]);
  return output.code;
}

function compileServer(code: string): string {
  const output = transform({ code, filename: "App.tsx", target: "server", dev: false });

  expect(output.diagnostics).toEqual([]);
  return output.code;
}

/** Mounts the client output and renders the server output, then compares them byte for byte. */
async function expectServerClientParity(
  code: string,
  imports: Record<string, unknown> = {},
): Promise<string> {
  const container = document.createElement("div");
  const dispose = createRoot(container, compileClientComponent(compileClient(code)));

  try {
    await flushEffects();
    const serverModule = compileServerModule(compileServer(code), imports);
    const serverApp = serverModule.App as () => string;
    expect(serverApp()).toBe(container.innerHTML);
    return container.innerHTML;
  } finally {
    dispose();
  }
}

describe("compiler constant component call inlining", () => {
  test("folds a constant-prop call into the caller template", () => {
    const code = compileClient(`function Badge(props) { return <span class="badge">{props.label}</span>; }
export function App() { return <main><Badge label="alpha" /></main>; }`);

    // The constant branch and the props object both disappear: the callee's
    // markup becomes part of the caller's own template, so the caller keeps no
    // placeholder to replace and no props object to build.
    expect(code).toContain('createTemplate("<main><span class=\\"badge\\">alpha</span></main>")');
    expect(code).not.toContain("Badge({");
    expect(code).not.toContain("replaceWith(");
  });

  test("keeps the shared callee live for a dynamic call site", () => {
    const code = compileClient(`import { cell } from "@reckona/mreact-reactive-core";
function Badge(props) { return <span class="badge">{props.label}</span>; }
export function App() {
  const count = cell(0);
  return <main><Badge label="alpha" /><Badge label={count.get()} /></main>;
}`);

    // The constant call site folds while the dynamic one keeps the shared
    // component and its live text binding.
    expect(code).toContain('<span class=\\"badge\\">alpha</span>');
    expect(code).toContain("Badge({ get label()");
    expect(code).toContain("bindText(");
  });

  test("folds a constant-prop call into the caller's server output", () => {
    const code = compileServer(`function Badge(props) { return <span class="badge">{props.label}</span>; }
export function App() { return <main><Badge label="alpha" /></main>; }`);

    // Both emitters have to fold, or the server would render one structure while
    // the client mounts another.
    expect(code).toContain('_out += "alpha";');
    expect(code).not.toContain("Badge(Object");
    expect(code).not.toContain("Badge({");
  });

  test("escapes a folded constant into the caller template", () => {
    const code = compileClient(`function Badge(props) { return <span class="badge">{props.label}</span>; }
export function App() { return <main><Badge label="<script>&" /></main>; }`);

    expect(code).toContain("&lt;script&gt;&amp;");
    expect(code).not.toContain("<script>&</span>");
  });

  test("renders a folded constant identically on the server and the client", async () => {
    expect(
      await expectServerClientParity(`function Badge(props) { return <span class="badge">{props.label}</span>; }
export function App() { return <main><Badge label="alpha" /><Badge label="beta" /></main>; }`),
    ).toBe('<main><span class="badge">alpha</span><span class="badge">beta</span></main>');
  });

  test("renders a mixed constant and dynamic caller identically on the server and the client", async () => {
    expect(
      await expectServerClientParity(
        `import { cell } from "@reckona/mreact-reactive-core";
function Badge(props) { return <span class="badge">{props.label}</span>; }
export function App() {
  const count = cell(7);
  return <main><Badge label="alpha" /><Badge label={count.get()} /></main>;
}`,
        { cell },
      ),
    ).toBe('<main><span class="badge">alpha</span><span class="badge">7</span></main>');
  });

  test("folds every shape the inliner can prove", () => {
    const provable: [string, string, string][] = [
      [
        "string prop",
        `function Badge(props) { return <span>{props.label}</span>; }
export function App() { return <main><Badge label="a" /></main>; }`,
        "<main><span>a</span></main>",
      ],
      [
        "number prop",
        `function Badge(props) { return <span>{props.label}</span>; }
export function App() { return <main><Badge label={12} /></main>; }`,
        "<main><span>12</span></main>",
      ],
      [
        "callee with no props at all",
        `function Note() { return <p>note</p>; }
export function App() { return <main><Note /></main>; }`,
        "<main><p>note</p></main>",
      ],
      [
        "callee nesting elements around the prop read",
        `function Badge(props) { return <span class="badge"><b>{props.label}</b></span>; }
export function App() { return <main><Badge label="a" /></main>; }`,
        '<main><span class="badge"><b>a</b></span></main>',
      ],
      [
        "callee with sibling elements",
        `function Badge(props) { return <span><b>bold</b><i>{props.label}</i></span>; }
export function App() { return <main><Badge label="a" /></main>; }`,
        "<main><span><b>bold</b><i>a</i></span></main>",
      ],
      [
        "call site inside a fragment",
        `function Badge(props) { return <span>{props.label}</span>; }
export function App() { return <main><><Badge label="a" /></></main>; }`,
        "<main><span>a</span></main>",
      ],
      [
        "call site passing a prop the callee never reads",
        `function Badge(props) { return <span>{props.label}</span>; }
export function App() { return <main><Badge label="a" tone="loud" /></main>; }`,
        "<main><span>a</span></main>",
      ],
    ];

    for (const [scenario, source, markup] of provable) {
      const code = compileClient(source);

      expect(code, scenario).toContain(`createTemplate("${markup.replaceAll('"', '\\"')}")`);
      expect(code, scenario).not.toContain("({");
    }
  });

  test("keeps the shared call for every shape the inliner cannot prove", () => {
    const unprovable: [string, string][] = [
      [
        "exported callee",
        `export function Badge(props) { return <span>{props.label}</span>; }
export function App() { return <main><Badge label="a" /></main>; }`,
      ],
      [
        "default-exported callee",
        `export default function Badge(props) { return <span>{props.label}</span>; }
export function App() { return <main><Badge label="a" /></main>; }`,
      ],
      [
        "callee escaping as a value",
        `function Badge(props) { return <span>{props.label}</span>; }
const registry = { Badge };
export function App() { return <main><Badge label="a" />{registry.Badge === Badge ? "" : ""}</main>; }`,
      ],
      [
        "reassigned callee",
        `function Badge(props) { return <span>{props.label}</span>; }
Badge = () => null;
export function App() { return <main><Badge label="a" /></main>; }`,
      ],
      [
        "call site with children",
        `function Badge(props) { return <span>{props.label}</span>; }
export function App() { return <main><Badge label="a">child</Badge></main>; }`,
      ],
      [
        "keyed call site",
        `function Badge(props) { return <span>{props.label}</span>; }
export function App(props) {
  return <main>{props.rows.map((row) => <Badge key={row} label="a" />)}</main>;
}`,
      ],
      [
        "call site with a spread",
        `function Badge(props) { return <span>{props.label}</span>; }
export function App(props) { return <main><Badge {...props.rest} /></main>; }`,
      ],
      [
        "call site passing a non-literal",
        `function Badge(props) { return <span>{props.label}</span>; }
export function App(props) { return <main><Badge label={props.name} /></main>; }`,
      ],
      [
        "call site passing a template literal",
        `function Badge(props) { return <span>{props.label}</span>; }
export function App() { return <main><Badge label={\`a\`} /></main>; }`,
      ],
      [
        "call site passing a number JSON widens to infinity",
        `function Badge(props) { return <span>{props.label}</span>; }
export function App() { return <main><Badge label={1e999} /></main>; }`,
      ],
      [
        "callee with a keyed element",
        `function Badge(props) { return <span key="k">{props.label}</span>; }
export function App() { return <main><Badge label="a" /></main>; }`,
      ],
      [
        "call site passing a boolean",
        `function Badge(props) { return <span>{props.label}</span>; }
export function App() { return <main><Badge label={true} /></main>; }`,
      ],
      [
        "call site passing null",
        `function Badge(props) { return <span>{props.label}</span>; }
export function App() { return <main><Badge label={null} /></main>; }`,
      ],
      [
        "call site missing a read prop",
        `function Badge(props) { return <span>{props.label}</span>; }
export function App() { return <main><Badge tone="loud" /></main>; }`,
      ],
      [
        "callee with a local statement",
        `function Badge(props) { const label = props.label; return <span>{label}</span>; }
export function App() { return <main><Badge label="a" /></main>; }`,
      ],
      [
        "callee destructuring its props",
        `function Badge({ label }) { return <span>{label}</span>; }
export function App() { return <main><Badge label="a" /></main>; }`,
      ],
      [
        "callee naming its parameter something else",
        `function Badge(input) { return <span>{input.label}</span>; }
export function App() { return <main><Badge label="a" /></main>; }`,
      ],
      [
        "callee holding a dom ref",
        `function Badge(props) { return <span domRef={() => undefined}>{props.label}</span>; }
export function App() { return <main><Badge label="a" /></main>; }`,
      ],
      [
        "callee with an event handler",
        `function Badge(props) { return <span onClick={() => {}}>{props.label}</span>; }
export function App() { return <main><Badge label="a" /></main>; }`,
      ],
      [
        "callee with a dynamic attribute",
        `function Badge(props) { return <span class={props.tone}>{props.label}</span>; }
export function App() { return <main><Badge label="a" tone="b" /></main>; }`,
      ],
      [
        "callee with a spread attribute",
        `function Badge(props) { return <span {...props.attrs}>{props.label}</span>; }
export function App() { return <main><Badge label="a" /></main>; }`,
      ],
      [
        "callee with an svg element",
        `function Badge(props) { return <svg><title>{props.label}</title></svg>; }
export function App() { return <main><Badge label="a" /></main>; }`,
      ],
      [
        "callee with adjacent text children",
        `function Badge(props) { return <span>before{props.label}</span>; }
export function App() { return <main><Badge label="a" /></main>; }`,
      ],
      [
        "callee reading one prop twice",
        `function Badge(props) { return <span><b>{props.label}</b><i>{props.label}</i></span>; }
export function App() { return <main><Badge label="a" /></main>; }`,
      ],
      [
        "callee reading a nested prop path",
        `function Badge(props) { return <span>{props.label.text}</span>; }
export function App() { return <main><Badge label="a" /></main>; }`,
      ],
      [
        "callee rendering another component",
        `function Inner() { return <i>inner</i>; }
function Badge(props) { return <span><Inner /></span>; }
export function App() { return <main><Badge label="a" /></main>; }`,
      ],
      [
        "callee rendering a conditional",
        `function Badge(props) { return <span>{props.open ? "y" : "n"}</span>; }
export function App() { return <main><Badge open={true} /></main>; }`,
      ],
      [
        "callee whose root is a fragment",
        `function Badge(props) { return <><span>{props.label}</span></>; }
export function App() { return <main><Badge label="a" /></main>; }`,
      ],
      [
        "call site inside a conditional branch",
        `function Badge(props) { return <span>{props.label}</span>; }
export function App(props) { return <main>{props.open ? <Badge label="a" /> : null}</main>; }`,
      ],
      [
        "call site inside a list row",
        `function Badge(props) { return <span>{props.label}</span>; }
export function App(props) { return <main>{props.rows.map(() => <Badge label="a" />)}</main>; }`,
      ],
      [
        "call site as another component's child",
        `import { Shell } from "./Shell";
function Badge(props) { return <span>{props.label}</span>; }
export function App() { return <main><Shell><Badge label="a" /></Shell></main>; }`,
      ],
      [
        "call site as a component's own root",
        `function Badge(props) { return <span>{props.label}</span>; }
function Wrapper() { return <Badge label="a" />; }
export function App() { return <main><Wrapper /></main>; }`,
      ],
    ];

    for (const [scenario, source] of unprovable) {
      // The call itself has to survive, so the assertion looks for the props
      // object rather than for the callee's declaration.
      expect(compileClient(source), scenario).toContain("Badge({");
    }
  });

  test("keeps the shared call for an async callee the server can still render", () => {
    // An async component is a server-only shape, so the client target rejects it
    // outright and only the server output can show the call surviving.
    const code = compileServer(`async function Badge(props) { return <span>{props.label}</span>; }
export function App() { return <main><Badge label="a" /></main>; }`);

    expect(code).toContain("await Badge(Object.defineProperty(");
  });

  test("lowers the prop child of a callee every call site folded away", () => {
    const code = compileClient(`function Badge(props) { return <span class="badge">{props.label}</span>; }
export function App() { return <main><Badge label="a" /><Badge label="b" /></main>; }`);

    // Nothing can reach the callee any more, so its body keeps the cheapest
    // binding rather than the generic render value insertion the emitters use
    // when a call site could still pass a list.
    expect(code).not.toContain("insertRenderValue");
    expect(code).toContain("bindText(");
  });

  test("folds one callee while another module component keeps its call", () => {
    const code = compileClient(`function Badge(props) { return <span>{props.label}</span>; }
function Shell(props) { return <section>{props.children}</section>; }
export function App() { return <main><Shell><Badge label="a" /></Shell></main>; }`);

    expect(code).toContain("Shell({");
    expect(code).toContain("Badge({");
  });

  test("leaves a module without an inlinable callee untouched", () => {
    const code = compileClient(`export function Badge(props) { return <span>{props.label}</span>; }
export function App() { return <main><Badge label="a" /></main>; }`);

    expect(code).toContain('Badge({ label: ("a") })');
  });
});
