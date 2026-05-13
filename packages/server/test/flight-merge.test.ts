import { describe, expect, test } from "vitest";
import {
  fromReactFlightRows,
  mergeReactFlightRows,
  toReactFlightRows,
  type FlightResponse,
} from "../src/index.js";

const baseResponse: Omit<FlightResponse, "root"> = {
  version: 1,
  clientReferences: [],
  serverReferences: [],
};

describe("mergeReactFlightRows deferred-promise resolution paths", () => {
  test("resolves a promise reference inside an Array root", () => {
    const initial: FlightResponse = {
      ...baseResponse,
      root: [{ kind: "promise", id: 1 } as never, "tail"],
    };
    const merged = mergeReactFlightRows(initial, `1:"resolved-a"`);
    expect(merged.root).toEqual(["resolved-a", "tail"]);
  });

  test("resolves a promise reference inside element props", () => {
    const initial: FlightResponse = {
      ...baseResponse,
      root: {
        kind: "element",
        type: "p",
        key: null,
        props: { children: { kind: "promise", id: 2 } as never },
      },
    };
    const merged = mergeReactFlightRows(initial, `2:"resolved-child"`);
    expect((merged.root as { props: { children: unknown } }).props.children).toBe(
      "resolved-child",
    );
  });

  test("resolves a promise reference inside Map entries", () => {
    const initial: FlightResponse = {
      ...baseResponse,
      root: {
        kind: "map",
        entries: [
          [{ kind: "promise", id: 3 } as never, { kind: "promise", id: 4 } as never],
        ],
      },
    };
    const merged = mergeReactFlightRows(
      initial,
      `3:"key-a"\n4:"value-a"`,
    );
    expect((merged.root as { entries: [unknown, unknown][] }).entries).toEqual([
      ["key-a", "value-a"],
    ]);
  });

  test("resolves a promise reference inside a Set", () => {
    const initial: FlightResponse = {
      ...baseResponse,
      root: {
        kind: "set",
        values: [{ kind: "promise", id: 5 } as never, "literal"],
      },
    };
    const merged = mergeReactFlightRows(initial, `5:"resolved-set"`);
    expect((merged.root as { values: unknown[] }).values).toEqual([
      "resolved-set",
      "literal",
    ]);
  });

  test("resolves a promise reference inside an ordinary object root", () => {
    const initial: FlightResponse = {
      ...baseResponse,
      root: { pending: { kind: "promise", id: 6 } } as never,
    };
    const merged = mergeReactFlightRows(initial, `6:"resolved-pojo"`);
    expect((merged.root as { pending: unknown }).pending).toBe("resolved-pojo");
  });

  test("preserves unresolved promise references when no merge data arrives", () => {
    const initial: FlightResponse = {
      ...baseResponse,
      root: { kind: "promise", id: 99 } as never,
    };
    const merged = mergeReactFlightRows(initial, "");
    expect(merged.root).toEqual({ kind: "promise", id: 99 });
  });

  test("returns an error when the promise resolves into an error chunk", () => {
    const initial: FlightResponse = {
      ...baseResponse,
      root: { kind: "promise", id: 7 } as never,
    };
    const merged = mergeReactFlightRows(
      initial,
      `7:E${JSON.stringify({ name: "Error", message: "merge-err" })}`,
    );
    expect((merged.root as { kind: string }).kind).toBe("error");
    expect((merged.root as { message: string }).message).toBe("merge-err");
  });
});

describe("Flight non-merge encode/decode coverage", () => {
  test("encoder writes the Symbol model as `$S<name>`", () => {
    const response: FlightResponse = {
      ...baseResponse,
      root: { kind: "symbol", name: "react.fragment" } as never,
    };
    const rows = toReactFlightRows(response);
    expect(rows).toContain("$S");
    const decoded = fromReactFlightRows(rows);
    expect(decoded.root).toEqual({ kind: "symbol", name: "react.fragment" });
  });

  test("encoder escapes a top-level string starting with `$` so the decoder restores the original", () => {
    const response: FlightResponse = {
      ...baseResponse,
      root: "$literal-dollar" as never,
    };
    const rows = toReactFlightRows(response);
    const decoded = fromReactFlightRows(rows);
    expect(decoded.root).toBe("$literal-dollar");
  });

  test("undefined model encodes as `$u` and decodes back", () => {
    const response: FlightResponse = {
      ...baseResponse,
      root: { kind: "undefined" } as never,
    };
    const rows = toReactFlightRows(response);
    expect(rows).toContain("$u");
    expect(fromReactFlightRows(rows).root).toEqual({ kind: "undefined" });
  });
});
