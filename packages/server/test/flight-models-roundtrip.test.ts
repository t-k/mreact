import { describe, expect, test } from "vitest";
import {
  createClientReference,
  createServerReference,
  fromReactFlightRows,
  isClientReference,
  isServerReference,
  toReactFlightRows,
  type FlightResponse,
} from "../src/index.js";

const baseResponse: Omit<FlightResponse, "root"> = {
  version: 1,
  clientReferences: [],
  serverReferences: [],
};

const roundTrip = (response: FlightResponse) => fromReactFlightRows(toReactFlightRows(response));

describe("React Flight model round-trip coverage", () => {
  test("encodes / decodes primitives unchanged", () => {
    for (const root of ["hello", 42, true, false, null] as const) {
      expect(roundTrip({ ...baseResponse, root: root as never }).root).toEqual(root);
    }
  });

  test("encodes / decodes nested objects", () => {
    const root = { a: 1, b: { c: "x", d: [1, 2, 3] } } as never;
    expect(roundTrip({ ...baseResponse, root }).root).toEqual(root);
  });

  test("encodes / decodes a Date", () => {
    const root = { kind: "date", value: "2026-05-13T00:00:00.000Z" } as const;
    expect(roundTrip({ ...baseResponse, root: root as never }).root).toEqual(root);
  });

  test("encodes / decodes a BigInt model", () => {
    const root = { kind: "bigint", value: "12345678901234567890" } as const;
    expect(roundTrip({ ...baseResponse, root: root as never }).root).toEqual(root);
  });

  test("encodes / decodes special number models (Infinity, -Infinity, NaN, -0)", () => {
    for (const value of ["Infinity", "-Infinity", "NaN", "-0"] as const) {
      const root = { kind: "number", value } as const;
      expect(roundTrip({ ...baseResponse, root: root as never }).root).toEqual(root);
    }
  });

  test("encodes / decodes Map / Set / FormData / Iterable", () => {
    const mapModel = {
      kind: "map",
      entries: [
        ["k", "v"],
        [1, 2],
      ],
    } as const;
    const setModel = { kind: "set", values: ["a", "b", "c"] } as const;
    const formDataModel = {
      kind: "form-data",
      entries: [["field", "value"]],
    } as const;
    const iterableModel = { kind: "iterable", values: [1, 2, 3] } as const;

    for (const root of [mapModel, setModel, formDataModel, iterableModel]) {
      expect(roundTrip({ ...baseResponse, root: root as never }).root).toEqual(root);
    }
  });

  test("encodes / decodes element models", () => {
    const root = {
      kind: "element",
      type: "p",
      key: null,
      props: { children: "hi" },
    } as const;
    expect(roundTrip({ ...baseResponse, root: root as never }).root).toEqual(root);
  });

  test("encodes / decodes ArrayBuffer / TypedArray / DataView models", () => {
    const bytes = [1, 2, 3, 4];
    expect(
      roundTrip({ ...baseResponse, root: { kind: "array-buffer", bytes } as never }).root,
    ).toEqual({ kind: "array-buffer", bytes });
    expect(
      roundTrip({
        ...baseResponse,
        root: { kind: "typed-array", arrayType: "Uint8Array", bytes } as never,
      }).root,
    ).toEqual({ kind: "typed-array", arrayType: "Uint8Array", bytes });
    expect(
      roundTrip({ ...baseResponse, root: { kind: "data-view", bytes } as never }).root,
    ).toEqual({ kind: "data-view", bytes });
  });

  test("encodes / decodes an error model with a digest", () => {
    const withDigest = {
      kind: "error",
      name: "Error",
      message: "boom",
      digest: "d-1",
    } as const;
    expect(roundTrip({ ...baseResponse, root: withDigest as never }).root).toEqual(withDigest);
  });

  test("encodes a server-reference root and decodes back with bound args preserved", () => {
    const ref = { kind: "server-reference", id: 4 } as const;
    const response: FlightResponse = {
      ...baseResponse,
      serverReferences: [
        {
          id: 4,
          moduleId: "actions/save",
          exportName: "save",
          bound: ["arg-a", 42],
        },
      ],
      root: ref as never,
    };
    const decoded = roundTrip(response);
    expect(decoded.serverReferences[0]).toMatchObject({
      moduleId: "actions/save",
      exportName: "save",
    });
    expect(decoded.serverReferences[0]?.bound).toEqual(["arg-a", 42]);
    expect((decoded.root as { kind: string }).kind).toBe("server-reference");
  });
});

describe("Flight reference helpers", () => {
  test("createClientReference + isClientReference round-trip", () => {
    const ref = createClientReference("mod", "Foo");
    expect(isClientReference(ref)).toBe(true);
    expect(isServerReference(ref)).toBe(false);
  });

  test("createServerReference + isServerReference round-trip with bound args", () => {
    const ref = createServerReference("actions/save", "save", ["bound"]);
    expect(isServerReference(ref)).toBe(true);
    expect(isClientReference(ref)).toBe(false);
  });

  test("isClientReference / isServerReference reject ordinary objects", () => {
    expect(isClientReference({})).toBe(false);
    expect(isClientReference(null)).toBe(false);
    expect(isServerReference({})).toBe(false);
    expect(isServerReference(null)).toBe(false);
  });
});
