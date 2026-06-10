// @vitest-environment happy-dom

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import {
  getEventPriority,
  toEventNames,
  toEventPropNames,
} from "../src/host-event-binder.js";

describe("host event binder", () => {
  test("normalizes React prop names to delegated native events", () => {
    expect(toEventNames("onClick")).toEqual(["click"]);
    expect(toEventNames("onDoubleClick")).toEqual(["dblclick"]);
    expect(toEventNames("onClickCapture")).toEqual(["click"]);
    expect(toEventNames("onChange")).toEqual(["change", "input"]);
    expect(toEventNames("onDrag")).toEqual(["drag"]);
  });

  test("normalizes delegated native events back to React prop names", () => {
    expect(toEventPropNames("click")).toEqual(["onClick"]);
    expect(toEventPropNames("dblclick")).toEqual(["onDoubleClick"]);
    expect(toEventPropNames("focusin")).toEqual(["onFocus"]);
    expect(toEventPropNames("input")).toEqual(["onInput", "onChange"]);
    expect(toEventPropNames("drag")).toEqual(["onDrag"]);
  });

  test("classifies event priority without pulling in host reconciliation", () => {
    expect(getEventPriority("click")).toBe("discrete");
    expect(getEventPriority("drag")).toBe("continuous");
    expect(getEventPriority("mousemove")).toBe("continuous");
    expect(getEventPriority("animationend")).toBe("default");
  });

  test("keeps the base drag event explicitly registered in both event maps", () => {
    const source = readFileSync(
      join(process.cwd(), "packages/react-compat/src/events.ts"),
      "utf8",
    );

    expect(source).toContain('["onDrag", ["drag"]]');
    expect(source).toContain('["drag", ["onDrag"]]');
  });
});
