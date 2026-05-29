import { describe, expect, test } from "vitest";
import { Fragment, createElement } from "../src/index.js";

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

  test("keeps multiple children as an array", () => {
    const element = createElement(Fragment, null, "A", "B");

    expect(element.props.children).toEqual(["A", "B"]);
  });
});
