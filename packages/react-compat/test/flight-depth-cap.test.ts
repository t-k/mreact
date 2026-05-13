import { describe, expect, test } from "vitest";
import { decodeFlightResponse, parseFlightResponse } from "../src/flight.js";

describe("react-compat Flight client decoder depth cap (Issue 079)", () => {
  test("decodes a deeply-nested payload as FlightDecodeError, not RangeError", () => {
    // Build a 5000-deep nested array literal. parseFlightResponse uses
    // JSON.parse (iterative) so it survives; decodeFlightResponse used
    // to recurse and crash with RangeError. Now it throws a typed
    // FlightDecodeError.
    let nested = "0";
    for (let i = 0; i < 5_000; i += 1) {
      nested = `[${nested}]`;
    }
    const payload = `{"version":1,"root":${nested},"clientReferences":[],"serverReferences":[]}`;
    const response = parseFlightResponse(payload);
    expect(() => decodeFlightResponse(response, {})).toThrow(
      /MR_FLIGHT_TOO_DEEP/,
    );
  });

  test("legitimate (shallow) Flight payloads still decode", () => {
    const payload = `{"version":1,"root":[1,2,3],"clientReferences":[],"serverReferences":[]}`;
    const response = parseFlightResponse(payload);
    expect(() => decodeFlightResponse(response, {})).not.toThrow();
  });
});
