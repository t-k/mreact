import { describe, expect, test } from "vitest";
import {
  formatDiagnostic,
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
    expect(diagnostic.message).not.toContain("Phase");
  });

  test("unsupportedAwaitInnerComponentDiagnostic loc is optional", () => {
    expect(unsupportedAwaitInnerComponentDiagnostic("Foo").loc).toBeUndefined();
    expect(unsupportedAwaitInnerComponentDiagnostic("Foo", loc).loc).toEqual(loc);
  });

  test("unserializableAwaitValueDiagnostic emits as a warning with optional loc", () => {
    const without = unserializableAwaitValueDiagnostic("function reference");
    expect(without.level).toBe("warn");
    expect(without.loc).toBeUndefined();
    expect(without.message).not.toContain("docs/");
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

  test("invalidJsxExpressionDiagnostic includes context-specific suggestions", () => {
    const textDiagnostic = invalidJsxExpressionDiagnostic(loc, "text");
    expect(textDiagnostic.message).toContain("JSX text");
    expect(textDiagnostic.suggestion?.title).toContain("Escape literal braces");
    expect(textDiagnostic.suggestion?.replacement).toBe("&#123; / &#125;");

    const attributeDiagnostic = invalidJsxExpressionDiagnostic(loc, "attribute");
    expect(attributeDiagnostic.message).toContain("JSX attribute");
    expect(attributeDiagnostic.suggestion?.title).toContain("Use a valid JavaScript expression");
    expect(attributeDiagnostic.suggestion?.replacement).toBe('title="literal text"');
  });

  test("formatDiagnostic includes stable file and location context", () => {
    expect(
      formatDiagnostic("src/app/page.tsx", {
        level: "error",
        code: "MR_TEST",
        message: "Boom.",
        loc: { line: 4, column: 12 },
      }),
    ).toBe("src/app/page.tsx:4:12 [MR_TEST] Boom.");
  });

  test("formatDiagnostic omits location when diagnostics have no source location", () => {
    expect(
      formatDiagnostic("src/app/page.tsx", {
        level: "warn",
        code: "MR_TEST",
        message: "Boom.",
      }),
    ).toBe("src/app/page.tsx [MR_TEST] Boom.");
  });

  test("formatDiagnostic appends suggestion titles", () => {
    expect(
      formatDiagnostic("src/app/page.tsx", {
        level: "error",
        code: "MR_TEST",
        message: "Boom.",
        suggestion: { title: "Try this instead." },
      }),
    ).toBe("src/app/page.tsx [MR_TEST] Boom. Suggestion: Try this instead.");
  });

  test("formatDiagnostic includes suggestion replacement and link details", () => {
    expect(
      formatDiagnostic("src/app/page.tsx", {
        level: "error",
        code: "MR_TEST",
        message: "Boom.",
        suggestion: {
          title: "Escape the brace.",
          replacement: "&#123;",
          link: "https://example.test/docs",
        },
      }),
    ).toBe(
      "src/app/page.tsx [MR_TEST] Boom. Suggestion: Escape the brace. Replacement: &#123; See: https://example.test/docs",
    );
  });
});
