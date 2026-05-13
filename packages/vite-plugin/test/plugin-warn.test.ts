import { describe, expect, test, vi } from "vitest";
import { modularReact } from "../src/index.js";

describe("modularReact warn diagnostic path", () => {
  test("forwards warn-level diagnostics through this.warn() (not this.error())", () => {
    const plugin = modularReact();
    const transform = plugin.transform;
    if (typeof transform !== "function") {
      throw new Error("transform hook is not a function");
    }
    const warn = vi.fn();
    const error = vi.fn();

    // <await value={...}> with a non-JSON-serializable Date triggers
    // MR_UNSERIALIZABLE_AWAIT_VALUE (level: "warn").
    transform.call(
      {
        environment: { mode: "build" },
        error,
        warn,
      } as never,
      `export default function Page() {
  return <await value={new Date()}>{(v) => <p>{String(v)}</p>}</await>;
}`,
      "/src/page.tsx",
      { ssr: true },
    );

    // At least one warn must have fired; error must NOT have.
    expect(warn).toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
    const msg = warn.mock.calls[0]?.[0] as string;
    expect(msg).toContain("MR_UNSERIALIZABLE_AWAIT_VALUE");
  });
});
