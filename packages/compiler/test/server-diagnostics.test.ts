import { describe, expect, test } from "vitest";
import { transform } from "../src/index.js";

describe("compiler server diagnostics", () => {
  test("reports event handlers as unsupported for server target", () => {
    const output = transform({
      code: "export function App() { return <button onClick={() => 1}>Click</button>; }",
      filename: "App.tsx",
      target: "server",
      dev: true,
    });

    expect(output.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "MR_UNSUPPORTED_SERVER_EVENT_HANDLER",
        level: "error",
      }),
    );
  });

  test("reports dangerous dynamic attributes as unsupported for server target", () => {
    const output = transform({
      code: "export function App() { const html = '<strong>x</strong>'; return <div dangerouslySetInnerHTML={{ __html: html }} />; }",
      filename: "App.tsx",
      target: "server",
      dev: true,
    });

    expect(output.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "MR_UNSUPPORTED_SERVER_DYNAMIC_ATTRIBUTE",
        level: "error",
      }),
    );
  });

  test("warns when <await> value is statically a non-JSON-serializable constructor (new Date())", () => {
    const output = transform({
      code: `export const stream = true;
export default function Page() {
  return <await value={new Date()}>{(d) => <p>{String(d)}</p>}</await>;
}`,
      filename: "Page.tsx",
      target: "server",
      dev: true,
      serverOutput: "stream",
      parser: "oxc",
    });

    expect(output.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "MR_UNSERIALIZABLE_AWAIT_VALUE",
        level: "warn",
      }),
    );
  });

  test("warns when <await> value wraps a non-JSON-serializable constructor (Promise.resolve(new Map()))", () => {
    const output = transform({
      code: `export const stream = true;
export default function Page() {
  return <await value={Promise.resolve(new Map())}>{(m) => <p>{String(m)}</p>}</await>;
}`,
      filename: "Page.tsx",
      target: "server",
      dev: true,
      serverOutput: "stream",
      parser: "oxc",
    });

    expect(output.diagnostics).toContainEqual(
      expect.objectContaining({
        code: "MR_UNSERIALIZABLE_AWAIT_VALUE",
        level: "warn",
      }),
    );
  });

  test("does not warn for <await> value that is a plain Promise of object literal", () => {
    const output = transform({
      code: `export const stream = true;
export default function Page() {
  return <await value={Promise.resolve({ id: 1, name: "Ada" })}>{(d) => <p>{d.name}</p>}</await>;
}`,
      filename: "Page.tsx",
      target: "server",
      dev: true,
      serverOutput: "stream",
      parser: "oxc",
    });

    expect(output.diagnostics).not.toContainEqual(
      expect.objectContaining({ code: "MR_UNSERIALIZABLE_AWAIT_VALUE" }),
    );
  });
});
