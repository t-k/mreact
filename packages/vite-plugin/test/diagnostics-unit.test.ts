import { describe, expect, test } from "vitest";
import { formatDiagnostic } from "../src/diagnostics.js";

describe("vite-plugin formatDiagnostic", () => {
  test("includes the line:column suffix when loc is present", () => {
    const message = formatDiagnostic("app/page.tsx", {
      level: "error",
      code: "MR_TEST",
      message: "boom",
      loc: { line: 4, column: 12 },
    });
    expect(message).toBe("app/page.tsx:4:12 [MR_TEST] boom");
  });

  test("omits the line:column suffix when loc is absent", () => {
    const message = formatDiagnostic("app/page.tsx", {
      level: "warn",
      code: "MR_TEST",
      message: "ok",
    });
    expect(message).toBe("app/page.tsx [MR_TEST] ok");
  });
});
