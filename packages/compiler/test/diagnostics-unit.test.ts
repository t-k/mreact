import { describe, expect, test } from "vitest";
import {
  invalidJsxExpressionDiagnostic,
  unserializableAwaitValueDiagnostic,
  unsupportedAwaitInnerComponentDiagnostic,
  unsupportedBodyStatementJsxDiagnostic,
  unsupportedCompatServerTargetDiagnostic,
  unsupportedComponentReferenceDiagnostic,
  unsupportedServerDynamicAttributeDiagnostic,
  unsupportedServerEventHandlerDiagnostic,
  unsupportedSpreadAttributeDiagnostic,
  unsupportedTopLevelJsxInitializerDiagnostic,
} from "../src/diagnostics.js";

const loc = { start: 1, end: 5 };

describe("compiler diagnostics: factory branches with and without loc", () => {
  test("unsupportedComponentReferenceDiagnostic emits the supplied loc only when provided", () => {
    expect(unsupportedComponentReferenceDiagnostic("Foo").loc).toBeUndefined();
    expect(unsupportedComponentReferenceDiagnostic("Foo", loc).loc).toEqual(loc);
  });

  test("unsupportedSpreadAttributeDiagnostic loc is optional", () => {
    expect(unsupportedSpreadAttributeDiagnostic().loc).toBeUndefined();
    expect(unsupportedSpreadAttributeDiagnostic(loc).loc).toEqual(loc);
  });

  test("unsupportedServerEventHandlerDiagnostic loc is optional", () => {
    expect(unsupportedServerEventHandlerDiagnostic("onClick").loc).toBeUndefined();
    expect(unsupportedServerEventHandlerDiagnostic("onClick", loc).loc).toEqual(loc);
  });

  test("unsupportedServerDynamicAttributeDiagnostic loc is optional", () => {
    expect(unsupportedServerDynamicAttributeDiagnostic("id").loc).toBeUndefined();
    expect(unsupportedServerDynamicAttributeDiagnostic("id", loc).loc).toEqual(loc);
  });

  test("unsupportedCompatServerTargetDiagnostic returns an error code without a loc", () => {
    const diagnostic = unsupportedCompatServerTargetDiagnostic();
    expect(diagnostic.level).toBe("error");
    expect(diagnostic.code).toBe("MR_UNSUPPORTED_COMPAT_SERVER_TARGET");
  });

  test("unsupportedAwaitInnerComponentDiagnostic loc is optional", () => {
    expect(unsupportedAwaitInnerComponentDiagnostic("Foo").loc).toBeUndefined();
    expect(unsupportedAwaitInnerComponentDiagnostic("Foo", loc).loc).toEqual(loc);
  });

  test("unserializableAwaitValueDiagnostic emits as a warning with optional loc", () => {
    const without = unserializableAwaitValueDiagnostic("function reference");
    expect(without.level).toBe("warn");
    expect(without.loc).toBeUndefined();
    expect(unserializableAwaitValueDiagnostic("function reference", loc).loc).toEqual(loc);
  });

  test("unsupportedBodyStatementJsxDiagnostic loc is optional", () => {
    expect(unsupportedBodyStatementJsxDiagnostic().loc).toBeUndefined();
    expect(unsupportedBodyStatementJsxDiagnostic(loc).loc).toEqual(loc);
  });

  test("unsupportedTopLevelJsxInitializerDiagnostic loc is optional", () => {
    expect(unsupportedTopLevelJsxInitializerDiagnostic().loc).toBeUndefined();
    expect(unsupportedTopLevelJsxInitializerDiagnostic(loc).loc).toEqual(loc);
  });

  test("invalidJsxExpressionDiagnostic loc is optional", () => {
    expect(invalidJsxExpressionDiagnostic().loc).toBeUndefined();
    expect(invalidJsxExpressionDiagnostic(loc).loc).toEqual(loc);
  });
});
