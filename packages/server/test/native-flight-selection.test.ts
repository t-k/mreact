import { describe, expect, test } from "vitest";
import { getNativeFlight } from "../src/native-flight.js";

// Sanity check that the native binding selection logic actually loads
// the prebuilt addon when MR_FLIGHT_NATIVE=1, rather than silently
// falling back to the JS implementation. CI runs this with and without
// the flag — both modes must behave correctly.

describe("native Flight selection (issue 081)", () => {
  test("returns undefined when MR_FLIGHT_NATIVE is unset", () => {
    if (process.env.MR_FLIGHT_NATIVE === "1") {
      // Skip: the env flag is set for this run. The opposite branch
      // (next test) covers this case.
      return;
    }
    expect(getNativeFlight()).toBeUndefined();
  });

  test("loads the native binding when MR_FLIGHT_NATIVE=1", () => {
    if (process.env.MR_FLIGHT_NATIVE !== "1") {
      // Skip: only assertable when the caller opted in to native.
      return;
    }
    const native = getNativeFlight();
    expect(native).toBeDefined();
    expect(typeof native?.decodeFlightBase64).toBe("function");
  });

  test("native decodeFlightBase64 returns the same bytes as the JS atob path", () => {
    if (process.env.MR_FLIGHT_NATIVE !== "1") {
      return;
    }
    const native = getNativeFlight();
    const result = native?.decodeFlightBase64?.("aGVsbG8=");
    expect(result).toBeDefined();
    expect(Array.from(result ?? new Uint8Array())).toEqual([
      0x68,
      0x65,
      0x6c,
      0x6c,
      0x6f,
    ]);
  });
});
