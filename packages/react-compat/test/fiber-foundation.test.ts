// @vitest-environment happy-dom

import { describe, expect, it } from "vitest";
import {
  createContext,
  createElement,
  createPortal,
  createRoot,
  forwardRef,
  lazy,
  memo,
  useContext,
} from "../src/index.js";
import { useState } from "../src/hooks.js";
import { NoFlags } from "../src/fiber-flags.js";
import {
  ContinuousEventLane,
  DiscreteEventLane,
  HydrationLane,
  NoLane,
  SyncLane,
  TransitionLane,
  getHighestPriorityLane,
  includesLane,
  mergeLanes,
  removeLanes,
} from "../src/fiber-lanes.js";
import {
  createFiberRoot,
  createHostRootFiber,
  createWorkInProgress,
} from "../src/fiber.js";
import { getFiberRootForContainer } from "../src/fiber-work-loop.js";
import {
  canRenderHostFiber,
  commitHostFiberRoot,
  renderHostFiberRoot,
} from "../src/fiber-host.js";

describe("fiber lanes", () => {
  it("selects the highest priority lane from a pending lane set", () => {
    const lanes = mergeLanes(
      TransitionLane,
      mergeLanes(ContinuousEventLane, SyncLane),
    );

    expect(getHighestPriorityLane(lanes)).toBe(SyncLane);
  });

  it("keeps hydration ahead of continuous and transition work", () => {
    const lanes = mergeLanes(
      TransitionLane,
      mergeLanes(ContinuousEventLane, HydrationLane),
    );

    expect(getHighestPriorityLane(lanes)).toBe(HydrationLane);
  });

  it("can merge, test, and remove lanes", () => {
    const lanes = mergeLanes(DiscreteEventLane, TransitionLane);

    expect(includesLane(lanes, DiscreteEventLane)).toBe(true);
    expect(includesLane(lanes, SyncLane)).toBe(false);
    expect(removeLanes(lanes, DiscreteEventLane)).toBe(TransitionLane);
    expect(getHighestPriorityLane(NoLane)).toBe(NoLane);
  });
});

describe("fiber model", () => {
  it("creates a FiberRoot with a host-root current fiber", () => {
    const container = document.createElement("div");
    const root = createFiberRoot(container);

    expect(root.container).toBe(container);
    expect(root.current.tag).toBe("host-root");
    expect(root.current.stateNode).toBe(root);
    expect(root.current.return).toBeUndefined();
    expect(root.pendingLanes).toBe(NoLane);
  });

  it("creates and reuses alternate work-in-progress fibers", () => {
    const current = createHostRootFiber();
    current.memoizedProps = { children: "old" };
    current.memoizedState = { value: 1 };

    const first = createWorkInProgress(current, { children: "next" });
    expect(first).not.toBe(current);
    expect(first.alternate).toBe(current);
    expect(current.alternate).toBe(first);
    expect(first.pendingProps).toEqual({ children: "next" });
    expect(first.memoizedProps).toEqual({ children: "old" });
    expect(first.memoizedState).toEqual({ value: 1 });

    first.flags = 1;
    const second = createWorkInProgress(current, { children: "again" });
    expect(second).toBe(first);
    expect(second.flags).toBe(NoFlags);
    expect(second.pendingProps).toEqual({ children: "again" });
  });
});

describe("fiber root work-loop adapter", () => {
  it("attaches a FiberRoot to createRoot containers", () => {
    const container = document.createElement("div");
    const root = createRoot(container);

    root.render("hello");

    const fiberRoot = getFiberRootForContainer(container);
    expect(fiberRoot).toBeDefined();
    expect(fiberRoot?.current.memoizedProps).toEqual({ children: "hello" });
    expect(fiberRoot?.pendingLanes).toBe(NoLane);
    expect(container.textContent).toBe("hello");
  });
});

describe("host fiber render and commit", () => {
  it("builds a host fiber tree without mutating the container until commit", () => {
    const container = document.createElement("div");
    const fiberRoot = createFiberRoot(container);
    const element = createElement("section", { id: "app" }, "Hello");

    expect(canRenderHostFiber(element)).toBe(true);

    const finishedWork = renderHostFiberRoot(fiberRoot, element);

    expect(container.innerHTML).toBe("");
    expect(finishedWork.child?.tag).toBe("host-component");
    expect(finishedWork.child?.type).toBe("section");

    commitHostFiberRoot(fiberRoot, finishedWork);

    expect(container.innerHTML).toBe('<section id="app">Hello</section>');
  });

  it("uses the host fiber path for host-only root renders", () => {
    const container = document.createElement("div");
    const root = createRoot(container);

    root.render(createElement("p", { className: "copy" }, "Fiber"));

    const fiberRoot = getFiberRootForContainer(container);
    expect(fiberRoot?.current.child?.tag).toBe("host-component");
    expect(fiberRoot?.current.child?.type).toBe("p");
    expect(container.innerHTML).toBe('<p class="copy">Fiber</p>');
  });
});

describe("function component fiber adapter", () => {
  it("uses Fiber identity for function component root renders", () => {
    function Message(props: { text: string }) {
      return createElement("strong", null, props.text);
    }

    const container = document.createElement("div");
    const root = createRoot(container);

    root.render(createElement(Message, { text: "Hello" }));

    const fiberRoot = getFiberRootForContainer(container);
    expect(fiberRoot?.current.child?.tag).toBe("function-component");
    expect(fiberRoot?.current.child?.type).toBe(Message);
    expect(fiberRoot?.current.child?.child?.tag).toBe("host-component");
    expect(container.innerHTML).toBe("<strong>Hello</strong>");
  });

  it("keeps hook state updates working through the function component Fiber path", () => {
    function Counter() {
      const [count, setCount] = useState(0);
      return createElement(
        "button",
        { onClick: () => setCount((value) => value + 1) },
        String(count),
      );
    }

    const container = document.createElement("div");
    const root = createRoot(container);

    root.render(createElement(Counter, null));
    container.querySelector("button")?.dispatchEvent(
      new MouseEvent("click", { bubbles: true }),
    );

    const fiberRoot = getFiberRootForContainer(container);
    expect(fiberRoot?.current.child?.tag).toBe("function-component");
    expect(container.innerHTML).toBe("<button>1</button>");
  });

  it("renders context providers returned from function component fibers", () => {
    const Theme = createContext("light");

    function Label() {
      return createElement("p", null, useContext(Theme));
    }

    function App() {
      return createElement(
        Theme.Provider,
        { value: "dark" },
        createElement(Label, null),
      );
    }

    const container = document.createElement("div");
    const root = createRoot(container);

    root.render(createElement(App, null));

    const fiberRoot = getFiberRootForContainer(container);
    expect(fiberRoot?.current.child?.tag).toBe("function-component");
    expect(fiberRoot?.current.child?.child?.tag).toBe("context-provider");
    expect(container.innerHTML).toBe("<p>dark</p>");
  });

  it("renders context consumers returned from function component fibers", () => {
    const Theme = createContext("light");

    function App() {
      return createElement(
        Theme.Provider,
        { value: "dark" },
        createElement(Theme.Consumer, null, (value) =>
          createElement("p", null, String(value)),
        ),
      );
    }

    const container = document.createElement("div");
    const root = createRoot(container);

    root.render(createElement(App, null));

    const fiberRoot = getFiberRootForContainer(container);
    expect(fiberRoot?.current.child?.child?.tag).toBe("context-provider");
    expect(fiberRoot?.current.child?.child?.child?.tag).toBe("context-consumer");
    expect(container.innerHTML).toBe("<p>dark</p>");
  });

  it("restores nested context provider values on the Fiber path", () => {
    const Theme = createContext("light");

    function Label() {
      return createElement("p", null, useContext(Theme));
    }

    function App() {
      return createElement(Theme.Provider, { value: "outer" }, [
        createElement(Label, { key: "outer" }),
        createElement(
          Theme.Provider,
          { key: "inner", value: "inner" },
          createElement(Label, null),
        ),
        createElement(Label, { key: "outer-again" }),
      ]);
    }

    const container = document.createElement("div");
    const root = createRoot(container);

    root.render(createElement(App, null));

    expect(container.innerHTML).toBe(
      "<p>outer</p><p>inner</p><p>outer</p>",
    );
  });

  it("renders forwardRef components returned from function component fibers", () => {
    const ref = { current: null as HTMLButtonElement | null };
    const Button = forwardRef<{ label: string }, HTMLButtonElement>(
      (props, forwardedRef) =>
        createElement("button", { ref: forwardedRef }, props.label),
    );

    function App() {
      return createElement(Button, { label: "Save", ref });
    }

    const container = document.createElement("div");
    const root = createRoot(container);

    root.render(createElement(App, null));

    const fiberRoot = getFiberRootForContainer(container);
    expect(fiberRoot?.current.child?.child?.tag).toBe("forward-ref");
    expect(container.innerHTML).toBe("<button>Save</button>");
    expect(ref.current).toBe(container.querySelector("button"));
  });

  it("renders memo components returned from function component fibers and skips equal props", () => {
    const calls: string[] = [];
    const Label = memo((props: { value: string }) => {
      calls.push(`render:${props.value}`);
      return createElement("span", null, props.value);
    });

    function App(props: { value: string }) {
      return createElement(Label, { value: props.value });
    }

    const container = document.createElement("div");
    const root = createRoot(container);

    root.render(createElement(App, { value: "A" }));
    const firstSpan = container.querySelector("span");
    root.render(createElement(App, { value: "A" }));
    root.render(createElement(App, { value: "B" }));

    const fiberRoot = getFiberRootForContainer(container);
    expect(fiberRoot?.current.child?.child?.tag).toBe("memo");
    expect(container.textContent).toBe("B");
    expect(container.querySelector("span")).toBe(firstSpan);
    expect(calls).toEqual(["render:A", "render:B"]);
  });

  it("renders lazy components returned from function component fibers after resolve", async () => {
    function Label(props: { value: string }) {
      return createElement("span", null, props.value);
    }

    const LazyLabel = lazy(() => Promise.resolve({ default: Label }));

    function App() {
      return createElement(LazyLabel, { value: "lazy" });
    }

    const container = document.createElement("div");
    const root = createRoot(container);

    root.render(createElement(App, null));
    expect(container.innerHTML).toBe("");

    await Promise.resolve();
    await Promise.resolve();

    const fiberRoot = getFiberRootForContainer(container);
    expect(fiberRoot?.current.child?.child?.tag).toBe("lazy");
    expect(container.innerHTML).toBe("<span>lazy</span>");
  });

  it("renders portals returned from function component fibers and clears them on next render", () => {
    const portalContainer = document.createElement("aside");

    function App() {
      return createPortal(
        createElement("strong", null, "Portal"),
        portalContainer,
      );
    }

    const container = document.createElement("div");
    const root = createRoot(container);

    root.render(createElement(App, null));

    const fiberRoot = getFiberRootForContainer(container);
    expect(fiberRoot?.current.child?.child?.tag).toBe("portal");
    expect(container.innerHTML).toBe("");
    expect(portalContainer.innerHTML).toBe("<strong>Portal</strong>");

    root.render(createElement("p", null, "Local"));

    expect(container.innerHTML).toBe("<p>Local</p>");
    expect(portalContainer.innerHTML).toBe("");
  });
});
