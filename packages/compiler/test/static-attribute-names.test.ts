// @vitest-environment happy-dom
import { describe, expect, test } from "vitest";
import { transform } from "../src/index.js";
import { runServerComponent } from "./helpers.js";

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

/** Reads the first `createTemplate` literal, which is the route's own template. */
function clientTemplate(code: string): string {
  const match = /createTemplate\((?<literal>"(?:[^"\\]|\\.)*")\)/u.exec(code);

  if (match?.groups?.literal === undefined) {
    throw new Error("Expected the client output to build a template.");
  }

  return JSON.parse(match.groups.literal) as string;
}

/** Describes every element of a parsed tree as `tag[name=value,...]`, in document order. */
function describeAttributes(html: string): string[] {
  const host = document.createElement("div");
  host.innerHTML = html;

  return [...host.querySelectorAll("*")].map((element) => {
    const pairs = [...element.attributes]
      .map((attribute) => `${attribute.name}=${attribute.value}`)
      .sort();
    return `${element.tagName.toLowerCase()}[${pairs.join(",")}]`;
  });
}

const ISSUE_FIXTURE = `export function App() {
  return (
    <main className="shell">
      <label htmlFor="a">L</label>
      <input defaultValue="seed" />
      <input type="checkbox" defaultChecked />
      <textarea defaultValue="area" />
    </main>
  );
}`;

describe("compiler static attribute names in the client template", () => {
  test("maps static name aliases the way the server does", () => {
    const template = clientTemplate(compileClient(ISSUE_FIXTURE));

    expect(template).toContain('class="shell"');
    expect(template).toContain('for="a"');
    expect(template).not.toContain("className");
    expect(template).not.toContain("htmlFor");
  });

  test("maps the element-sensitive input defaults the way the server does", () => {
    const template = clientTemplate(compileClient(ISSUE_FIXTURE));

    expect(template).toContain('value="seed"');
    expect(template).toContain('checked=""');
    expect(template).not.toContain("defaultValue");
    expect(template).not.toContain("defaultChecked");
  });

  test("renders a static textarea seed as content, not as an attribute", () => {
    const template = clientTemplate(compileClient(ISSUE_FIXTURE));

    // The server writes the seed between the tags, so an attribute here would
    // disagree structurally and no name mapping could reconcile the two.
    expect(template).toContain("<textarea>area</textarea>");
  });

  test("client template and server markup carry the same elements and attributes", () => {
    const template = clientTemplate(compileClient(ISSUE_FIXTURE));
    const serverHtml = runServerComponent(compileServer(ISSUE_FIXTURE));

    // Attribute synchronisation compares these two trees node for node, so any
    // divergence here is a divergence it will act on.
    expect(describeAttributes(template)).toEqual(describeAttributes(serverHtml));
  });

  test("keeps a default value off an input that names it something else", () => {
    const template = clientTemplate(
      compileClient(`export function App() { return <input value="live" />; }`),
    );

    expect(template).toContain('value="live"');
  });

  test("keeps a safe static URL value after mapping the name", () => {
    const template = clientTemplate(
      compileClient(
        `export function App() { return <form formAction="/submit"><a href="/next">x</a></form>; }`,
      ),
    );

    expect(template).toBe('<form formaction="/submit"><a href="/next">x</a></form>');
  });

  test("seeds a static textarea from either name the server accepts", () => {
    for (const name of ["value", "defaultValue"]) {
      const template = clientTemplate(
        compileClient(`export function App() { return <textarea ${name}="area" />; }`),
      );

      expect(template, name).toBe("<textarea>area</textarea>");
    }
  });

  test("picks the seed out of a textarea's other attributes", () => {
    const source = `export function App() { return <textarea rows="3" defaultValue="area" />; }`;
    const template = clientTemplate(compileClient(source));

    expect(template).toBe('<textarea rows="3">area</textarea>');
    expect(template).toBe(runServerComponent(compileServer(source)));
  });

  test("leaves a bound textarea value to its runtime binding", () => {
    const template = clientTemplate(
      compileClient(`export function App(props) { return <textarea defaultValue={props.seed} />; }`),
    );

    // A dynamic value never enters the template; the binding applies it after
    // the node exists, so seeding the template here would double-write it.
    expect(template).toBe("<textarea></textarea>");
  });

  test("rewrites the seed names only on an input", () => {
    const source = `export function App() { return <div defaultValue="x" defaultChecked />; }`;
    const template = clientTemplate(compileClient(source));

    // The rewrite is element-sensitive: outside an input these are ordinary
    // names, and the server keeps them as written too.
    expect(describeAttributes(template)).toEqual(describeAttributes(runServerComponent(compileServer(source))));
    expect(template).toContain("defaultValue");
  });

  test("keeps dangerouslySetInnerHTML children out of the template", () => {
    const template = clientTemplate(
      compileClient(
        `export function App() { return <div className="host" dangerouslySetInnerHTML={{ __html: "<b>x</b>" }} />; }`,
      ),
    );

    expect(template).toBe('<div class="host"></div>');
  });

  test("drops an unsafe static URL value after mapping the name", () => {
    const template = clientTemplate(
      compileClient(
        `export function App() { return <form formAction="javascript:alert(1)"><a href="javascript:alert(1)">x</a></form>; }`,
      ),
    );

    expect(template).toBe("<form><a>x</a></form>");
  });

  test("leaves the compat path aliasing unchanged", () => {
    const output = transform({
      code: ISSUE_FIXTURE,
      filename: "App.tsx",
      target: "client",
      mode: "compat",
      dev: false,
    });

    expect(output.diagnostics).toEqual([]);
    // The compat runtime aliases at render time from the JSX names, so the
    // emitted object keeps them.
    expect(output.code).toContain("className");
    expect(output.code).toContain("htmlFor");
  });
});
