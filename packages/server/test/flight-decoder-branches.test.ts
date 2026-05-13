import { describe, expect, test } from "vitest";
import {
  fromReactFlightRows,
  mergeReactFlightRows,
  toReactFlightRows,
  type FlightErrorModel,
  type FlightResponse,
} from "../src/index.js";

const emptyResponse: FlightResponse = {
  version: 1,
  root: null,
  clientReferences: [],
  serverReferences: [],
};

describe("React Flight wire decoder edge branches", () => {
  test("fromReactFlightRows throws when no root row is found", () => {
    expect(() => fromReactFlightRows("")).toThrow("Invalid React Flight rows.");
  });

  test("fromReactFlightRows filters empty rows produced by trailing newlines", () => {
    const response = fromReactFlightRows('0:"x"\n\n');
    expect(response.root).toBe("x");
  });

  test("mergeReactFlightRows extends client references seen on the wire", () => {
    const merged = mergeReactFlightRows(
      emptyResponse,
      `1:I${JSON.stringify(["mod", [], "Foo"])}`,
    );

    expect(merged.clientReferences).toHaveLength(1);
    expect(merged.clientReferences[0]).toMatchObject({
      moduleId: "mod",
      exportName: "Foo",
    });
  });

  test("toReactFlightRows emits an error root using the E tag", () => {
    const errorRoot: FlightErrorModel = {
      kind: "error",
      name: "Error",
      message: "boom-root",
      digest: "d2",
    };
    const response: FlightResponse = {
      ...emptyResponse,
      root: errorRoot,
    };
    const rows = toReactFlightRows(response);
    expect(rows.startsWith("0:E")).toBe(true);
    expect(rows).toContain('"message":"boom-root"');
  });
});
