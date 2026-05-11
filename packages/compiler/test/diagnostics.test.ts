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

  test("reports unsupported server spread attributes", () => {
    const code = [
      "export function App(props) {",
      "  return <div {...props} />;",
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
        code: "MR_UNSUPPORTED_SPREAD_ATTRIBUTE",
        level: "error",
        loc: { line: 2, column: 15 },
      }),
    );
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

  test("reports compat import component references inside await boundary renderers", () => {
    const output = transform({
      code: `
        import { Card } from "./Card.compat.tsx";

        export function App() {
          const user = Promise.resolve({ name: "Ada" });
          return (
            <await value={user} placeholder={<em>loading</em>}>
              {(value) => <Card name={value.name} />}
            </await>
          );
        }
      `,
      filename: "App.tsx",
      target: "server",
      dev: true,
      serverOutput: "stream",
    });

    expect(output.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "MR_UNSUPPORTED_AWAIT_INNER_COMPONENT",
        level: "error",
      }),
    );
  });
});
