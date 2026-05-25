import { describe, expect, test } from "vitest";
import {
  emitAsyncBoundary,
  emitOutOfOrderBoundary,
  emitReactSuspenseBoundary,
  emitReactSuspenseOutOfOrderBoundary,
} from "../src/emit-boundary-lowering.js";

const nested = (parts: readonly string[], sinkName: string) =>
  parts.map((part) => `  ${sinkName}.append(${JSON.stringify(part)});`).join("\n");

describe("compiler stream boundary lowering", () => {
  test("lowers in-order Await boundaries with catch and hydration options", () => {
    expect(
      emitAsyncBoundary(
        {
          awaitId: "route:data",
          catchName: "error",
          catchParts: ["catch"],
          parts: ["ok"],
          valueCode: "load()",
          valueName: "value",
        },
        {
          asyncBoundaryHelperName: "_renderAsyncBoundary",
          compatRenderToStringHelperName: "_renderCompatToString",
          emitNestedAppendStatements: nested,
          sinkName: "sink",
        },
      ),
    ).toBe(
      '  await _renderAsyncBoundary(sink, (load()), async (sink, value) => {\n  sink.append("ok");\n  }, { catch: (sink, error) => {\n  sink.append("catch");\n  }, hydrationAwaitId: "route:data" });',
    );
  });

  test("lowers out-of-order Await boundaries with placeholder and tag options", () => {
    expect(
      emitOutOfOrderBoundary(
        {
          id: "mreact-oob-0",
          hydration: true,
          parts: ["body"],
          placeholderParts: ["loading"],
          placeholderTagCode: "\"section\"",
          valueCode: "data",
          valueName: "value",
        },
        {
          compatRenderToStringHelperName: "_renderCompatToString",
          emitNestedAppendStatements: nested,
          outOfOrderBoundaryHelperName: "_renderOutOfOrderBoundary",
          sinkName: "sink",
        },
      ),
    ).toContain('placeholderTag: ("section")');
  });

  test("lowers React Suspense boundary variants through explicit helper names", () => {
    expect(
      emitReactSuspenseBoundary(
        { parts: ["body"] },
        {
          compatRenderToStringHelperName: "_renderCompatToString",
          emitNestedAppendStatements: nested,
          reactSuspenseBoundaryHelperName: "_renderReactSuspenseBoundary",
          sinkName: "sink",
        },
      ),
    ).toBe(
      '  await _renderReactSuspenseBoundary(sink, async (sink) => {\n  sink.append("body");\n  });',
    );

    expect(
      emitReactSuspenseOutOfOrderBoundary(
        {
          boundaryId: "b0",
          fallbackParts: ["fallback"],
          parts: ["body"],
          scriptSrc: "/reveal.js",
          segmentId: "s0",
          valueCode: "load()",
          valueName: "value",
        },
        {
          compatRenderToStringHelperName: "_renderCompatToString",
          emitNestedAppendStatements: nested,
          reactSuspenseOutOfOrderBoundaryHelperName: "_renderReactSuspenseOutOfOrderBoundary",
          sinkName: "sink",
        },
      ),
    ).toContain('src: "/reveal.js",');
  });
});
