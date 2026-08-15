import { describe, expect, test } from "vitest";
import { assertCompatLabPassed } from "./assert-run-passed.js";

describe("compat lab result assertion", () => {
  test("accepts an empty or fully successful run", () => {
    expect(() =>
      assertCompatLabPassed({
        labName: "Radix",
        outputDir: "/tmp/radix-results",
        results: [],
      }),
    ).not.toThrow();
    expect(() =>
      assertCompatLabPassed({
        labName: "Radix",
        outputDir: "/tmp/radix-results",
        results: [
          { fixtureId: "dialog", ok: true },
          { fixtureId: "popover", ok: true },
        ],
      }),
    ).not.toThrow();
  });

  test("reports a failed fixture with the lab name and result directory", () => {
    expect(() =>
      assertCompatLabPassed({
        labName: "React Flow",
        outputDir: "/tmp/react-flow-results",
        results: [{ fixtureId: "basic-canvas", ok: false }],
      }),
    ).toThrow("React Flow compat lab failed for basic-canvas. Results: /tmp/react-flow-results");
  });

  test("reports every failed fixture in input order", () => {
    expect(() =>
      assertCompatLabPassed({
        labName: "UI primitive",
        outputDir: "/tmp/ui-results",
        results: [
          { fixtureId: "dialog", ok: false },
          { fixtureId: "menu", ok: true },
          { fixtureId: "listbox", ok: false },
        ],
      }),
    ).toThrow("UI primitive compat lab failed for dialog, listbox. Results: /tmp/ui-results");
  });
});
