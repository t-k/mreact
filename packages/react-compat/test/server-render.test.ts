import { describe, expect, test } from "vitest";
import {
  cloneElement,
  createElement,
  renderToString,
  useEffect,
  useMemo,
  useState,
} from "../src/index.js";

describe("react-compat server render", () => {
  test("runs hooks while rendering a string component", () => {
    function App() {
      const [count] = useState(0);
      const label = useMemo(() => `count:${count}`, [count]);
      return `<p>${label}</p>`;
    }

    expect(renderToString(App)).toBe("<p>count:0</p>");
  });

  test("does not flush effects during server render", () => {
    let effects = 0;

    function App() {
      useEffect(() => {
        effects += 1;
      }, []);
      return "<p>server</p>";
    }

    expect(renderToString(App)).toBe("<p>server</p>");
    expect(effects).toBe(0);
  });

  test("renders ReactCompatNode returns to an HTML string", () => {
    function Label(props: { name: string }) {
      const label = useMemo(() => props.name.toUpperCase(), [props.name]);
      return createElement("strong", { id: "name" }, label);
    }

    function App() {
      const child = createElement(Label, { name: "<Ada>" });
      return [
        "Hello ",
        cloneElement(child, { name: "Ada" }),
        null,
        false,
        2,
      ];
    }

    expect(renderToString(App)).toBe('Hello <strong id="name">ADA</strong>2');
  });
});
