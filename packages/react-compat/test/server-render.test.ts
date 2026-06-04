import { describe, expect, test } from "vitest";
import {
  cloneElement,
  Component,
  createElement,
  renderToString,
  useEffect,
  useMemo,
  useRef,
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

  test("isolates hook state for nested function components during server render", () => {
    function Child() {
      const ref = useRef("child");
      return createElement("span", null, ref.current);
    }

    function App() {
      useState("parent");
      return createElement(Child);
    }

    expect(renderToString(App)).toBe("<span>child</span>");
  });

  test("renders class component types without invoking them as functions", () => {
    class Panel extends Component<{ title: string }> {
      render() {
        return createElement("section", null, createElement("h2", null, this.props.title));
      }
    }

    expect(renderToString(Panel, { title: "Revenue" })).toBe(
      "<section><h2>Revenue</h2></section>",
    );
  });

  test("renders input default props as HTML initial state attributes", () => {
    function App() {
      return createElement(
        "form",
        null,
        createElement("input", { name: "user", defaultValue: "Ada" }),
        createElement("input", { type: "checkbox", defaultChecked: true }),
      );
    }

    expect(renderToString(App)).toBe(
      '<form><input name="user" value="Ada"/><input type="checkbox" checked=""/></form>',
    );
  });

  test("renders HTML void elements without explicit close tags", () => {
    function App() {
      return createElement(
        "p",
        null,
        createElement("strong", null, "Company"),
        createElement("br"),
        "Address",
        createElement("br"),
        "Email",
      );
    }

    expect(renderToString(App)).toBe(
      "<p><strong>Company</strong><br/>Address<br/>Email</p>",
    );
  });

  test("normalizes non-form JSX HTML attribute aliases", () => {
    function App() {
      return createElement(
        "main",
        null,
        createElement("meta", {
          httpEquiv: "refresh",
          content: "0;url=/next",
          charSet: "utf-8",
        }),
        createElement("a", { crossOrigin: "anonymous", tabIndex: 1 }, "link"),
      );
    }

    expect(renderToString(App)).toBe(
      '<main><meta http-equiv="refresh" content="0;url=/next" charset="utf-8"/><a crossorigin="anonymous" tabindex="1">link</a></main>',
    );
  });

  test("serializes React booleanish string attributes in HTML", () => {
    function App() {
      return createElement("div", {
        "aria-expanded": true,
        "aria-invalid": false,
        contentEditable: true,
        disabled: true,
        spellCheck: true,
      });
    }

    expect(renderToString(App)).toBe(
      '<div aria-expanded="true" aria-invalid="false" contenteditable="true" disabled="" spellcheck="true"></div>',
    );
  });

  test("serializes data boolean attributes as strings in HTML", () => {
    function App() {
      return createElement("div", {
        "data-enabled": true,
        "data-ready": false,
      });
    }

    expect(renderToString(App)).toBe(
      '<div data-enabled="true" data-ready="false"></div>',
    );
  });

  test("treats srcDoc as the dangerous srcdoc attribute alias", () => {
    function Dropped() {
      return createElement("iframe", { srcDoc: "<script>1</script>" });
    }

    function OptIn() {
      return createElement("iframe", { srcDoc: { __html: "<p>safe</p>" } });
    }

    expect(renderToString(Dropped)).toBe("<iframe></iframe>");
    expect(renderToString(OptIn)).toBe(
      '<iframe srcdoc="&lt;p&gt;safe&lt;/p&gt;"></iframe>',
    );
  });
});
