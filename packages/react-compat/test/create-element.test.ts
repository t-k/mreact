import { describe, expect, test } from "vitest";
import { Fragment, createElement } from "../src/index.js";
import { REACTIVE_TEXT_BINDING_META } from "../src/element.js";

describe("react-compat createElement", () => {
  test("creates a DOM element record with props and children", () => {
    const element = createElement("div", { id: "app" }, "Hello");

    expect(element).toEqual({
      $$typeof: Symbol.for("react.transitional.element"),
      type: "div",
      key: null,
      ref: null,
      props: {
        id: "app",
        children: "Hello",
      },
    });
  });

  test("extracts key and ref from props", () => {
    const ref = { current: null };
    const element = createElement("button", {
      key: "save",
      ref,
      type: "button",
    });

    expect(element.key).toBe("save");
    expect(element.ref).toBe(ref);
    expect(element.props).toEqual({ type: "button" });
  });

  test("ignores symbol props on createElement like React", () => {
    const symbol = Symbol("private");
    const element = createElement("button", {
      [symbol]: "hidden",
      type: "button",
    });

    expect(Object.getOwnPropertySymbols(element.props)).toEqual([]);
    expect(element.props).toEqual({ type: "button" });
  });

  test("preserves compiler reactive text binding metadata on createElement", () => {
    const binding = { value: "Save" };
    const element = createElement("button", {
      [REACTIVE_TEXT_BINDING_META]: binding,
      type: "button",
    });

    expect((element.props as Record<PropertyKey, unknown>)[REACTIVE_TEXT_BINDING_META])
      .toBe(binding);
  });

  test("keeps multiple children as an array", () => {
    const element = createElement(Fragment, null, "A", "B");

    expect(element.props.children).toEqual(["A", "B"]);
  });
});
