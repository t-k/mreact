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
    expect(() =>
      decodeFlightResponse(response, {
        loadClientReference() {
          throw new Error("unexpected client reference");
        },
      }),
    ).toThrow(/MR_FLIGHT_TOO_DEEP/);
  });

  test("legitimate (shallow) Flight payloads still decode", () => {
    const payload = `{"version":1,"root":[1,2,3],"clientReferences":[],"serverReferences":[]}`;
    const response = parseFlightResponse(payload);
    expect(() =>
      decodeFlightResponse(response, {
        loadClientReference() {
          throw new Error("unexpected client reference");
        },
      }),
    ).not.toThrow();
  });
});

describe("react-compat Flight row parser depth and cycle hardening", () => {
  test("rejects direct cyclic row chunk references without native stack overflow", () => {
    const payload = ['0:"$1"', '1:"$1"'].join("\n");

    expect(() => parseFlightResponse(payload)).toThrow(/MR_FLIGHT_CYCLE/);
  });

  test("rejects multi-chunk cyclic row references without native stack overflow", () => {
    const payload = ['0:"$1"', '1:"$2"', '2:"$1"'].join("\n");

    expect(() => parseFlightResponse(payload)).toThrow(/MR_FLIGHT_CYCLE/);
  });

  test("rejects collection chunk cycles without native stack overflow", () => {
    const payload = ['0:"$Q1"', '1:[["k","$2"]]', '2:[["x","$1"]]'].join("\n");

    expect(() => parseFlightResponse(payload)).toThrow(/MR_FLIGHT_CYCLE/);
  });

  test("rejects deeply outlined row chunks before recursive expansion overflows", () => {
    let nested = "0";
    for (let i = 0; i < 300; i += 1) {
      nested = `[${nested}]`;
    }

    expect(() => parseFlightResponse(`0:${nested}`)).toThrow(/MR_FLIGHT_TOO_DEEP/);
  });
});
