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
import { __serverRenderAttributeCacheForTesting } from "../src/server-render.js";

describe("react-compat server render", () => {
  test("renders own data-property dangerouslySetInnerHTML payloads with extra keys", () => {
    function App() {
      return createElement("article", {
        dangerouslySetInnerHTML: { __html: "<strong>trusted</strong>", revision: 2 },
      });
    }

    expect(renderToString(App)).toBe("<article><strong>trusted</strong></article>");
  });

  test("rejects accessor and inherited dangerouslySetInnerHTML payloads", () => {
    const getterPayload = Object.defineProperty({}, "__html", {
      get: () => "<strong>getter</strong>",
    });

    expect(
      renderToString(() => createElement("div", { dangerouslySetInnerHTML: getterPayload })),
    ).toBe("<div></div>");
    expect(
      renderToString(() =>
        createElement("div", {
          dangerouslySetInnerHTML: Object.create({ __html: "<strong>inherited</strong>" }),
        }),
      ),
    ).toBe("<div></div>");
  });
  test("strips unsafe meta refresh content on meta and non-meta hosts alike", () => {
    function App() {
      return createElement(
        "main",
        null,
        createElement("meta", {
          httpEquiv: "refresh",
          content: "0;url=javascript:alert(1)",
        }),
        createElement("div", {
          "http-equiv": "refresh",
          content: "0;url=javascript:alert(1)",
          id: "x",
        }),
      );
    }

    expect(renderToString(App)).toBe(
      '<main><meta http-equiv="refresh"/><div http-equiv="refresh" id="x"></div></main>',
    );
  });

  test("keeps attribute serialization order and skips internal or event props", () => {
    function App() {
      return createElement(
        "section",
        {
          id: "panel",
          className: "card",
          onClick: () => undefined,
          onpointerdown: () => undefined,
          "data-state": "open",
          "aria-hidden": false,
          tabIndex: 0,
          style: { backgroundColor: "red", "--x": "1" },
          hidden: true,
          title: 'He said "hi" & left',
        },
        "body",
      );
    }

    expect(renderToString(App)).toBe(
      '<section id="panel" class="card" data-state="open" aria-hidden="false" tabindex="0" style="background-color:red;--x:1" hidden="" title="He said &quot;hi&quot; &amp; left">body</section>',
    );
  });

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
      return ["Hello ", cloneElement(child, { name: "Ada" }), null, false, 2];
    }

    expect(renderToString(App)).toBe('Hello <strong id="name">ADA</strong>2');
  });

  test("separates adjacent text nodes without changing visible text", () => {
    function App() {
      return createElement("p", null, "Hello, ", "Ada", 0);
    }

    expect(renderToString(App)).toBe("<p>Hello, <!-- -->Ada<!-- -->0</p>");
  });

  test("omits an empty string child", () => {
    expect(renderToString(() => createElement("p", null, ""))).toBe("<p></p>");
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

  test("throws an explanatory error when renderToString encounters Suspense work", () => {
    function App(): never {
      throw Promise.resolve("pending");
    }

    expect(() => renderToString(App)).toThrow(/renderToString does not support Suspense/i);
  });

  test("renders class component types without invoking them as functions", () => {
    class Panel extends Component<{ title: string }> {
      render() {
        return createElement("section", null, createElement("h2", null, this.props.title));
      }
    }

    expect(renderToString(Panel, { title: "Revenue" })).toBe("<section><h2>Revenue</h2></section>");
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

    expect(renderToString(App)).toBe("<p><strong>Company</strong><br/>Address<br/>Email</p>");
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
        autoCapitalize: false,
        contentEditable: true,
        disabled: true,
        spellCheck: true,
        translate: false,
      });
    }

    expect(renderToString(App)).toBe(
      '<div aria-expanded="true" aria-invalid="false" autocapitalize="false" contenteditable="true" disabled="" spellcheck="true" translate="false"></div>',
    );
  });

  test("serializes data boolean attributes as strings in HTML", () => {
    function App() {
      return createElement("div", {
        "data-enabled": true,
        "data-ready": false,
      });
    }

    expect(renderToString(App)).toBe('<div data-enabled="true" data-ready="false"></div>');
  });

  test("serializes readOnly with React DOM server casing", () => {
    function App() {
      return createElement("input", { readOnly: true });
    }

    expect(renderToString(App)).toBe('<input readOnly=""/>');
  });

  test("treats srcDoc as the dangerous srcdoc attribute alias", () => {
    function Dropped() {
      return createElement("iframe", { srcDoc: "<script>1</script>" });
    }

    function OptIn() {
      return createElement("iframe", { srcDoc: { __html: "<p>safe</p>", revision: 2 } });
    }

    function Getter() {
      return createElement("iframe", {
        srcDoc: Object.defineProperty({}, "__html", { get: () => "<p>getter</p>" }),
      });
    }

    expect(renderToString(Dropped)).toBe("<iframe></iframe>");
    expect(renderToString(OptIn)).toBe('<iframe srcdoc="&lt;p&gt;safe&lt;/p&gt;"></iframe>');
    expect(renderToString(Getter)).toBe("<iframe></iframe>");
  });

  test("does not emit string event handler attributes", () => {
    function App() {
      return createElement("img", {
        onClick: "alert(1)",
        onerror: "alert(2)",
        alt: "x",
      } as Record<string, unknown>);
    }

    const html = renderToString(App);
    expect(html).toBe('<img alt="x"/>');
    expect(html).not.toMatch(/\son(?:click|error)=/i);
  });

  test("caches server attribute name classification without caching URL safety values", () => {
    __serverRenderAttributeCacheForTesting.clear();

    function App() {
      return createElement(
        "main",
        null,
        Array.from({ length: 20 }, (_, index) =>
          createElement(
            "a",
            {
              key: index,
              className: "row",
              "data-active": index % 2 === 0,
              href: index % 2 === 0 ? `/safe-${index}` : "javascript:alert(1)",
            },
            `row ${index}`,
          ),
        ),
      );
    }

    const html = renderToString(App);
    expect(html).toContain('<a class="row" data-active="true" href="/safe-0">row 0</a>');
    expect(html).not.toMatch(/javascript:/i);
    expect(__serverRenderAttributeCacheForTesting.missCount()).toBe(4);
    expect(__serverRenderAttributeCacheForTesting.size()).toBe(4);
  });
});
