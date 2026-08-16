import { describe, expect, test } from "vitest";
import {
  fromReactFlightRows,
  toReactFlightRows,
  type FlightModel,
  type FlightResponse,
  type FlightTypedArrayName,
} from "../src/index.js";

// Conformance corpus for issue 081 (Flight Rust port).
//
// Every `FlightModel` variant lands in `corpus` below and must round-trip
// byte-for-byte through `toReactFlightRows` -> `fromReactFlightRows`.
// Both the current JS implementation and the upcoming Rust implementation
// must pass this suite without diverging — this is the contract the
// native binding is graded against.
//
// Anything missing here that ships in production is a gap in our test
// coverage, not a license for the Rust port to be lossy. Add the case
// here first.

const baseResponse: Omit<FlightResponse, "root"> = {
  version: 1,
  clientReferences: [],
  serverReferences: [],
};

const typedArrayKinds: FlightTypedArrayName[] = [
  "Int8Array",
  "Uint8Array",
  "Uint8ClampedArray",
  "Int16Array",
  "Uint16Array",
  "Int32Array",
  "Uint32Array",
  "Float32Array",
  "Float64Array",
  "BigInt64Array",
  "BigUint64Array",
];

interface CorpusCase {
  readonly label: string;
  readonly root: FlightModel;
}

const corpus: CorpusCase[] = [
  // Primitives.
  { label: "null root", root: null },
  { label: "boolean true root", root: true },
  { label: "boolean false root", root: false },
  { label: "small positive integer root", root: 42 },
  { label: "negative integer root", root: -7 },
  { label: "fractional number root", root: 3.14 },
  { label: "zero root", root: 0 },
  { label: "empty string root", root: "" },
  { label: "ascii string root", root: "hello" },
  { label: "unicode string root", root: "日本語🚀" },

  // Strings beginning with `$` exercise the encoder's `$`-doubling rule
  // (`flight.ts:792-794`) and the decoder's `$$` peel-back
  // (`flight.ts:1268-1270`). If the Rust port mishandles this, every
  // sentinel-looking user string breaks.
  { label: "$-prefixed string root", root: "$dangerous" },
  { label: "$$-prefixed string root", root: "$$already-escaped" },
  { label: "$D-shaped user string root", root: "$Dnot-a-date" },
  { label: "$undefined-shaped user string root", root: "$undefined-but-a-string" },

  // Object shapes.
  { label: "empty object root", root: {} },
  { label: "empty array root", root: [] },
  { label: "shallow object root", root: { a: 1, b: "two" } },
  {
    label: "object with an own __proto__ data property",
    root: JSON.parse('{"__proto__":{"isAdmin":true}}') as FlightModel,
  },
  {
    label: "deeply nested array (within depth cap)",
    root: buildNestedArray(50),
  },
  {
    label: "deeply nested object (within depth cap)",
    root: buildNestedObject(50),
  },

  // Typed model variants.
  { label: "undefined model", root: { kind: "undefined" } },
  { label: "date model", root: { kind: "date", value: "2026-05-13T00:00:00.000Z" } },
  { label: "bigint model", root: { kind: "bigint", value: "9007199254740993" } },
  { label: "number model: Infinity", root: { kind: "number", value: "Infinity" } },
  { label: "number model: -Infinity", root: { kind: "number", value: "-Infinity" } },
  { label: "number model: NaN", root: { kind: "number", value: "NaN" } },
  { label: "number model: -0", root: { kind: "number", value: "-0" } },
  { label: "symbol model", root: { kind: "symbol", name: "react.fragment" } },
  { label: "promise model with id", root: { kind: "promise", id: 17 } },

  // Map / Set / FormData / Iterable allocate outline rows on the
  // encoder side, so a Rust port that gets the outline numbering wrong
  // will fail these immediately.
  {
    label: "map with mixed key/value types",
    root: {
      kind: "map",
      entries: [
        ["string-key", "string-value"],
        [1, 2],
        [{ kind: "date", value: "2026-05-13T00:00:00.000Z" }, "value-for-date"],
      ],
    },
  },
  {
    label: "set with model values",
    root: {
      kind: "set",
      values: [1, "two", { kind: "bigint", value: "3" }],
    },
  },
  {
    label: "form-data with string keys",
    root: {
      kind: "form-data",
      entries: [
        ["name", "Ada"],
        ["count", 7],
      ],
    },
  },
  {
    label: "iterable model",
    root: { kind: "iterable", values: [1, 2, 3] },
  },

  // Binary models — exhaust every TypedArray kind.
  ...typedArrayKinds.map((arrayType): CorpusCase => ({
    label: `typed-array model (${arrayType})`,
    root: { kind: "typed-array", arrayType, bytes: [1, 2, 3, 4, 5, 6, 7, 8] },
  })),
  { label: "array-buffer model", root: { kind: "array-buffer", bytes: [9, 8, 7, 6] } },
  { label: "data-view model", root: { kind: "data-view", bytes: [4, 3, 2, 1] } },

  // Element shapes.
  {
    label: "element with string type and string child",
    root: {
      kind: "element",
      type: "p",
      key: null,
      props: { children: "hi" },
    },
  },
  {
    label: "element with keyed type",
    root: {
      kind: "element",
      type: "div",
      key: "card-1",
      props: { className: "card" },
    },
  },
  {
    label: "element with fragment type",
    root: {
      kind: "element",
      type: { kind: "fragment" },
      key: null,
      props: { children: ["a", "b"] },
    },
  },

  // Error models.
  {
    label: "error model with digest",
    root: { kind: "error", name: "Error", message: "boom", digest: "d-1" },
  },
  // Note: error models without a digest round-trip to `{ digest: "" }`
  // (the encoder writes `digest: ""` to the wire when undefined, and the
  // decoder retains the empty string). The Rust port must preserve this
  // observable behavior, but documenting it as a separate assertion
  // below rather than a lossless round-trip case.
];

describe("Flight round-trip corpus (issue 081)", () => {
  test.each(corpus)("$label round-trips losslessly", ({ root }) => {
    const response: FlightResponse = { ...baseResponse, root };
    const rows = toReactFlightRows(response);
    const decoded = fromReactFlightRows(rows);

    expect(decoded.root).toEqual(root);
    expect(decoded.clientReferences).toEqual(baseResponse.clientReferences);
    expect(decoded.serverReferences).toEqual(baseResponse.serverReferences);
  });

  test.each([
    ["array-buffer", { kind: "array-buffer", bytes: [1, 2, 3, 4] }, "A"],
    ["Int8Array", { kind: "typed-array", arrayType: "Int8Array", bytes: [1, 2, 3, 4] }, "O"],
    ["Uint8Array", { kind: "typed-array", arrayType: "Uint8Array", bytes: [1, 2, 3, 4] }, "o"],
    [
      "Uint8ClampedArray",
      { kind: "typed-array", arrayType: "Uint8ClampedArray", bytes: [1, 2, 3, 4] },
      "U",
    ],
    ["Int16Array", { kind: "typed-array", arrayType: "Int16Array", bytes: [1, 2, 3, 4] }, "S"],
    ["Uint16Array", { kind: "typed-array", arrayType: "Uint16Array", bytes: [1, 2, 3, 4] }, "s"],
    ["Int32Array", { kind: "typed-array", arrayType: "Int32Array", bytes: [1, 2, 3, 4] }, "L"],
    ["Uint32Array", { kind: "typed-array", arrayType: "Uint32Array", bytes: [1, 2, 3, 4] }, "l"],
    ["Float32Array", { kind: "typed-array", arrayType: "Float32Array", bytes: [1, 2, 3, 4] }, "G"],
    ["Float64Array", { kind: "typed-array", arrayType: "Float64Array", bytes: [1, 2, 3, 4] }, "g"],
    ["BigInt64Array", { kind: "typed-array", arrayType: "BigInt64Array", bytes: [1, 2, 3, 4] }, "M"],
    [
      "BigUint64Array",
      { kind: "typed-array", arrayType: "BigUint64Array", bytes: [1, 2, 3, 4] },
      "m",
    ],
    ["data-view", { kind: "data-view", bytes: [1, 2, 3, 4] }, "V"],
  ] as const)("emits the %s model with binary row tag %s", (_label, root, tag) => {
    const rows = toReactFlightRows({ ...baseResponse, root });

    expect(rows).toContain(`1:${tag}4,AQIDBA==`);
    expect(rows).toContain('0:"$1"');
    expect(fromReactFlightRows(rows).root).toEqual(root);
  });

  test("encodes a large binary model without argument-list overflow", () => {
    const bytes = Array.from({ length: 128 * 1024 }, (_unused, index) => index & 0xff);
    const rows = toReactFlightRows({
      ...baseResponse,
      root: { kind: "array-buffer", bytes },
    });

    expect(rows).toContain(`1:A${bytes.length.toString(16)},`);
    expect(fromReactFlightRows(rows).root).toEqual({ kind: "array-buffer", bytes });
  });

  test("element with a client-reference type carries the reference id", () => {
    const response: FlightResponse = {
      version: 1,
      clientReferences: [
        { id: 11, moduleId: "components/Card", exportName: "default", chunks: [] },
      ],
      serverReferences: [],
      root: {
        kind: "element",
        type: { kind: "client-reference", id: 11 },
        key: null,
        props: { title: "hello" },
      },
    };

    const decoded = fromReactFlightRows(toReactFlightRows(response));

    expect(decoded.root).toMatchObject({
      kind: "element",
      props: { title: "hello" },
    });
    expect(decoded.clientReferences).toEqual([
      { id: 1, moduleId: "components/Card", exportName: "default", chunks: [] },
    ]);
  });

  test("error model without digest gains a normalized empty digest after round-trip", () => {
    // Documents the encoder/decoder asymmetry at flight.ts:1468 (encoder
    // writes `digest: ""` when undefined) and flight.ts:1456 (decoder
    // retains a non-undefined string). The Rust port MUST preserve this
    // exact behavior to be a faithful drop-in.
    const root: FlightModel = { kind: "error", name: "TypeError", message: "kaboom" };
    const decoded = fromReactFlightRows(toReactFlightRows({ ...baseResponse, root }));

    expect(decoded.root).toEqual({
      kind: "error",
      name: "TypeError",
      message: "kaboom",
      digest: "",
    });
  });

  test("bare client references round-trip without colliding with binary row tags", () => {
    const root: FlightModel = { kind: "client-reference", id: 1 };
    const response: FlightResponse = {
      ...baseResponse,
      clientReferences: [
        { id: 1, moduleId: "components/Card", exportName: "default", chunks: [] },
      ],
      root,
    };

    expect(fromReactFlightRows(toReactFlightRows(response)).root).toEqual(root);
  });
});

function buildNestedArray(depth: number): FlightModel {
  let nested: FlightModel = 0;

  for (let i = 0; i < depth; i += 1) {
    nested = [nested];
  }

  return nested;
}

function buildNestedObject(depth: number): FlightModel {
  let nested: FlightModel = "leaf";

  for (let i = 0; i < depth; i += 1) {
    nested = { child: nested } as FlightModel;
  }

  return nested;
}
