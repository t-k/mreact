import { describe, expect, test } from "vitest";
import {
  cloneElement,
  Component,
  createElement,
  Fragment,
  type ReactCompatNode,
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

  describe("select value", () => {
    const STATUSES = ["open", "in_progress", "done"];

    function options(): ReactCompatNode[] {
      return STATUSES.map((status) =>
        createElement("option", { key: status, value: status }, status),
      );
    }

    test("marks the matching option when the options come from a map", () => {
      expect(
        renderToString(() => createElement("select", { value: "in_progress" }, options())),
      ).toBe(
        '<select><option value="open">open</option>' +
          '<option value="in_progress" selected="">in_progress</option>' +
          '<option value="done">done</option></select>',
      );
    });

    test("keeps the selection across nested arrays, fragments, optgroups and child components", () => {
      function StatusOption({ status }: { status: string }) {
        return createElement("option", { value: status }, status);
      }

      const html = renderToString(() =>
        createElement(
          "select",
          { value: "done" },
          [[createElement("option", { key: "open", value: "open" }, "open")]],
          createElement(
            Fragment,
            null,
            createElement("option", { value: "in_progress" }, "in_progress"),
          ),
          createElement(
            "optgroup",
            { label: "closed" },
            createElement(StatusOption, { status: "done" }),
          ),
        ),
      );

      expect(html).toBe(
        '<select><option value="open">open</option>' +
          '<option value="in_progress">in_progress</option>' +
          '<optgroup label="closed"><option value="done" selected="">done</option></optgroup></select>',
      );
    });

    test("prefers value over defaultValue and replaces a stale option selected", () => {
      expect(
        renderToString(() =>
          createElement(
            "select",
            { value: "done", defaultValue: "open" },
            createElement("option", { value: "open", selected: true }, "open"),
            createElement("option", { value: "done" }, "done"),
          ),
        ),
      ).toBe(
        '<select><option value="open">open</option>' +
          '<option value="done" selected="">done</option></select>',
      );
    });

    test("falls back to defaultValue and then to the option's own selected", () => {
      expect(
        renderToString(() =>
          createElement(
            "select",
            { value: undefined, defaultValue: "done" },
            createElement("option", { value: "open" }, "open"),
            createElement("option", { value: "done" }, "done"),
          ),
        ),
      ).toBe(
        '<select><option value="open">open</option>' +
          '<option value="done" selected="">done</option></select>',
      );

      expect(
        renderToString(() =>
          createElement(
            "select",
            null,
            createElement("option", { value: "open" }, "open"),
            createElement("option", { value: "done", selected: true }, "done"),
          ),
        ),
      ).toBe(
        '<select><option value="open">open</option>' +
          '<option value="done" selected="">done</option></select>',
      );
    });

    test("compares option values as strings and reads text content when value is absent", () => {
      expect(
        renderToString(() =>
          createElement(
            "select",
            { value: 2 },
            createElement("option", { value: 1 }, "one"),
            createElement("option", { value: 2 }, "two"),
          ),
        ),
      ).toBe('<select><option value="1">one</option><option value="2" selected="">two</option></select>');

      expect(
        renderToString(() =>
          createElement(
            "select",
            { value: "done" },
            createElement("option", null, "open"),
            createElement("option", null, "done"),
          ),
        ),
      ).toBe("<select><option>open</option><option selected=\"\">done</option></select>");

      expect(
        renderToString(() =>
          createElement(
            "select",
            { value: "" },
            createElement("option", { value: "" }, "none"),
            createElement("option", { value: "open" }, "open"),
          ),
        ),
      ).toBe('<select><option value="" selected="">none</option><option value="open">open</option></select>');
    });

    test("marks nothing for null, undefined and non-matching values", () => {
      for (const value of [null, undefined, "missing"]) {
        expect(renderToString(() => createElement("select", { value }, options()))).not.toContain(
          "selected",
        );
      }
    });

    test("marks every option that matches a multiple select array value", () => {
      expect(
        renderToString(() =>
          createElement("select", { multiple: true, value: ["done", "open"] }, options()),
        ),
      ).toBe(
        '<select multiple=""><option value="open" selected="">open</option>' +
          '<option value="in_progress">in_progress</option>' +
          '<option value="done" selected="">done</option></select>',
      );

      expect(
        renderToString(() => createElement("select", { multiple: true, value: [] }, options())),
      ).not.toContain("selected");

      // A one-element array must not be string-joined into a scalar comparison.
      expect(
        renderToString(() =>
          createElement("select", { multiple: true, value: ["in_progress"] }, options()),
        ),
      ).toBe(
        '<select multiple=""><option value="open">open</option>' +
          '<option value="in_progress" selected="">in_progress</option>' +
          '<option value="done">done</option></select>',
      );
    });

    test("keeps sibling selects and options outside any select independent", () => {
      expect(
        renderToString(() =>
          createElement(
            "form",
            null,
            createElement("select", { key: "l", name: "left", value: "open" }, options()),
            createElement("select", { key: "r", name: "right", value: "done" }, options()),
            createElement("select", { key: "p", name: "plain" }, options()),
            createElement("option", { key: "o", value: "open" }, "outside"),
          ),
        ),
      ).toBe(
        "<form>" +
          '<select name="left"><option value="open" selected="">open</option>' +
          '<option value="in_progress">in_progress</option><option value="done">done</option></select>' +
          '<select name="right"><option value="open">open</option>' +
          '<option value="in_progress">in_progress</option><option value="done" selected="">done</option></select>' +
          '<select name="plain"><option value="open">open</option>' +
          '<option value="in_progress">in_progress</option><option value="done">done</option></select>' +
          '<option value="open">outside</option>' +
          "</form>",
      );
    });

    test("escapes selected option values and labels", () => {
      expect(
        renderToString(() =>
          createElement(
            "select",
            { value: '<script>"&' },
            createElement("option", { value: '<script>"&' }, '<script>"&'),
            createElement("option", { value: "safe" }, "safe"),
          ),
        ),
      ).toBe(
        '<select><option value="&lt;script&gt;&quot;&amp;" selected="">&lt;script&gt;&quot;&amp;</option>' +
          '<option value="safe">safe</option></select>',
      );
    });

    test("restores the enclosing selection after a nested select", () => {
      expect(
        renderToString(() =>
          createElement(
            "select",
            { value: "done" },
            createElement(
              "optgroup",
              { label: "nested" },
              createElement(
                "select",
                { value: "open" },
                createElement("option", { value: "open" }, "open"),
                createElement("option", { value: "done" }, "done"),
              ),
            ),
            createElement("option", { value: "done" }, "done"),
          ),
        ),
      ).toBe(
        '<select><optgroup label="nested">' +
          '<select><option value="open" selected="">open</option><option value="done">done</option></select>' +
          '</optgroup><option value="done" selected="">done</option></select>',
      );
    });

    test("isolates an independent renderToString call from an enclosing select", () => {
      let independent = "";

      function Nested() {
        independent = renderToString(() => createElement("option", { value: "b" }, "independent"));
        return createElement("option", { value: "b" }, "actual");
      }

      expect(
        renderToString(() => createElement("select", { value: "b" }, createElement(Nested))),
      ).toBe('<select><option value="b" selected="">actual</option></select>');
      expect(independent).toBe('<option value="b">independent</option>');
    });
  });
});
