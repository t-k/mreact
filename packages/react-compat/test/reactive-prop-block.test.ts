// @vitest-environment happy-dom

import { describe, expect, test } from "vitest";
import { flushQueuedComputations } from "@reckona/mreact-reactive-core/internal";
import { bindText } from "@reckona/mreact-reactive-dom";
import { createElement, createRoot, flushSync, memo, useState } from "../src/index.js";
import { createReactiveDomBlock } from "../src/jsx-runtime.js";

describe("reactive-dom-block prop bridging", () => {
  test("updates bound text from new props without re-running the block render", () => {
    const previousNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    const container = document.createElement("div");
    let blockBuilds = 0;
    let rowRenders = 0;
    let setLabel: (value: string) => void = () => {};

    const Row = memo(
      (props: { label: string }) => {
        rowRenders += 1;
        return createReactiveDomBlock(
          (reactiveProps: { label: string }) => {
            blockBuilds += 1;
            const node = document.createElement("span");
            const text = document.createTextNode("");
            node.appendChild(text);
            const dispose = bindText(text, () => reactiveProps.label, { preserveInitial: false });
            return { node, dispose };
          },
          props,
        );
      },
      (a, b) => a.label === b.label,
    );

    function App() {
      const [label, setLabelState] = useState("a");
      setLabel = setLabelState;
      return createElement(Row, { label });
    }

    try {
      flushSync(() => {
        createRoot(container).render(createElement(App, null));
      });

      expect(container.textContent).toBe("a");
      expect(blockBuilds).toBe(1);
      expect(rowRenders).toBe(1);

      flushSync(() => setLabel("b"));
      flushQueuedComputations();

      // Text updated via the prop cell...
      expect(container.textContent).toBe("b");
      // ...without re-running the block's DOM-building render closure.
      expect(blockBuilds).toBe(1);
      // Row re-rendered (memo comparator failed) but produced only a cheap block element.
      expect(rowRenders).toBe(2);
    } finally {
      process.env.NODE_ENV = previousNodeEnv;
    }
  });

  test("a memo row whose props are unchanged neither re-renders nor rebuilds", () => {
    const previousNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    const container = document.createElement("div");
    let blockBuilds = 0;
    let rowRenders = 0;
    let bump: () => void = () => {};

    const Row = memo(
      (props: { label: string }) => {
        rowRenders += 1;
        return createReactiveDomBlock(
          (reactiveProps: { label: string }) => {
            blockBuilds += 1;
            const text = document.createTextNode("");
            const dispose = bindText(text, () => reactiveProps.label, { preserveInitial: false });
            return { node: text, dispose };
          },
          props,
        );
      },
      (a, b) => a.label === b.label,
    );

    function App() {
      const [, setTick] = useState(0);
      bump = () => setTick((value) => value + 1);
      return createElement(Row, { label: "stable" });
    }

    try {
      flushSync(() => {
        createRoot(container).render(createElement(App, null));
      });
      expect(container.textContent).toBe("stable");
      expect(rowRenders).toBe(1);

      flushSync(() => bump());

      expect(container.textContent).toBe("stable");
      expect(rowRenders).toBe(1); // memo bailout: Row not re-rendered
      expect(blockBuilds).toBe(1);
    } finally {
      process.env.NODE_ENV = previousNodeEnv;
    }
  });
});
