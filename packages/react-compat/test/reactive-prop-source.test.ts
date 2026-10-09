import { describe, expect, test } from "vitest";
import { effect } from "@reckona/mreact-reactive-dom";
import {
  batchReactivePropCellUpdates,
  createReactivePropCell,
  createReactivePropProxy,
  setReactivePropCell,
} from "../src/reactive-prop-cell.js";

describe("reactive prop subscription semantics", () => {
  test("a tracked property preserves its subscription when others appear", () => {
    const cell = createReactivePropCell({ label: "first", selected: false });
    const props = createReactivePropProxy<{ label: string; selected: boolean }>(cell);
    const labels: string[] = [];
    const selections: boolean[] = [];
    const disposeLabel = effect(() => {
      labels.push(props.label);
    });
    try {
      const disposeSelected = effect(() => {
        selections.push(props.selected);
      });
      try {
        expect(cell.propertySources).toBeInstanceOf(Map);
        setReactivePropCell(cell, { label: "second", selected: false });
        setReactivePropCell(cell, { label: "second", selected: true });
        expect(labels).toEqual(["first", "second"]);
        expect(selections).toEqual([false, true]);
      } finally {
        disposeSelected();
      }
    } finally {
      disposeLabel();
    }
  });

  test("a getter can register another property during the first property's update", () => {
    let duringUpdate = false;
    let props: { label: string; selected: boolean };
    const previous = {
      get label() {
        if (duringUpdate) void props.selected;
        return "old";
      },
      selected: false,
    };
    const cell = createReactivePropCell(previous);
    props = createReactivePropProxy(cell);
    const labels: string[] = [];
    const dispose = effect(() => {
      labels.push(props.label);
    });
    try {
      duringUpdate = true;
      setReactivePropCell(cell, { label: "new", selected: true });
      expect(labels).toEqual(["old", "new"]);
      expect(cell.propertySources?.get("selected")?.version).toBe(1);
    } finally {
      dispose();
    }
  });

  test("symbol presence, Object.is values, and batched changes retain their semantics", () => {
    const key = Symbol("value");
    const cell = createReactivePropCell({ [key]: NaN });
    const props = createReactivePropProxy<Record<typeof key, number>>(cell);
    const values: Array<[boolean, number]> = [];
    const dispose = effect(() => {
      values.push([key in props, props[key]]);
    });
    try {
      setReactivePropCell(cell, { [key]: NaN });
      expect(values).toHaveLength(1);
      batchReactivePropCellUpdates(() => {
        setReactivePropCell(cell, { [key]: -0 });
        setReactivePropCell(cell, { [key]: 0 });
        expect(values).toHaveLength(1);
      });
      expect(values).toEqual([
        [true, NaN],
        [true, 0],
      ]);
      setReactivePropCell(cell, {});
      expect(values).toEqual([
        [true, NaN],
        [true, 0],
        [false, undefined],
      ]);
    } finally {
      dispose();
    }
  });

  test("an object property keeps shallow mutation detection", () => {
    const row = { label: "before" };
    const cell = createReactivePropCell({ row });
    const props = createReactivePropProxy<{ row: typeof row }>(cell);
    const labels: string[] = [];
    const dispose = effect(() => {
      labels.push(props.row.label);
    });
    try {
      row.label = "after";
      setReactivePropCell(cell, { row });
      expect(labels).toEqual(["before", "after"]);
    } finally {
      dispose();
    }
  });

  test("enumeration and additional properties preserve notification order", () => {
    const cell = createReactivePropCell({ first: 0, second: 0, third: 0 });
    const props = createReactivePropProxy<{ first: number; second: number; third: number }>(cell);
    const calls: string[] = [];
    const disposers = [
      effect(() => {
        void props.first;
        calls.push("first");
      }),
      effect(() => {
        void props.second;
        calls.push("second");
      }),
      effect(() => {
        void props.third;
        calls.push("third");
      }),
      effect(() => {
        void Object.keys(props);
        calls.push("keys");
      }),
    ];
    try {
      calls.length = 0;
      setReactivePropCell(cell, { first: 1, second: 1, third: 1 });
      expect(calls).toEqual(["first", "second", "third", "keys"]);
    } finally {
      for (const dispose of disposers) dispose();
    }
  });
});
