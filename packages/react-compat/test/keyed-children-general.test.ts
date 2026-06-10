// @vitest-environment happy-dom

import { afterEach, describe, expect, test, vi } from "vitest";
import {
  Fragment,
  createElement,
  createRoot,
  flushSync,
  useState,
} from "../src/index.js";

// Pins React semantics for keyed children across the general (non-benchmark
// shaped) reuse path: arbitrary host props, component rows with hooks state,
// ref ordering, controlled inputs, and fragment rows.

afterEach(() => {
  vi.unstubAllEnvs();
});

interface RowData {
  id: string;
  label: string;
  selected: boolean;
}

function rowsOf(...labels: string[]): RowData[] {
  return labels.map((label, index) => ({
    id: label,
    label: `${label}:${index}`,
    selected: false,
  }));
}

describe("keyed children general reuse", () => {
  test("reuses keyed host rows with arbitrary props and updates only changed rows", () => {
    vi.stubEnv("NODE_ENV", "production");
    const container = document.createElement("div");
    const root = createRoot(container);
    let setRows: (rows: RowData[]) => void = () => undefined;

    function App() {
      const [rows, set] = useState<RowData[]>(
        rowsOf("a", "b", "c"),
      );
      setRows = set;
      return createElement(
        "ul",
        null,
        rows.map((row) =>
          createElement(
            "li",
            {
              key: row.id,
              id: `row-${row.id}`,
              "aria-label": row.label,
              className: row.selected ? "active" : "plain",
              onClick: () => undefined,
            },
            row.label,
          ),
        ),
      );
    }

    flushSync(() => {
      root.render(createElement(App));
    });

    const initialNodes = Array.from(container.querySelectorAll("li"));
    expect(initialNodes).toHaveLength(3);
    expect(initialNodes[1]?.getAttribute("aria-label")).toBe("b:1");

    const next = rowsOf("a", "b", "c");
    const selected = next[1] as RowData;
    selected.selected = true;
    selected.label = "b:selected";
    flushSync(() => {
      setRows(next);
    });

    const updatedNodes = Array.from(container.querySelectorAll("li"));
    // Same DOM node identity for every row: in-place keyed reuse.
    expect(updatedNodes[0]).toBe(initialNodes[0]);
    expect(updatedNodes[1]).toBe(initialNodes[1]);
    expect(updatedNodes[2]).toBe(initialNodes[2]);
    expect(updatedNodes[1]?.className).toBe("active");
    expect(updatedNodes[1]?.getAttribute("aria-label")).toBe("b:selected");
    expect(updatedNodes[1]?.textContent).toBe("b:selected");
    expect(updatedNodes[0]?.className).toBe("plain");

    root.unmount();
  });

  test("preserves hooks state in component rows across keyed reorder", () => {
    vi.stubEnv("NODE_ENV", "production");
    const container = document.createElement("div");
    const root = createRoot(container);
    let setOrder: (order: string[]) => void = () => undefined;
    const bumpById = new Map<string, () => void>();

    function Row({ id }: { id: string }) {
      const [count, setCount] = useState(0);
      bumpById.set(id, () => setCount((value) => value + 1));
      return createElement("li", { id: `row-${id}` }, `${id}:${count}`);
    }

    function App() {
      const [order, set] = useState(["a", "b", "c"]);
      setOrder = set;
      return createElement(
        "ul",
        null,
        order.map((id) => createElement(Row, { key: id, id })),
      );
    }

    flushSync(() => {
      root.render(createElement(App));
    });
    flushSync(() => {
      bumpById.get("c")?.();
    });
    expect(container.textContent).toBe("a:0b:0c:1");

    flushSync(() => {
      setOrder(["c", "a", "b"]);
    });

    // Hook state must travel with the keyed component row.
    expect(container.textContent).toBe("c:1a:0b:0");

    root.unmount();
  });

  test("detaches and reattaches callback refs in order on keyed reorder", () => {
    vi.stubEnv("NODE_ENV", "production");
    const container = document.createElement("div");
    const root = createRoot(container);
    const refLog: string[] = [];
    let setOrder: (order: string[]) => void = () => undefined;

    function App() {
      const [order, set] = useState(["a", "b"]);
      setOrder = set;
      return createElement(
        "ul",
        null,
        order.map((id) =>
          createElement("li", {
            key: id,
            ref: (node: Element | null) => {
              refLog.push(node === null ? `detach:${id}` : `attach:${id}`);
            },
            "data-id": id,
          }),
        ),
      );
    }

    flushSync(() => {
      root.render(createElement(App));
    });
    expect(refLog).toEqual(["attach:a", "attach:b"]);

    refLog.length = 0;
    flushSync(() => {
      setOrder(["b", "a"]);
    });

    // Rows with refs must keep DOM identity per key after reorder. The ref
    // callbacks have fresh identity each render, so React semantics require a
    // detach before each reattach and never a dangling detach.
    const items = Array.from(container.querySelectorAll("li"));
    expect(items.map((item) => item.getAttribute("data-id"))).toEqual(["b", "a"]);
    for (const id of ["a", "b"]) {
      const detachAt = refLog.indexOf(`detach:${id}`);
      const attachAt = refLog.lastIndexOf(`attach:${id}`);
      expect(detachAt).toBeGreaterThanOrEqual(0);
      expect(attachAt).toBeGreaterThan(detachAt);
    }

    refLog.length = 0;
    root.unmount();
    expect(refLog.sort()).toEqual(["detach:a", "detach:b"]);
  });

  test("keeps controlled input value when a sibling keyed row updates", () => {
    vi.stubEnv("NODE_ENV", "production");
    const container = document.createElement("div");
    const root = createRoot(container);
    let setLabel: (label: string) => void = () => undefined;

    function App() {
      const [label, set] = useState("first");
      const [value, setValue] = useState("typed");
      setLabel = set;
      return createElement(
        "ul",
        null,
        createElement(
          "li",
          { key: "input-row" },
          createElement("input", {
            value,
            onChange: (event: { target: { value: string } }) =>
              setValue(event.target.value),
          }),
        ),
        createElement("li", { key: "label-row" }, label),
      );
    }

    flushSync(() => {
      root.render(createElement(App));
    });

    const input = container.querySelector("input") as HTMLInputElement;
    expect(input.value).toBe("typed");

    flushSync(() => {
      setLabel("second");
    });

    expect(container.querySelector("input")).toBe(input);
    expect(input.value).toBe("typed");
    expect(container.textContent).toContain("second");

    root.unmount();
  });

  test("renders keyed fragment rows through the generic reconcile path", () => {
    vi.stubEnv("NODE_ENV", "production");
    const container = document.createElement("div");
    const root = createRoot(container);
    let setOrder: (order: string[]) => void = () => undefined;

    function App() {
      const [order, set] = useState(["a", "b"]);
      setOrder = set;
      return createElement(
        "ul",
        null,
        order.map((id) =>
          createElement(
            Fragment,
            { key: id },
            createElement("li", null, `${id}-1`),
            createElement("li", null, `${id}-2`),
          ),
        ),
      );
    }

    flushSync(() => {
      root.render(createElement(App));
    });
    expect(container.textContent).toBe("a-1a-2b-1b-2");

    flushSync(() => {
      setOrder(["b", "a"]);
    });
    expect(container.textContent).toBe("b-1b-2a-1a-2");

    root.unmount();
  });

  test("reuses keyed text rows without data-key props in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    const container = document.createElement("div");
    const root = createRoot(container);
    let setItems: (items: { id: number; text: string }[]) => void = () => undefined;

    function App() {
      const [items, set] = useState([
        { id: 1, text: "one" },
        { id: 2, text: "two" },
      ]);
      setItems = set;
      return createElement(
        "ul",
        null,
        items.map((item) =>
          createElement("li", { key: item.id, title: item.text }, item.text),
        ),
      );
    }

    flushSync(() => {
      root.render(createElement(App));
    });
    const first = Array.from(container.querySelectorAll("li"));

    flushSync(() => {
      setItems([
        { id: 1, text: "one" },
        { id: 2, text: "two!" },
      ]);
    });

    const second = Array.from(container.querySelectorAll("li"));
    expect(second[0]).toBe(first[0]);
    expect(second[1]).toBe(first[1]);
    expect(second[1]?.textContent).toBe("two!");
    expect(second[1]?.getAttribute("title")).toBe("two!");

    root.unmount();
  });
});
