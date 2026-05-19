import { describe, expect, test } from "vitest";
import { parseTraceContext } from "../src/trace.js";

describe("router trace context", () => {
  test("parses W3C traceparent and tracestate headers", () => {
    expect(
      parseTraceContext(
        "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01",
        "vendor=value",
      ),
    ).toEqual({
      parentSpanId: "00f067aa0ba902b7",
      sampled: true,
      traceId: "4bf92f3577b34da6a3ce929d0e0e4736",
      traceparent: "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01",
      tracestate: "vendor=value",
    });
  });

  test("rejects malformed or all-zero trace ids", () => {
    expect(parseTraceContext("bad", undefined)).toBeUndefined();
    expect(
      parseTraceContext(
        "00-00000000000000000000000000000000-00f067aa0ba902b7-01",
        undefined,
      ),
    ).toBeUndefined();
  });
});
