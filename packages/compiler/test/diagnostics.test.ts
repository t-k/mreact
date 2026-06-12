import { parseSync } from "oxc-parser";
import { describe, expect, test } from "vitest";
import { transform } from "../src/index.js";

describe("compiler diagnostics", () => {
  test("supports the server target for the Phase 5 subset", () => {
    const output = transform({
      code: "export function App() { return <div>Hello SSR</div>; }",
      filename: "App.tsx",
      target: "server",
      dev: true,
    });

    expect(output.diagnostics).toEqual([]);
    expect(output.metadata.target).toBe("server");
    expect(output.code).toContain("export function App()");
  });

  test("reports unsupported dynamic component composition", () => {
    const output = transform({
      code: `
        export function App() { return <Missing />; }
      `,
      filename: "App.tsx",
      target: "client",
      dev: true,
    });

    expect(output.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "MR_UNSUPPORTED_COMPONENT_REFERENCE",
        level: "error",
      }),
    );
  });

  test("accepts same-module exported component composition", () => {
    const output = transform({
      code: `
        export function Child() { return <span />; }
        export function App() { return <Child />; }
      `,
      filename: "App.tsx",
      target: "client",
      dev: true,
    });

    expect(output.diagnostics).toEqual([]);
  });

  test("allows server spread attributes", () => {
    const code = ["export function App(props) {", "  return <div {...props} />;", "}"].join("\n");
    const output = transform({
      code,
      filename: "App.tsx",
      target: "server",
      dev: true,
    });

    expect(output.diagnostics).toEqual([]);
  });

  test("reports unsupported ref attributes outside compat client output", () => {
    const code = [
      "export function App(props) {",
      "  return <input ref={props.inputRef} />;",
      "}",
    ].join("\n");
    const output = transform({
      code,
      filename: "App.tsx",
      target: "server",
      dev: true,
    });

    expect(output.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "MR_UNSUPPORTED_REF_ATTRIBUTE",
        level: "error",
        loc: { line: 2, column: 17 },
      }),
    );
  });

  test("reports unsupported component ref props outside compat client output", () => {
    const code = [
      "export function Child() { return <span />; }",
      "export function App(props) {",
      "  return <Child ref={props.childRef} />;",
      "}",
    ].join("\n");
    const output = transform({
      code,
      filename: "App.tsx",
      target: "client",
      dev: true,
    });

    expect(output.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "MR_UNSUPPORTED_REF_ATTRIBUTE",
        level: "error",
        loc: { line: 3, column: 17 },
      }),
    );
  });

  test("accepts ref attributes in compat client output", () => {
    const code = [
      "export function App(props) {",
      "  return <input ref={props.inputRef} />;",
      "}",
    ].join("\n");
    const output = transform({
      code,
      filename: "App.tsx",
      target: "client",
      mode: "compat",
      dev: true,
    });

    expect(output.diagnostics).toEqual([]);
    expect(output.code).toContain("ref:");
  });

  test("reports Oxc server diagnostics with source locations", () => {
    const code = [
      "export function App(props) {",
      "  return <button onClick={props.onClick} />;",
      "}",
    ].join("\n");
    const output = transform({
      code,
      filename: "App.tsx",
      target: "server",
      dev: true,
      parser: "oxc",
    });

    expect(output.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "MR_UNSUPPORTED_SERVER_EVENT_HANDLER",
        level: "error",
        loc: { line: 2, column: 18 },
      }),
    );
  });

  test("reports unsupported top-level JSX initializer", () => {
    const output = transform({
      code: `
        const headline = <h1>title</h1>;
        export function App() { return <div>{headline}</div>; }
      `,
      filename: "App.tsx",
      target: "client",
      dev: true,
    });

    expect(output.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "MR_UNSUPPORTED_TOP_LEVEL_JSX_INITIALIZER",
        level: "error",
      }),
    );
  });

  test("reports empty JSX expression children", () => {
    const output = transform({
      code: `export function App() { return <code>x{}y</code>; }`,
      filename: "App.tsx",
      target: "client",
      dev: true,
      mode: "compat",
    });

    expect(output.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "MR_INVALID_JSX_EXPRESSION",
        level: "error",
      }),
    );
  });

  test("reports unsupported JSX spread children instead of dropping them", () => {
    const output = transform({
      code: `export function App() { return <div>{...[<span>A</span>]}</div>; }`,
      filename: "App.tsx",
      target: "client",
      dev: true,
      mode: "compat",
    });

    expect(output.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "MR_UNSUPPORTED_JSX_SPREAD_CHILD",
        level: "error",
      }),
    );
  });

  test("reports async function components as unsupported in client output", () => {
    const code = [
      "async function getTitle() { return 'Hello'; }",
      "export async function App() {",
      "  const title = await getTitle();",
      "  return <h1>{title}</h1>;",
      "}",
    ].join("\n");
    const clientOutput = transform({
      code,
      filename: "App.tsx",
      target: "client",
      dev: true,
    });
    const serverStringOutput = transform({
      code,
      filename: "App.tsx",
      target: "server",
      serverOutput: "string",
      dev: true,
    });
    const serverStreamOutput = transform({
      code,
      filename: "App.tsx",
      target: "server",
      serverOutput: "stream",
      dev: true,
    });

    expect(clientOutput.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "MR_ASYNC_COMPONENT_CLIENT_UNSUPPORTED",
        level: "error",
      }),
    );
    expect(serverStringOutput.diagnostics).toEqual([]);
    expect(serverStreamOutput.diagnostics).toEqual([]);
    expectModuleParses(clientOutput.code);
    expectModuleParses(serverStringOutput.code);
    expectModuleParses(serverStreamOutput.code);
  });

  test("reports async arrow components as unsupported in client output", () => {
    const code = [
      "async function getTitle() { return 'Hello'; }",
      "export const App = async () => {",
      "  const title = await getTitle();",
      "  return <h1>{title}</h1>;",
      "};",
    ].join("\n");
    const output = transform({
      code,
      filename: "App.tsx",
      target: "client",
      dev: true,
    });
    const compatOutput = transform({
      code,
      filename: "App.tsx",
      target: "client",
      mode: "compat",
      dev: true,
    });

    expect(output.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "MR_ASYNC_COMPONENT_CLIENT_UNSUPPORTED",
        level: "error",
      }),
    );
    expect(compatOutput.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "MR_ASYNC_COMPONENT_CLIENT_UNSUPPORTED",
        level: "error",
      }),
    );
    expectModuleParses(output.code);
    expectModuleParses(compatOutput.code);
  });

  test("reports unparseable JSX text expression recovery", () => {
    const output = transform({
      code: `export function App() {
        return <code>lazy(() =&gt; import("./X").then(m =&gt; ({ default: m.X })))</code>;
      }`,
      filename: "App.tsx",
      target: "client",
      dev: true,
      mode: "compat",
    });

    expect(output.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "MR_INVALID_JSX_EXPRESSION",
        level: "error",
      }),
    );
    expect(output.code).not.toContain(", ()");
  });

  test("reports Oxc parse diagnostics with source location", () => {
    const output = transform({
      code: `export function App() {
  return <div>{</div>;
}`,
      filename: "App.tsx",
      target: "client",
      dev: true,
      mode: "compat",
    });

    expect(output.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "MR_INVALID_JSX_EXPRESSION",
        level: "error",
        loc: { line: 2, column: 17 },
      }),
    );
  });

  test.each([
    ["setter return type", "class C { set value(v): string {} }"],
    ["optional setter parameter", "class C { set value(v?: string) {} }"],
    ["duplicate switch default", "switch (value) { default: break; default: break; }"],
  ])(
    "reports stricter Oxc parser diagnostics for invalid TypeScript: %s",
    (_name, invalidCode) => {
      const output = transform({
        code: `${invalidCode}
export function App() { return <div />; }`,
        filename: "App.tsx",
        target: "client",
        dev: true,
        mode: "compat",
        parser: "oxc",
      });

      expect(output.diagnostics).toContainEqual(
        expect.objectContaining({
          code: "MR_OXC_PARSE_ERROR",
          level: "error",
        }),
      );
    },
  );

  test("reports compat import component references inside await boundary renderers without stream lowering", () => {
    const output = transform({
      code: `
        import { Card } from "./Card.compat.tsx";

        export function App() {
          const user = Promise.resolve({ name: "Ada" });
          return (
            <Await value={user} placeholder={<em>loading</em>}>
              {(value) => <Card name={value.name} />}
            </Await>
          );
        }
      `,
      filename: "App.tsx",
      target: "server",
      dev: true,
    });

    expect(output.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "MR_UNSUPPORTED_AWAIT_INNER_COMPONENT",
        level: "error",
        loc: expect.objectContaining({ line: 8 }),
      }),
    );
  });
});

function expectModuleParses(code: string): void {
  const parsed = parseSync("output.js", code, { sourceType: "module" });

  expect(parsed.errors).toEqual([]);
}
