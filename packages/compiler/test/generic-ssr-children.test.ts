import { describe, expect, test } from "vitest";
import { createStringSink } from "@reckona/mreact-server";
import { transform } from "../src/index.js";
import { compileServerModule, compileServerStreamModule } from "./helpers.js";

async function renderPair(
  body: string,
  child: string,
  props: Record<string, unknown> = {},
  fallback = false,
  shellJsx = `<main>{${fallback ? "props.children || <b>fallback</b>" : "props.children"}}</main>`,
  forward = false,
): Promise<string[]> {
  const results: string[] = [];
  for (const serverOutput of ["string", "stream"] as const) {
    const compile = serverOutput === "string" ? compileServerModule : compileServerStreamModule;
    const shell = transform({
      code: `export function Shell(props) { return ${shellJsx}; }`,
      filename: "Shell.tsx",
      target: "server",
      serverOutput,
      dev: false,
    });
    const app = transform({
      code: `import { Shell } from "./Shell";
${forward ? "function Forward(props) { const identity = value => value; const pageBody = identity(props.children); return <Shell>{pageBody}</Shell>; }" : ""}
export function App(props) { ${body} return <${forward ? "Forward" : "Shell"}>${child}</${forward ? "Forward" : "Shell"}>; }`,
      filename: "App.tsx",
      target: "server",
      serverOutput,
      dev: false,
    });
    expect(shell.diagnostics).toEqual([]);
    expect(app.diagnostics).toEqual([]);
    const { App } = compile(app.code, compile(shell.code));
    const render = App as (...args: unknown[]) => unknown;
    const sink = createStringSink();
    const result = serverOutput === "string" ? await render(props) : await render(sink, props);
    await sink.drain();
    results.push(serverOutput === "string" ? String(result) : sink.toString());
  }
  return results;
}

describe("generic SSR component children", () => {
  test("keeps a sequence expression grouped in the children property", async () => {
    let calls = 0;
    const value = () => {
      calls++;
      return "<unsafe>";
    };
    expect(await renderPair("", "{(props.value(), props.value())}", { value })).toEqual([
      "<main>&lt;unsafe&gt;</main>",
      "<main>&lt;unsafe&gt;</main>",
    ]);
    expect(calls).toBe(4);
  });
  test.each([
    "const makeBody = () => <div>ok</div>; const pageBody = makeBody();",
    "const pageBody = (() => <div>ok</div>)();",
    "const makeBody = () => <div>ok</div>; const result = makeBody(); const pageBody = result;",
  ])("preserves a static helper result without inference from a prop read: %s", async (body) => {
    expect(await renderPair(body, "{pageBody}")).toEqual([
      "<main><div>ok</div></main>",
      "<main><div>ok</div></main>",
    ]);
  });

  test("evaluates a value expression once even when the receiver renders it twice", async () => {
    let calls = 0;
    const value = () => {
      calls++;
      return "<unsafe>";
    };
    expect(
      await renderPair(
        "",
        "{props.value()}",
        { value },
        false,
        "<main>{props.children}{props.children}</main>",
      ),
    ).toEqual([
      "<main>&lt;unsafe&gt;&lt;unsafe&gt;</main>",
      "<main>&lt;unsafe&gt;&lt;unsafe&gt;</main>",
    ]);
    expect(calls).toBe(2);
  });

  test.each([false, true])(
    "retains selection through a generic value: multiple=%s",
    async (multiple) => {
      const result = await renderPair(
        "",
        '<option value="open">open</option><option value="done">done</option>',
        {},
        false,
        multiple
          ? '<select multiple value={["open", "done"]}>{props.children}</select>'
          : '<select value="done">{props.children}</select>',
        true,
      );
      const expected = multiple
        ? '<select multiple=""><option value="open" selected="">open</option><option value="done" selected="">done</option></select>'
        : '<select><option value="open">open</option><option value="done" selected="">done</option></select>';
      expect(result).toEqual([expected, expected]);
    },
  );
  test.each([
    "const makeBody = () => <div>{props.title}</div>; const pageBody = makeBody();",
    "const pageBody = (() => <div>{props.title}</div>)();",
    "const makeBody = () => <div>{props.title}</div>; const value = makeBody(); const pageBody = value;",
  ])("preserves JSX returned through an unknown helper: %s", async (body) => {
    expect(await renderPair(body, "{pageBody}", { title: "<unsafe>" })).toEqual([
      "<main><div>&lt;unsafe&gt;</div></main>",
      "<main><div>&lt;unsafe&gt;</div></main>",
    ]);
  });

  test.each(["", null, undefined, false, true, 0, [], [null, false], "<unsafe>"])(
    "preserves the truthiness of a forwarded value: %j",
    async (value) => {
      const content = value
        ? typeof value === "string"
          ? "&lt;unsafe&gt;"
          : ""
        : "<b>fallback</b>";
      expect(await renderPair("", "{props.value}", { value }, true)).toEqual([
        `<main>${content}</main>`,
        `<main>${content}</main>`,
      ]);
    },
  );

  test.each(["false", "true", "null", "undefined", "0", '""'])(
    "renders literal children without stringifying empty values: %s",
    async (value) => {
      const expected = value === "0" ? "<main>0</main>" : "<main></main>";
      expect(await renderPair("", `{${value}}`)).toEqual([expected, expected]);
    },
  );

  test("keeps explicit string coercion untrusted", async () => {
    expect(
      await renderPair(
        "const makeBody = () => <div>ok</div>; const pageBody = makeBody();",
        "{String(pageBody)}",
      ),
    ).toEqual(["<main>&lt;div&gt;ok&lt;/div&gt;</main>", "<main>&lt;div&gt;ok&lt;/div&gt;</main>"]);
  });

  test("does not invoke a forged function or trust its public symbol", async () => {
    let calls = 0;
    const value = () => {
      calls++;
      return "<script>unsafe</script>";
    };
    value.toString = () => "<script>unsafe</script>";
    Object.defineProperty(value, Symbol.for("mreact.server.selection-render-value"), {
      value: true,
    });
    expect(await renderPair("", "{props.value}", { value })).toEqual([
      "<main>&lt;script&gt;unsafe&lt;/script&gt;</main>",
      "<main>&lt;script&gt;unsafe&lt;/script&gt;</main>",
    ]);
    expect(calls).toBe(0);
  });
});
