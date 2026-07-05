import { describe, expect, test } from "vitest";
import { isEventLikePropName, isReactEventHandlerPropName } from "../src/dom-prop-names.js";

describe("DOM prop name classifiers", () => {
  test("classifies event-like names consistently", () => {
    expect(isEventLikePropName("on")).toBe(true);
    expect(isEventLikePropName("once")).toBe(true);
    expect(isEventLikePropName("onclick")).toBe(true);
    expect(isEventLikePropName("onClick")).toBe(true);
    expect(isEventLikePropName("ONCLICK")).toBe(true);
    expect(isEventLikePropName("data-on")).toBe(false);
  });

  test("classifies React-style handler props separately", () => {
    expect(isReactEventHandlerPropName("on")).toBe(false);
    expect(isReactEventHandlerPropName("once")).toBe(false);
    expect(isReactEventHandlerPropName("onclick")).toBe(false);
    expect(isReactEventHandlerPropName("onClick")).toBe(true);
    expect(isReactEventHandlerPropName("ONCLICK")).toBe(false);
  });
});
