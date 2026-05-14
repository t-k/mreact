import { describe, expect, test } from "vitest";
import { transform } from "../src/index.js";
import type { ServerOutputMode } from "../src/types.js";

describe("compiler diagnostics contract", () => {
  test.each([
    {
      name: "unsupported component return",
      target: "client" as const,
      code: "export function App() { return 1; }",
      expected: ["MR_UNSUPPORTED_COMPONENT_RETURN"],
    },
    {
      name: "unsupported component reference",
      target: "client" as const,
      code: "export function App() { return <Missing />; }",
      expected: ["MR_UNSUPPORTED_COMPONENT_REFERENCE"],
    },
    {
      name: "unsupported top-level JSX initializer",
      target: "client" as const,
      code: "const headline = <h1>title</h1>; export function App() { return <div>{headline}</div>; }",
      expected: ["MR_UNSUPPORTED_TOP_LEVEL_JSX_INITIALIZER"],
    },
    {
      name: "unsupported server spread attribute",
      target: "server" as const,
      code: "export function App(props) { return <div {...props} />; }",
      expected: ["MR_UNSUPPORTED_SPREAD_ATTRIBUTE"],
    },
    {
      name: "server event handler",
      target: "server" as const,
      code: "export function App() { return <button onClick={() => 1}>Click</button>; }",
      expected: ["MR_UNSUPPORTED_SERVER_EVENT_HANDLER"],
    },
    {
      name: "unsupported server dangerous dynamic attribute",
      target: "server" as const,
      code: 'export function App() { const html = "<strong>x</strong>"; return <div dangerouslySetInnerHTML={{ __html: html }} />; }',
      expected: ["MR_UNSUPPORTED_SERVER_DYNAMIC_ATTRIBUTE"],
    },
    {
      name: "await inner compat component without stream lowering",
      target: "server" as const,
      code: 'import { Card } from "./Card.compat.tsx"; export function App() { const user = Promise.resolve({ name: "Ada" }); return <Await value={user}>{value => <Card name={value.name} />}</Await>; }',
      expected: ["MR_UNSUPPORTED_AWAIT_INNER_COMPONENT"],
    },
  ])("$name", ({ code, target, serverOutput, expected }) => {
    const output = transform({
      code,
      filename: "App.tsx",
      target,
      dev: true,
      ...(serverOutput === undefined ? {} : { serverOutput: serverOutput as ServerOutputMode }),
    });

    expect(output.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(expected);
  });
});
