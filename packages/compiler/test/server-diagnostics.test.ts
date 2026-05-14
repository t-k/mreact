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

  test("warns when <Await> value is statically a non-JSON-serializable constructor (new Date())", () => {
    const output = transform({
      code: `export const stream = true;
export default function Page() {
  return <Await value={new Date()}>{(d) => <p>{String(d)}</p>}</Await>;
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

  test("warns when <Await> value wraps a non-JSON-serializable constructor (Promise.resolve(new Map()))", () => {
    const output = transform({
      code: `export const stream = true;
export default function Page() {
  return <Await value={Promise.resolve(new Map())}>{(m) => <p>{String(m)}</p>}</Await>;
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

  test("does not warn for <Await> value that is a plain Promise of object literal", () => {
    const output = transform({
      code: `export const stream = true;
export default function Page() {
  return <Await value={Promise.resolve({ id: 1, name: "Ada" })}>{(d) => <p>{d.name}</p>}</Await>;
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

  test("warns when <Await> value is a variable bound to a non-JSON-serializable constructor", () => {
    const output = transform({
      code: `export const stream = true;
export default function Page() {
  const now = new Date();
  return <Await value={now}>{(d) => <p>{String(d)}</p>}</Await>;
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

  test("warns when <Await> value is a variable bound to Promise.resolve(new Map())", () => {
    const output = transform({
      code: `export const stream = true;
export default function Page() {
  const data = Promise.resolve(new Map([["a", 1]]));
  return <Await value={data}>{(m) => <p>{String(m)}</p>}</Await>;
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

  test("does not warn when <Await> value variable resolves through indirect call (dynamic)", () => {
    const output = transform({
      code: `export const stream = true;
export default function Page() {
  const data = fetchUser();
  return <Await value={data}>{(u) => <p>{u.name}</p>}</Await>;
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
