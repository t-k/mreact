// @vitest-environment happy-dom

// Behavior contract for the keyed-memo-row reconcile fast path. These assert
// observable behavior (DOM + render/bailout counts) that must hold on BOTH the
// general keyed reconcile and the dedicated same-order fast path. They pass on
// the unoptimized code and must keep passing after the fast path lands.

import { describe, expect, test } from "vitest";
import { flushQueuedComputations } from "@reckona/mreact-reactive-core/internal";
import { bindEvent, bindText, effect } from "@reckona/mreact-reactive-dom";
import {
  createElement,
  createRoot,
  flushSync,
  memo,
  useRef,
  useState,
} from "../src/index.js";
import { disposeHostFiberResources } from "../src/fiber-host.js";
import { createReactiveDomBlock } from "../src/jsx-runtime.js";

interface RowData {
  id: number;
  label: string;
}

function withProdEnv(run: () => void): void {
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  try {
    run();
  } finally {
    process.env.NODE_ENV = previous;
  }
}

async function withProdEnvAsync(run: () => Promise<void>): Promise<void> {
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  try {
    await run();
  } finally {
    process.env.NODE_ENV = previous;
  }
}

function ids(container: Element): string[] {
  return Array.from(container.querySelectorAll("[data-id]")).map(
    (node) => (node as HTMLElement).dataset.id ?? "",
  );
}

function labels(container: Element): string[] {
  return Array.from(container.querySelectorAll("[data-id]")).map(
    (node) => node.textContent ?? "",
  );
}

describe("keyed memo-row reconcile (same-order fast path contract)", () => {
  test("plain memo list: only the changed row re-renders, others bail, DOM correct", () => {
    withProdEnv(() => {
      const container = document.createElement("div");
      const renders = new Map<number, number>();
      let setRows: (rows: RowData[]) => void = () => {};

      const Row = memo(
        (props: { row: RowData }) => {
          renders.set(props.row.id, (renders.get(props.row.id) ?? 0) + 1);
          return createElement(
            "div",
            { "data-id": String(props.row.id) },
            props.row.label,
          );
        },
        (a, b) => a.row === b.row,
      );

      const initial: RowData[] = [
        { id: 1, label: "a" },
        { id: 2, label: "b" },
        { id: 3, label: "c" },
      ];

      function App() {
        const [rows, setRowsState] = useState<RowData[]>(initial);
        setRows = setRowsState;
        return rows.map((row) => createElement(Row, { key: row.id, row }));
      }

      flushSync(() => {
        createRoot(container).render(createElement(App, null));
      });
      expect(ids(container)).toEqual(["1", "2", "3"]);
      expect(labels(container)).toEqual(["a", "b", "c"]);
      expect([...renders.values()]).toEqual([1, 1, 1]);

      // Change ONLY row 2 (new object), reusing the identities of rows 1 and 3
      // exactly as the js-framework-benchmark partial-update does.
      const updated = initial.slice();
      updated[1] = { id: 2, label: "B!" };
      flushSync(() => setRows(updated));

      expect(labels(container)).toEqual(["a", "B!", "c"]);
      expect(ids(container)).toEqual(["1", "2", "3"]);
      // Row 2 re-rendered; rows 1 and 3 bailed (still 1 render each).
      expect(renders.get(1)).toBe(1);
      expect(renders.get(2)).toBe(2);
      expect(renders.get(3)).toBe(1);
    });
  });

  test("plain memo list: a no-op re-render bails every row", () => {
    withProdEnv(() => {
      const container = document.createElement("div");
      let renderCount = 0;
      let bump: () => void = () => {};
      const rows: RowData[] = [
        { id: 1, label: "a" },
        { id: 2, label: "b" },
      ];

      const Row = memo(
        (props: { row: RowData }) => {
          renderCount += 1;
          return createElement("div", { "data-id": String(props.row.id) }, props.row.label);
        },
        (a, b) => a.row === b.row,
      );

      function App() {
        const [, setTick] = useState(0);
        bump = () => setTick((value) => value + 1);
        return rows.map((row) => createElement(Row, { key: row.id, row }));
      }

      flushSync(() => {
        createRoot(container).render(createElement(App, null));
      });
      expect(renderCount).toBe(2);

      flushSync(() => bump());
      // Same rows, same order, same identities -> all bail.
      expect(renderCount).toBe(2);
      expect(ids(container)).toEqual(["1", "2"]);
    });
  });

  test("reactive-block memo list: changed row cell-updates, others untouched, DOM correct", () => {
    withProdEnv(() => {
      const container = document.createElement("div");
      const blockBuilds = new Map<number, number>();
      let setRows: (rows: RowData[]) => void = () => {};

      const Row = memo(
        (props: { row: RowData }) =>
          createReactiveDomBlock((p: { row: RowData }) => {
            blockBuilds.set(p.row.id, (blockBuilds.get(p.row.id) ?? 0) + 1);
            const node = document.createElement("div");
            node.setAttribute("data-id", String(p.row.id));
            const text = document.createTextNode("");
            node.appendChild(text);
            const dispose = bindText(text, () => p.row.label, { preserveInitial: false });
            return { node, dispose };
          }, props),
        (a, b) => a.row === b.row,
      );

      function App() {
        const [rows, setRowsState] = useState<RowData[]>([
          { id: 1, label: "a" },
          { id: 2, label: "b" },
          { id: 3, label: "c" },
        ]);
        setRows = setRowsState;
        return rows.map((row) => createElement(Row, { key: row.id, row }));
      }

      flushSync(() => {
        createRoot(container).render(createElement(App, null));
      });
      flushQueuedComputations();
      expect(ids(container)).toEqual(["1", "2", "3"]);
      expect(labels(container)).toEqual(["a", "b", "c"]);
      const buildsAfterMount = new Map(blockBuilds);

      flushSync(() =>
        setRows([
          { id: 1, label: "a" },
          { id: 2, label: "B!" },
          { id: 3, label: "c" },
        ]),
      );
      flushQueuedComputations();

      expect(labels(container)).toEqual(["a", "B!", "c"]);
      // No block's render closure re-ran (cell-update only), for any row.
      expect(blockBuilds).toEqual(buildsAfterMount);
    });
  });

  test("marked static-block rows: a changed row cell-updates without re-invoking the component or rebuilding the block", () => {
    withProdEnv(() => {
      const container = document.createElement("div");
      let componentCalls = 0;
      let blockBuilds = 0;
      let setRows: (rows: RowData[]) => void = () => {};

      const RowComponent = (props: { row: RowData }) => {
        componentCalls += 1;
        return createReactiveDomBlock((p: { row: RowData }) => {
          blockBuilds += 1;
          const node = document.createElement("div");
          node.setAttribute("data-id", String(p.row.id));
          const text = document.createTextNode("");
          node.appendChild(text);
          const dispose = bindText(text, () => p.row.label, { preserveInitial: false });
          return { node, dispose };
        }, props);
      };
      // The compiler stamps this on a lowered, props-transparent block component.
      (RowComponent as unknown as Record<string, unknown>).__mreactStaticBlock = true;
      const Row = memo(RowComponent, (a, b) => a.row === b.row);

      const initial: RowData[] = [
        { id: 1, label: "a" },
        { id: 2, label: "b" },
        { id: 3, label: "c" },
      ];

      function App() {
        const [rows, setRowsState] = useState<RowData[]>(initial);
        setRows = setRowsState;
        return rows.map((row) => createElement(Row, { key: row.id, row }));
      }

      flushSync(() => {
        createRoot(container).render(createElement(App, null));
      });
      flushQueuedComputations();
      expect(labels(container)).toEqual(["a", "b", "c"]);
      const callsAfterMount = componentCalls;
      const buildsAfterMount = blockBuilds;

      // Same-order update, change ONLY row 2 (reuse identities of 1 and 3).
      const updated = initial.slice();
      updated[1] = { id: 2, label: "B!" };
      flushSync(() => setRows(updated));
      flushQueuedComputations();

      expect(labels(container)).toEqual(["a", "B!", "c"]);
      expect(ids(container)).toEqual(["1", "2", "3"]);
      // The changed row updated through the prop cell: the component was NOT
      // re-invoked and NO block render closure re-ran, for any row.
      expect(componentCalls).toBe(callsAfterMount);
      expect(blockBuilds).toBe(buildsAfterMount);

      // A second, different change keeps driving correctly through the cell.
      const updated2 = updated.slice();
      updated2[0] = { id: 1, label: "A!" };
      flushSync(() => setRows(updated2));
      flushQueuedComputations();
      expect(labels(container)).toEqual(["A!", "B!", "c"]);
      expect(componentCalls).toBe(callsAfterMount);
      expect(blockBuilds).toBe(buildsAfterMount);
    });
  });

  test("marked static-block rows with compiler-proven memo compare keys skip comparator calls", () => {
    withProdEnv(() => {
      const container = document.createElement("div");
      let compareCalls = 0;
      let setSelected: (id: number | null) => void = () => {};

      type RowProps = { row: RowData; selected: boolean };
      const RowComponent = (props: RowProps) =>
        createReactiveDomBlock((p: RowProps) => {
          const node = document.createElement("div");
          node.setAttribute("data-id", String(p.row.id));
          const text = document.createTextNode("");
          node.appendChild(text);
          const dispose = effect(() => {
            const className = p.selected ? "danger" : "";
            if (node.className !== className) {
              node.className = className;
            }
            if (text.data !== p.row.label) {
              text.data = p.row.label;
            }
          });
          return { node, dispose };
        }, props);

      (RowComponent as unknown as Record<string, unknown>).__mreactStaticBlock = true;
      const Row = memo(
        RowComponent,
        (a, b) => {
          compareCalls += 1;
          return a.selected === b.selected && a.row === b.row;
        },
      );
      (Row as unknown as Record<string, unknown>).__mreactMemoCompareProps = [
        "selected",
        "row",
      ];

      const rows: RowData[] = [
        { id: 1, label: "a" },
        { id: 2, label: "b" },
        { id: 3, label: "c" },
      ];

      function App() {
        const [selected, setSelectedState] = useState<number | null>(null);
        setSelected = setSelectedState;
        return rows.map((row) =>
          createElement(Row, {
            key: row.id,
            row,
            selected: selected === row.id,
          }),
        );
      }

      flushSync(() => {
        createRoot(container).render(createElement(App, null));
      });
      flushQueuedComputations();
      expect(compareCalls).toBe(0);
      expect(ids(container)).toEqual(["1", "2", "3"]);
      expect(Array.from(container.querySelectorAll(".danger"))).toHaveLength(0);

      flushSync(() => setSelected(2));
      flushQueuedComputations();
      expect(compareCalls).toBe(0);
      expect(ids(container)).toEqual(["1", "2", "3"]);
      expect(container.querySelector(".danger")?.textContent).toBe("b");

      flushSync(() => setSelected(3));
      flushQueuedComputations();
      expect(compareCalls).toBe(0);
      expect(container.querySelector(".danger")?.textContent).toBe("c");
    });
  });

  test("marked static-block rows keep remove handlers after a prior row deletion", async () => {
    await withProdEnvAsync(async () => {
      const container = document.createElement("tbody");
      const disposedIds: number[] = [];
      const removedIds: number[] = [];
      let setRows: (rows: RowData[] | ((rows: RowData[]) => RowData[])) => void = () => {};

      const RowComponent = (props: { row: RowData }) => {
        return createReactiveDomBlock((p: { row: RowData }) => {
          const tr = document.createElement("tr");
          const idCell = document.createElement("td");
          const idText = document.createTextNode("");
          idCell.appendChild(idText);
          tr.appendChild(idCell);

          const labelCell = document.createElement("td");
          labelCell.textContent = p.row.label;
          tr.appendChild(labelCell);

          const removeCell = document.createElement("td");
          const removeButton = document.createElement("button");
          removeButton.type = "button";
          removeButton.textContent = "remove";
          removeCell.appendChild(removeButton);
          tr.appendChild(removeCell);

          const disposeEffect = effect(() => {
            const nextId = String(p.row.id);
            if (tr.dataset.id !== nextId) {
              tr.dataset.id = nextId;
            }
            if (idText.data !== nextId) {
              idText.data = nextId;
            }

            return bindEvent(removeButton, "click", () => {
              removedIds.push(p.row.id);
              flushSync(() => {
                setRows((rows) => rows.filter((row) => row.id !== p.row.id));
              });
            });
          });

          return {
            node: tr,
            dispose: () => {
              disposedIds.push(Number(tr.dataset.id));
              disposeEffect();
            },
          };
        }, props);
      };
      (RowComponent as unknown as Record<string, unknown>).__mreactStaticBlock = true;
      const Row = memo(RowComponent, (a, b) => a.row === b.row);

      const initial = Array.from({ length: 10 }, (_, index) => ({
        id: index + 1,
        label: `row ${index + 1}`,
      }));

      function App() {
        const [rows, setRowsState] = useState<RowData[]>(initial);
        setRows = setRowsState;
        return rows.map((row) => createElement(Row, { key: row.id, row }));
      }

      flushSync(() => {
        createRoot(container).render(createElement(App, null));
      });
      await Promise.resolve();
      flushQueuedComputations();
      expect(ids(container)).toEqual(["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"]);

      container.querySelector("tr:nth-of-type(9)>td:nth-of-type(3)>button")?.dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
      await Promise.resolve();
      flushQueuedComputations();
      expect(removedIds).toEqual([9]);
      expect(disposedIds).toEqual([9]);
      expect(ids(container)).toEqual(["1", "2", "3", "4", "5", "6", "7", "8", "10"]);

      container.querySelector("tr:nth-of-type(8)>td:nth-of-type(3)>button")?.dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
      await Promise.resolve();
      flushQueuedComputations();
      expect(removedIds).toEqual([9, 8]);
      expect(ids(container)).toEqual(["1", "2", "3", "4", "5", "6", "7", "10"]);
    });
  });

  test("reorder (swap two rows) produces correct DOM and preserves identity", () => {
    withProdEnv(() => {
      const container = document.createElement("div");
      const nodeById = new Map<number, Element>();
      let setRows: (rows: RowData[]) => void = () => {};

      const Row = memo(
        (props: { row: RowData }) =>
          createElement("div", { "data-id": String(props.row.id) }, props.row.label),
        (a, b) => a.row === b.row,
      );

      function App() {
        const [rows, setRowsState] = useState<RowData[]>([
          { id: 1, label: "a" },
          { id: 2, label: "b" },
          { id: 3, label: "c" },
        ]);
        setRows = setRowsState;
        return rows.map((row) => createElement(Row, { key: row.id, row }));
      }

      flushSync(() => {
        createRoot(container).render(createElement(App, null));
      });
      for (const node of container.querySelectorAll("[data-id]")) {
        nodeById.set(Number((node as HTMLElement).dataset.id), node);
      }

      // Swap rows 1 and 3.
      flushSync(() =>
        setRows([
          { id: 3, label: "c" },
          { id: 2, label: "b" },
          { id: 1, label: "a" },
        ]),
      );

      expect(ids(container)).toEqual(["3", "2", "1"]);
      expect(labels(container)).toEqual(["c", "b", "a"]);
      // Keyed identity preserved across the move (same DOM nodes reused).
      expect(container.querySelector('[data-id="1"]')).toBe(nodeById.get(1));
      expect(container.querySelector('[data-id="3"]')).toBe(nodeById.get(3));
    });
  });

  test("insert and delete in the middle of a memo list", () => {
    withProdEnv(() => {
      const container = document.createElement("div");
      let setRows: (rows: RowData[]) => void = () => {};

      const Row = memo(
        (props: { row: RowData }) =>
          createElement("div", { "data-id": String(props.row.id) }, props.row.label),
        (a, b) => a.row === b.row,
      );

      function App() {
        const [rows, setRowsState] = useState<RowData[]>([
          { id: 1, label: "a" },
          { id: 2, label: "b" },
          { id: 3, label: "c" },
        ]);
        setRows = setRowsState;
        return rows.map((row) => createElement(Row, { key: row.id, row }));
      }

      flushSync(() => {
        createRoot(container).render(createElement(App, null));
      });

      // Insert id=9 in the middle.
      flushSync(() =>
        setRows([
          { id: 1, label: "a" },
          { id: 9, label: "x" },
          { id: 2, label: "b" },
          { id: 3, label: "c" },
        ]),
      );
      expect(ids(container)).toEqual(["1", "9", "2", "3"]);

      // Delete id=2 from the middle.
      flushSync(() =>
        setRows([
          { id: 1, label: "a" },
          { id: 9, label: "x" },
          { id: 3, label: "c" },
        ]),
      );
      expect(ids(container)).toEqual(["1", "9", "3"]);
      expect(labels(container)).toEqual(["a", "x", "c"]);
    });
  });

  test("memo row with local useState: state update re-renders only that row, list bails", () => {
    withProdEnv(() => {
      const container = document.createElement("div");
      const bumpers = new Map<number, () => void>();
      let renderCount = 0;

      const Row = memo(
        (props: { row: RowData }) => {
          renderCount += 1;
          const [n, setN] = useState(0);
          bumpers.set(props.row.id, () => setN((value) => value + 1));
          return createElement(
            "div",
            { "data-id": String(props.row.id) },
            `${props.row.label}:${n}`,
          );
        },
        (a, b) => a.row === b.row,
      );

      const rows: RowData[] = [
        { id: 1, label: "a" },
        { id: 2, label: "b" },
      ];

      function App() {
        return rows.map((row) => createElement(Row, { key: row.id, row }));
      }

      flushSync(() => {
        createRoot(container).render(createElement(App, null));
      });
      expect(renderCount).toBe(2);
      expect(labels(container)).toEqual(["a:0", "b:0"]);

      // Local state bump on row 2 only.
      flushSync(() => bumpers.get(2)?.());
      expect(labels(container)).toEqual(["a:0", "b:1"]);
      // Only row 2 re-rendered (one extra render).
      expect(renderCount).toBe(3);
    });
  });

  test("a reactive-block row bailed in place retains its subscription and disposes exactly once on teardown", () => {
    withProdEnv(() => {
      const container = document.createElement("div");
      const disposeCounts = new Map<number, number>();
      let setRows: (rows: RowData[]) => void = () => {};

      const Row = memo(
        (props: { row: RowData }) =>
          createReactiveDomBlock((p: { row: RowData }) => {
            const node = document.createElement("div");
            node.setAttribute("data-id", String(p.row.id));
            const text = document.createTextNode("");
            node.appendChild(text);
            const unbind = bindText(text, () => p.row.label, { preserveInitial: false });
            const id = p.row.id;
            return {
              node,
              dispose: () => {
                disposeCounts.set(id, (disposeCounts.get(id) ?? 0) + 1);
                unbind();
              },
            };
          }, props),
        (a, b) => a.row === b.row,
      );

      const initial: RowData[] = [
        { id: 1, label: "a" },
        { id: 2, label: "b" },
        { id: 3, label: "c" },
      ];

      function App() {
        const [rows, setRowsState] = useState<RowData[]>(initial);
        setRows = setRowsState;
        return rows.map((row) => createElement(Row, { key: row.id, row }));
      }

      flushSync(() => {
        createRoot(container).render(createElement(App, null));
      });
      flushQueuedComputations();

      // Same-order update: rows 1 and 3 bail IN PLACE via the fast path, row 2
      // cell-updates. None of the blocks are disposed (subscriptions retained).
      const updated = initial.slice();
      updated[1] = { id: 2, label: "B!" };
      flushSync(() => setRows(updated));
      flushQueuedComputations();
      expect(disposeCounts.size).toBe(0);
      expect(labels(container)).toEqual(["a", "B!", "c"]);

      // The retained subscription still drives the bailed rows: change row 1.
      const updated2 = updated.slice();
      updated2[0] = { id: 1, label: "A!" };
      flushSync(() => setRows(updated2));
      flushQueuedComputations();
      expect(labels(container)).toEqual(["A!", "B!", "c"]);
      expect(disposeCounts.size).toBe(0);

      // Teardown: every block disposes EXACTLY once (no leak, no double-dispose).
      flushSync(() => setRows([]));
      flushQueuedComputations();
      expect(container.querySelectorAll("[data-id]").length).toBe(0);
      expect([...disposeCounts.entries()].sort()).toEqual([
        [1, 1],
        [2, 1],
        [3, 1],
      ]);
    });
  });

  test("direct reactive-block fiber disposal batches delegated root releases", () => {
    const first = document.createElement("button");
    const second = document.createElement("button");
    document.body.append(first, second);
    const documentRemoveEventListener = document.removeEventListener.bind(document);
    let documentListenerRemovals = 0;
    let removalsInsideDispose = -1;

    document.removeEventListener = ((type, listener, options) => {
      if (type === "click") {
        documentListenerRemovals += 1;
      }
      documentRemoveEventListener(type, listener, options);
    }) as typeof document.removeEventListener;

    try {
      const disposeFirst = bindEvent(first, "click", () => {});
      const disposeSecond = bindEvent(second, "click", () => {});

      disposeHostFiberResources({
        child: undefined,
        hasDisposableResources: true,
        sibling: undefined,
        stateNode: {
          dispose() {
            disposeFirst();
            disposeSecond();
            removalsInsideDispose = documentListenerRemovals;
          },
        },
        tag: "reactive-dom-block",
      } as never);

      expect(removalsInsideDispose).toBe(0);
      expect(documentListenerRemovals).toBe(1);
    } finally {
      document.removeEventListener = documentRemoveEventListener;
      first.remove();
      second.remove();
    }
  });

  test("rows bailed in place reorder correctly on a later swap", () => {
    withProdEnv(() => {
      const container = document.createElement("div");
      const nodeById = new Map<number, Element>();
      let setRows: (rows: RowData[]) => void = () => {};

      const Row = memo(
        (props: { row: RowData }) =>
          createElement("div", { "data-id": String(props.row.id) }, props.row.label),
        (a, b) => a.row === b.row,
      );

      const initial: RowData[] = [
        { id: 1, label: "a" },
        { id: 2, label: "b" },
        { id: 3, label: "c" },
      ];

      function App() {
        const [rows, setRowsState] = useState<RowData[]>(initial);
        setRows = setRowsState;
        return rows.map((row) => createElement(Row, { key: row.id, row }));
      }

      flushSync(() => {
        createRoot(container).render(createElement(App, null));
      });
      for (const node of container.querySelectorAll("[data-id]")) {
        nodeById.set(Number((node as HTMLElement).dataset.id), node);
      }

      // First a same-order update -> rows 1 and 3 reused in place.
      const updated = initial.slice();
      updated[1] = { id: 2, label: "B!" };
      flushSync(() => setRows(updated));
      expect(labels(container)).toEqual(["a", "B!", "c"]);

      // Then swap 1 and 3 -> general path moves the in-place-reused fibers.
      flushSync(() => setRows([updated[2], updated[1], updated[0]]));
      expect(ids(container)).toEqual(["3", "2", "1"]);
      // Same DOM nodes preserved through the bail-then-move.
      expect(container.querySelector('[data-id="1"]')).toBe(nodeById.get(1));
      expect(container.querySelector('[data-id="3"]')).toBe(nodeById.get(3));
    });
  });

  test("memo row with a ref still attaches the ref across a same-order update", () => {
    withProdEnv(() => {
      const container = document.createElement("div");
      let captured: Element | null = null;
      let setRows: (rows: RowData[]) => void = () => {};

      const Row = memo(
        (props: { row: RowData; innerRef: { current: Element | null } }) =>
          createElement("div", { "data-id": String(props.row.id), ref: props.innerRef }, props.row.label),
        (a, b) => a.row === b.row,
      );

      function App() {
        const ref = useRef<Element | null>(null);
        const [rows, setRowsState] = useState<RowData[]>([
          { id: 1, label: "a" },
          { id: 2, label: "b" },
        ]);
        setRows = setRowsState;
        captured = ref.current;
        return rows.map((row) =>
          createElement(Row, { key: row.id, row, innerRef: row.id === 1 ? ref : { current: null } }),
        );
      }

      flushSync(() => {
        createRoot(container).render(createElement(App, null));
      });

      flushSync(() =>
        setRows([
          { id: 1, label: "A!" },
          { id: 2, label: "b" },
        ]),
      );
      expect(labels(container)).toEqual(["A!", "b"]);
      expect(captured).toBe(container.querySelector('[data-id="1"]'));
    });
  });
});
