// @vitest-environment happy-dom
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
