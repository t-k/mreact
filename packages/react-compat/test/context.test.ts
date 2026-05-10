// @vitest-environment happy-dom

import { describe, expect, test } from "vitest";
import {
  createContext,
  createElement,
  render,
  useContext,
} from "../src/index.js";

describe("react-compat context", () => {
  test("reads default context value", () => {
    const container = document.createElement("div");
    const Theme = createContext("light");

    function App() {
      return createElement("p", null, useContext(Theme));
    }

    render(createElement(App, null), container);

    expect(container.innerHTML).toBe("<p>light</p>");
  });

  test("context displayName can be assigned for diagnostics", () => {
    const Theme = createContext("light");

    Theme.displayName = "Theme";

    expect(Theme.displayName).toBe("Theme");
    expect(Theme.Provider.displayName).toBe("Theme.Provider");
    expect(Theme.Consumer.displayName).toBe("Theme.Consumer");
  });

  test("provider overrides value for subtree", () => {
    const container = document.createElement("div");
    const Theme = createContext("light");

    function Label() {
      return createElement("p", null, useContext(Theme));
    }

    render(
      createElement(
        Theme.Provider,
        { value: "dark" },
        createElement(Label, null),
      ),
      container,
    );

    expect(container.innerHTML).toBe("<p>dark</p>");
  });

  test("nested providers restore previous value", () => {
    const container = document.createElement("div");
    const Theme = createContext("light");

    function Label() {
      return createElement("p", null, useContext(Theme));
    }

    render(
      createElement(
        Theme.Provider,
        { value: "outer" },
        [
          createElement(Label, { key: "outer" }),
          createElement(
            Theme.Provider,
            { key: "inner", value: "inner" },
            createElement(Label, null),
          ),
          createElement(Label, { key: "outer-again" }),
        ],
      ),
      container,
    );

    expect(container.innerHTML).toBe(
      "<p>outer</p><p>inner</p><p>outer</p>",
    );
  });
});
