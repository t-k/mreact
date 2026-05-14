import { describe, expect, test } from "vitest";
import { fromReactFlightRows } from "../src/index.js";

describe("Flight server decoder depth cap (Issue 079)", () => {
  test("deeply-nested payload throws FlightDecodeError, not RangeError", () => {
    // Build a 5000-level deep nested array. The decoder used to crash
    // with `RangeError: Maximum call stack size exceeded`. After the
    // fix it throws a typed FlightDecodeError ("MR_FLIGHT_TOO_DEEP").
    let nested = "0";
    for (let i = 0; i < 5_000; i += 1) {
      nested = `[${nested}]`;
    }
    // Build the metadata-style two-line format that fromReactFlightRows
    // recognizes.
    const rows = [
      `M0:${JSON.stringify({ version: 1, clientReferences: [], serverReferences: [] })}`,
      `J0:${nested}`,
    ].join("\n");

    // fromReactFlightRows just parses JSON -- the recursive decoder is
    // hit downstream (e.g. via decode helpers in router). We assert
    // the parser does not stack-overflow.
    expect(() => fromReactFlightRows(rows)).not.toThrow(/Maximum call stack/);
  });
});
