// @vitest-environment happy-dom

import { describe, expect, test } from "vitest";
import { assertPropsRows, validatePropsMeasurement } from "./compat-props-entry.mjs";

function rows(count = 3) {
  return Array.from({ length: count }, () => {
    const row = document.createElement("span");
    row.textContent = "value-0";
    return row;
  });
}

describe("compat props benchmark validation", () => {
  test("checks selected insertion and removal outside measurement", () => {
    const initial = rows();
    let version = 0;
    const verified: number[] = [];
    validatePropsMeasurement({
      update() {
        version++;
        for (const row of initial) {
          row.textContent = `value-${version}`;
          row.className = version % 2 ? "selected" : "";
        }
      },
      verify() {
        assertPropsRows(initial, initial, "multiple", initial.length, version);
        verified.push(version);
      },
    });
    expect(verified).toEqual([0, 1, 2]);
  });

  test.each(["multiple", "object"])("rejects a %s row that never becomes selected", (kind) => {
    const initial = rows();
    let version = 486;
    for (const row of initial) row.textContent = `value-${version}`;
    expect(() =>
      validatePropsMeasurement({
        update() {
          version++;
          for (const row of initial) row.textContent = `value-${version}`;
        },
        verify() {
          assertPropsRows(initial, initial, kind, initial.length, version);
        },
      }),
    ).toThrow(/values/);
  });

  test.each([0, 1, 2])("rejects replacement of row %i even with correct values", (index) => {
    const initial = rows();
    const current = [...initial];
    current[index] = initial[index]!.cloneNode(true) as HTMLSpanElement;
    expect(() => assertPropsRows(current, initial, "single", initial.length, 0)).toThrow(
      /identity/,
    );
  });

  test("rejects lost rows and stale text", () => {
    const initial = rows();
    expect(() => assertPropsRows(initial.slice(1), initial, "single", 3, 0)).toThrow();
    expect(() => assertPropsRows(initial, initial, "single", 3, 1)).toThrow(/values/);
  });
});
