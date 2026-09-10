// @vitest-environment happy-dom
import { getHydrationScope } from "../src/hydration.js";
import { expect, test } from "vitest";
import { createElement, hydrateRoot, useState, useLayoutEffect } from "../src/index.js";

function Counter() {
  const [count, setCount] = useState(0);
  return createElement("button", { onClick: () => setCount((value) => value + 1) }, count);
}

test("sibling hydration ranges preserve nodes and own independent state and cleanup", () => {
  const container = document.createElement("main");
  container.innerHTML =
    "<p>native</p><!--mreact-h:start:a--><button>0</button><!--mreact-h:end:a--><!--mreact-h:start:b--><button>0</button><!--mreact-h:end:b-->";
  document.body.append(container);
  const native = container.firstChild;
  const [a, b] = Array.from(container.querySelectorAll("button"));
  const errors: Error[] = [];
  const first = hydrateRoot(container, createElement(Counter), {
    resumeId: "a",
    onRecoverableError: (error) => errors.push(error),
  });
  const second = hydrateRoot(container, createElement(Counter), {
    resumeId: "b",
    onRecoverableError: (error) => errors.push(error),
  });
  expect(Array.from(container.querySelectorAll("button"))).toEqual([a, b]);
  a!.click();
  expect(a!.textContent).toBe("1");
  expect(b!.textContent).toBe("0");
  first.unmount();
  first.unmount();
  b!.click();
  expect(b!.textContent).toBe("1");
  expect(container.querySelector("button")).toBe(b);
  expect(container.firstChild).toBe(native);
  expect(errors).toEqual([]);
  second.unmount();
  container.remove();
  expect(container.querySelectorAll("button")).toHaveLength(0);
});

test.each([
  "<p>native</p>",
  "<!--mreact-h:start:a--><p>native</p>",
  "<!--mreact-h:start:a--><!--mreact-h:start:a--><p>native</p><!--mreact-h:end:a-->",
  "<!--mreact-h:start:a--><!--mreact-h:start:b--><p>native</p><!--mreact-h:end:a--><!--mreact-h:end:b-->",
])("rejects invalid ranges without taking ownership of native DOM: %s", (html) => {
  const container = document.createElement("main");
  container.innerHTML = html;
  const nodes = Array.from(container.childNodes);
  expect(() => hydrateRoot(container, createElement(Counter), { resumeId: "a" })).toThrow(
    /range|marker/i,
  );
  expect(Array.from(container.childNodes)).toEqual(nodes);
});

test("unmounted range roots cannot acquire DOM again", () => {
  const container = document.createElement("main");
  container.innerHTML = "<!--mreact-h:start:a--><button>0</button><!--mreact-h:end:a-->";
  const root = hydrateRoot(container, createElement(Counter), { resumeId: "a" });
  root.unmount();
  expect(() => root.render(createElement(Counter))).toThrow(/unmounted/i);
  expect(container.querySelector("button")).toBeNull();
});

test("an unrelated incomplete streamed range does not block a complete target", () => {
  const container = document.createElement("main");
  container.innerHTML =
    "<!--mreact-h:start:a--><button>0</button><!--mreact-h:end:a--><!--mreact-h:start:%-->";
  const button = container.querySelector("button");
  const root = hydrateRoot(container, createElement(Counter), { resumeId: "a" });
  expect(container.querySelector("button")).toBe(button);
  root.unmount();
});

test("range unmount completes other cleanups and releases DOM when an effect cleanup throws", () => {
  const calls: string[] = [];
  function Throwing() {
    useLayoutEffect(
      () => () => {
        calls.push("first");
        throw new Error("cleanup failure");
      },
      [],
    );
    useLayoutEffect(
      () => () => {
        calls.push("second");
      },
      [],
    );
    return createElement("button", null, "0");
  }
  const container = document.createElement("main");
  container.innerHTML =
    "<p>native</p><!--mreact-h:start:a--><button>0</button><!--mreact-h:end:a-->";
  const root = hydrateRoot(container, createElement(Throwing), { resumeId: "a" });
  expect(() => root.unmount()).toThrow("cleanup failure");
  expect(calls).toEqual(["first", "second"]);
  expect(container.querySelector("button")).toBeNull();
  expect(container.querySelector("p")?.textContent).toBe("native");
  root.unmount();
  expect(calls).toEqual(["first", "second"]);
});

test("a range can be hydrated again after unmount with fresh state", () => {
  const container = document.createElement("main");
  container.innerHTML = "<!--mreact-h:start:a--><button>0</button><!--mreact-h:end:a-->";
  document.body.append(container);
  const root = hydrateRoot(container, createElement(Counter), { resumeId: "a" });
  container.querySelector("button")!.click();
  expect(container.querySelector("button")!.textContent).toBe("1");
  root.unmount();
  const button = document.createElement("button");
  button.textContent = "0";
  container.insertBefore(button, container.lastChild);
  const next = hydrateRoot(container, createElement(Counter), { resumeId: "a" });
  expect(container.querySelector("button")).toBe(button);
  button.click();
  expect(button.textContent).toBe("1");
  next.unmount();
  container.remove();
});

test("empty and multi-node ranges update without taking native siblings", () => {
  const container = document.createElement("main");
  container.innerHTML =
    "<p>native</p><!--mreact-h:start:a--><!--mreact-h:end:a--><!--mreact-h:start:b--><button>0</button><!--mreact-h:end:b-->";
  document.body.append(container);
  const native = container.firstChild;
  const button = container.querySelector("button");
  const first = hydrateRoot(container, null, { resumeId: "a" });
  const second = hydrateRoot(container, createElement(Counter), { resumeId: "b" });
  first.render([createElement("span", null, "one"), createElement("span", null, "two")]);
  expect(container.querySelectorAll("span")).toHaveLength(2);
  expect(container.querySelector("button")).toBe(button);
  second.unmount();
  first.render(null);
  first.render(createElement("strong", null, "again"));
  expect(container.querySelector("strong")?.textContent).toBe("again");
  expect(container.firstChild).toBe(native);
  first.unmount();
  container.remove();
});

test("mismatch recovery stays inside one range", () => {
  const container = document.createElement("main");
  container.innerHTML =
    '<input value="native"><!--mreact-h:start:a--><i>wrong</i><!--mreact-h:end:a--><!--mreact-h:start:b--><button>0</button><!--mreact-h:end:b-->';
  const input = container.firstChild;
  const button = container.querySelector("button");
  const recoveries: Error[] = [];
  const first = hydrateRoot(container, createElement(Counter), {
    resumeId: "a",
    onRecoverableError: (error) => recoveries.push(error),
  });
  expect(recoveries.length).toBeGreaterThan(0);
  expect(container.firstChild).toBe(input);
  expect(container.querySelectorAll("button")[1]).toBe(button);
  const second = hydrateRoot(container, createElement(Counter), { resumeId: "b" });
  first.unmount();
  expect(container.querySelector("button")).toBe(button);
  second.unmount();
});

test("failed hydration releases committed effects and preserves native siblings", () => {
  const calls: string[] = [];
  function Failing() {
    useLayoutEffect(
      () => () => {
        calls.push("cleanup");
      },
      [],
    );
    useLayoutEffect(() => {
      throw new Error("setup failure");
    }, []);
    return createElement("button", null, "0");
  }
  const container = document.createElement("main");
  container.innerHTML =
    "<p>native</p><!--mreact-h:start:a--><button>0</button><!--mreact-h:end:a-->";
  const native = container.firstChild;
  expect(() => hydrateRoot(container, createElement(Failing), { resumeId: "a" })).toThrow(
    "setup failure",
  );
  expect(calls).toEqual(["cleanup"]);
  expect(container.firstChild).toBe(native);
});

test("DevTools keeps sibling range roots and host lookups independent", () => {
  const globals = globalThis as unknown as Record<string, unknown>;
  const previous = globals.__REACT_DEVTOOLS_GLOBAL_HOOK__;
  const commits: unknown[] = [];
  let renderer: { findFiberByHostInstance(node: object): unknown } | undefined;
  globals.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
    supportsFiber: true,
    inject(value: typeof renderer) {
      renderer = value;
      return 1;
    },
    onCommitFiberRoot(_id: number, root: unknown) {
      commits.push(root);
    },
    onCommitFiberUnmount() {},
  };
  try {
    const container = document.createElement("main");
    container.innerHTML =
      "<!--mreact-h:start:a--><button>0</button><!--mreact-h:end:a--><!--mreact-h:start:b--><button>0</button><!--mreact-h:end:b-->";
    const [a, b] = Array.from(container.querySelectorAll("button"));
    const first = hydrateRoot(container, createElement(Counter), { resumeId: "a" });
    const second = hydrateRoot(container, createElement(Counter), { resumeId: "b" });
    expect(commits[0]).not.toBe(commits[1]);
    expect(renderer?.findFiberByHostInstance(a!)).not.toBeNull();
    expect(renderer?.findFiberByHostInstance(b!)).not.toBeNull();
    first.unmount();
    expect(renderer?.findFiberByHostInstance(a!)).toBeNull();
    expect(renderer?.findFiberByHostInstance(b!)).not.toBeNull();
    second.unmount();
  } finally {
    if (previous === undefined) delete globals.__REACT_DEVTOOLS_GLOBAL_HOOK__;
    else globals.__REACT_DEVTOOLS_GLOBAL_HOOK__ = previous;
  }
});

test.each([
  "<!--mreact-h:start:a--><b>owned</b><!--mreact-h:end:a--><!--mreact-h:start:a-->",
  "<!--mreact-h:start:a--><b>owned</b><!--mreact-h:end:a--><!--mreact-h:end:a-->",
  "<!--mreact-h:end:a--><b>native</b><!--mreact-h:start:a-->",
  "<div><!--mreact-h:start:a--></div><div><!--mreact-h:end:a--></div>",
  "<!--mreact-h:start:a--><!--mreact-h:start:b--><!--mreact-h:end:c--><!--mreact-h:end:a-->",
])("scope validation rejects malformed ownership before hydration: %s", (html) => {
  const container = document.createElement("main");
  container.innerHTML = html;
  expect(() => getHydrationScope(container, "a")).toThrow(/range markers/);
  expect(container.innerHTML).toBe(html);
});

test("valid nested ranges include neutral comments and exact outer anchors", () => {
  const container = document.createElement("main");
  container.innerHTML =
    "<p>native</p><!--mreact-h:start:a--><!--neutral--><!--mreact-h:start:b--><b>nested</b><!--mreact-h:end:b--><!--mreact-h:end:a--><p>after</p>";
  const scope = getHydrationScope(container, "a");
  expect(scope.parent).toBe(container);
  expect(scope.before).toBe(container.childNodes[1]);
  expect(scope.after).toBe(container.childNodes[6]);
  expect(scope.previousNodes).toEqual(Array.from(container.childNodes).slice(2, 6));
  const whole = getHydrationScope(container, undefined);
  expect(whole.previousNodes).toEqual(Array.from(container.childNodes));
  expect(whole.before).toBeNull();
  expect(whole.after).toBeNull();
});

test("repeated unmount leaves a later owner's nodes inside retained anchors", () => {
  const container = document.createElement("main");
  container.innerHTML = "<!--mreact-h:start:a--><button>0</button><!--mreact-h:end:a-->";
  const root = hydrateRoot(container, createElement(Counter), { resumeId: "a" });
  root.unmount();
  const foreign = document.createElement("p");
  container.insertBefore(foreign, container.lastChild);
  root.unmount();
  expect(foreign.parentNode).toBe(container);
});

test.each([
  [false, false],
  [false, true],
  [true, false],
  [true, true],
])(
  "consumed adjacent roots preserve ownership (hydrateReverse=%s, unmountReverse=%s)",
  (hydrateReverse, unmountReverse) => {
    const container = document.createElement("main");
    container.innerHTML =
      "<p>before</p><!--mreact-h:start:a--><button>0</button><!--mreact-h:end:a--><!--mreact-h:start:b--><button>0</button><!--mreact-h:end:b--><p>after</p>";
    const native = Array.from(container.querySelectorAll("p"));
    const buttons = Array.from(container.querySelectorAll("button"));
    const roots = new Map<string, ReturnType<typeof hydrateRoot>>();
    for (const id of hydrateReverse ? ["b", "a"] : ["a", "b"])
      roots.set(
        id,
        hydrateRoot(container, createElement(Counter), {
          resumeId: id,
          consumeResumeMarkers: true,
        }),
      );
    expect(container.innerHTML).toBe(
      "<p>before</p><button>0</button><button>0</button><p>after</p>",
    );
    roots.get(unmountReverse ? "b" : "a")!.unmount();
    const remaining = buttons[unmountReverse ? 0 : 1]!;
    expect(remaining.parentNode).toBe(container);
    remaining.click();
    expect(remaining.textContent).toBe("1");
    roots.get(unmountReverse ? "a" : "b")!.unmount();
    expect(Array.from(container.childNodes)).toEqual(native);
  },
);

test.each([true, false])(
  "empty consumed roots preserve structural updates beside siblings (siblingConsumes=%s)",
  (siblingConsumes) => {
    const container = document.createElement("main");
    container.innerHTML =
      "<p>before</p><!--mreact-h:start:a--><!--mreact-h:end:a--><!--mreact-h:start:b--><button>0</button><!--mreact-h:end:b--><p>after</p>";
    const native = Array.from(container.querySelectorAll("p"));
    const first = hydrateRoot(container, null, { resumeId: "a", consumeResumeMarkers: true });
    const second = hydrateRoot(container, createElement(Counter), {
      resumeId: "b",
      consumeResumeMarkers: siblingConsumes,
    });
    const button = container.querySelector("button");
    first.render([createElement("span", null, "one"), createElement("span", null, "two")]);
    expect(Array.from(container.children).map((node) => node.textContent)).toEqual([
      "before",
      "one",
      "two",
      "0",
      "after",
    ]);
    expect(container.querySelector("button")).toBe(button);
    first.render(null);
    second.unmount();
    first.render(createElement("strong", null, "again"));
    expect(Array.from(container.children).map((node) => node.textContent)).toEqual([
      "before",
      "again",
      "after",
    ]);
    first.unmount();
    expect(Array.from(container.querySelectorAll("p"))).toEqual(native);
    expect(
      Array.from(container.childNodes).filter((node) => node.nodeType !== Node.COMMENT_NODE),
    ).toEqual(native);
  },
);

test("failed consumed hydration restores original markers for retry", () => {
  const container = document.createElement("main");
  container.innerHTML =
    "<p>before</p><!--mreact-h:start:a--><span>original</span><!--mreact-h:end:a--><!--mreact-h:start:b--><button>0</button><!--mreact-h:end:b--><p>after</p>";
  const second = hydrateRoot(container, createElement(Counter), {
    resumeId: "b",
    consumeResumeMarkers: true,
  });
  const original = Array.from(container.childNodes);
  function Failing() {
    useLayoutEffect(() => {
      throw new Error("setup failure");
    }, []);
    return createElement("span", null, "original");
  }
  expect(() =>
    hydrateRoot(container, createElement(Failing), { resumeId: "a", consumeResumeMarkers: true }),
  ).toThrow("setup failure");
  expect(Array.from(container.childNodes)).toEqual(original);
  const retry = hydrateRoot(container, createElement("span", null, "original"), {
    resumeId: "a",
    consumeResumeMarkers: true,
  });
  retry.unmount();
  container.querySelector("button")!.click();
  expect(container.querySelector("button")!.textContent).toBe("1");
  second.unmount();
  expect(container.childNodes).toHaveLength(2);
});

test.each([new Error("first ref"), null, undefined])(
  "throwing ref cleanup releases all refs and preserves the first error: %s",
  (failure) => {
    const container = document.createElement("main");
    container.innerHTML =
      "<p>before</p><!--mreact-h:start:a--><span>A</span><span>B</span><span>C</span><!--mreact-h:end:a--><p>after</p>";
    const calls: string[] = [];
    const objectRef = { current: null as Element | null };
    const root = hydrateRoot(
      container,
      [
        createElement(
          "span",
          {
            ref: () => () => {
              calls.push("A");
              throw failure;
            },
          },
          "A",
        ),
        createElement(
          "span",
          {
            ref: () => () => {
              calls.push("B");
              throw new Error("second ref");
            },
          },
          "B",
        ),
        createElement("span", { ref: objectRef }, "C"),
      ],
      { resumeId: "a", consumeResumeMarkers: true },
    );
    let caught = false;
    try {
      root.unmount();
    } catch (error) {
      caught = true;
      expect(error).toBe(failure);
    }
    expect(caught).toBe(true);
    expect(calls).toEqual(["A", "B"]);
    expect(objectRef.current).toBeNull();
    expect(container.innerHTML).toBe("<p>before</p><p>after</p>");
    expect(container.childNodes).toHaveLength(2);
    root.unmount();
    expect(calls).toEqual(["A", "B"]);
  },
);

test("consume option without a resume range preserves whole-root behavior and original setup errors", () => {
  const container = document.createElement("main");
  container.innerHTML = "<button>0</button>";
  const original = container.firstChild;
  const root = hydrateRoot(container, createElement(Counter), { consumeResumeMarkers: true });
  expect(container.firstChild).toBe(original);
  root.unmount();
  expect(container.childNodes).toHaveLength(0);
  const failure = new Error("whole-root setup");
  function Failing() {
    useLayoutEffect(() => {
      throw failure;
    }, []);
    return createElement("span", null, "original");
  }
  container.innerHTML = "<span>original</span>";
  expect(() =>
    hydrateRoot(container, createElement(Failing), { consumeResumeMarkers: true }),
  ).toThrow(failure);
  expect(container.innerHTML).toBe("<span>original</span>");
});

test("an effect cleanup error stays first while later ref errors and refs are processed", () => {
  const container = document.createElement("main");
  container.innerHTML = "<!--mreact-h:start:a--><span>A</span><!--mreact-h:end:a-->";
  const calls: string[] = [];
  function FailingCleanups() {
    useLayoutEffect(
      () => () => {
        calls.push("effect");
        throw new Error("effect failure");
      },
      [],
    );
    return createElement(
      "span",
      {
        ref: () => () => {
          calls.push("ref");
          throw new Error("ref failure");
        },
      },
      "A",
    );
  }
  const root = hydrateRoot(container, createElement(FailingCleanups), {
    resumeId: "a",
    consumeResumeMarkers: true,
  });
  expect(() => root.unmount()).toThrow("effect failure");
  expect(calls).toEqual(["effect", "ref"]);
  expect(container.childNodes).toHaveLength(0);
  root.unmount();
  expect(calls).toEqual(["effect", "ref"]);
});
