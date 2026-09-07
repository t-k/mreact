// @vitest-environment happy-dom

import { cell } from "@reckona/mreact-reactive-core";
import { flushEffects } from "@reckona/mreact-reactive-core/testing";
import { describe, expect, test } from "vitest";
import { bindSelectValue } from "../src/internal.js";
import { bindSpreadProps, withPropBindingMetadata } from "../src/index.js";

interface RetargetableElement extends HTMLElement {
  __mreactPropBindings?: Array<{ retarget(element: Element): void }>;
}

function createSelect(values: readonly string[], options?: { disabled?: readonly string[] }): HTMLSelectElement {
  const select = document.createElement("select");

  for (const value of values) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    option.disabled = options?.disabled?.includes(value) === true;
    select.append(option);
  }

  return select;
}

function selectedValues(select: HTMLSelectElement): string[] {
  return Array.from(select.options)
    .filter((option) => option.selected)
    .map((option) => option.value);
}

describe("bindSelectValue", () => {
  test("selects the matching option and follows later value changes", async () => {
    const value = cell<unknown>("done");
    const select = createSelect(["open", "done", "closed"]);
    const dispose = bindSelectValue(select, () => ({ value: value.get() }));

    await flushEffects();
    expect(select.value).toBe("done");

    value.set("closed");
    await flushEffects();
    expect(select.value).toBe("closed");

    dispose();
  });

  test("falls back to the first enabled option when no option matches", async () => {
    const value = cell<unknown>("missing");
    const select = createSelect(["open", "done"], { disabled: ["open"] });
    const dispose = bindSelectValue(select, () => ({ value: value.get() }));

    await flushEffects();
    expect(select.value).toBe("done");
    expect(selectedValues(select)).toEqual(["done"]);

    dispose();
  });

  test("matches the generic spread binding for the same single select sequence", async () => {
    const values: unknown[] = ["done", "missing", null, "open"];
    const dedicated = createSelect(["open", "done"], { disabled: ["open"] });
    const generic = createSelect(["open", "done"], { disabled: ["open"] });
    const dedicatedValue = cell<unknown>(values[0]);
    const genericValue = cell<unknown>(values[0]);
    const disposeDedicated = bindSelectValue(dedicated, () => ({ value: dedicatedValue.get() }));
    const disposeGeneric = bindSpreadProps(generic, () => ({ value: genericValue.get() }));

    for (const next of values) {
      dedicatedValue.set(next);
      genericValue.set(next);
      await flushEffects();
      expect(selectedValues(dedicated), String(next)).toEqual(selectedValues(generic));
    }

    disposeDedicated();
    disposeGeneric();
  });

  test("selects every listed option on a multiple select", async () => {
    const value = cell<unknown>(["done"]);
    const select = createSelect(["open", "done", "closed"]);
    select.multiple = true;
    const dispose = bindSelectValue(select, () => ({ value: value.get() }));

    await flushEffects();
    expect(selectedValues(select)).toEqual(["done"]);

    value.set(["open", "done"]);
    await flushEffects();
    expect(selectedValues(select)).toEqual(["open", "done"]);

    value.set([null, "closed", undefined]);
    await flushEffects();
    expect(selectedValues(select)).toEqual(["closed"]);

    dispose();
  });

  test("prefers value over defaultValue and falls back to defaultValue when value is nullish", async () => {
    const value = cell<unknown>("done");
    const select = createSelect(["open", "done", "closed"]);
    const dispose = bindSelectValue(select, () => ({
      defaultValue: "closed",
      value: value.get(),
    }));

    await flushEffects();
    expect(select.value).toBe("done");

    value.set(null);
    await flushEffects();
    expect(select.value).toBe("closed");

    value.set("open");
    await flushEffects();
    expect(select.value).toBe("open");

    dispose();
  });

  test("applies a defaultValue-only binding and follows its changes", async () => {
    const defaultValue = cell<unknown>("done");
    const select = createSelect(["open", "done", "closed"]);
    const dispose = bindSelectValue(select, () => ({ defaultValue: defaultValue.get() }));

    await flushEffects();
    expect(select.value).toBe("done");

    defaultValue.set("closed");
    await flushEffects();
    expect(select.value).toBe("closed");

    dispose();
  });

  test("treats an undefined value as absent and falls back to defaultValue", async () => {
    const value = cell<unknown>("open");
    const select = createSelect(["open", "done", "closed"]);
    const dispose = bindSelectValue(select, () => ({
      defaultValue: "closed",
      value: value.get(),
    }));

    await flushEffects();
    expect(select.value).toBe("open");

    value.set(undefined);
    await flushEffects();
    expect(select.value).toBe("closed");

    dispose();
  });

  test("reapplies the fallback selection while the value stays nullish", async () => {
    const revision = cell(0);
    const value = cell<unknown>("open");
    const select = createSelect(["open", "done", "closed"]);
    const dispose = bindSelectValue(select, () => {
      revision.get();
      return { defaultValue: "closed", value: value.get() };
    });

    await flushEffects();
    value.set(null);
    await flushEffects();
    expect(select.value).toBe("closed");

    select.options[0]!.selected = true;
    expect(select.value).toBe("open");

    revision.set(1);
    await flushEffects();
    expect(select.value).toBe("closed");

    dispose();
  });

  test("leaves the current selection alone when the bound value does not change", async () => {
    const other = cell(0);
    const select = createSelect(["open", "done"]);
    const dispose = bindSelectValue(select, () => {
      other.get();
      return { value: "open" };
    });

    await flushEffects();
    expect(select.value).toBe("open");

    select.options[1]!.selected = true;
    other.set(1);
    await flushEffects();

    expect(select.value).toBe("done");

    dispose();
  });

  test("applies the selection against options inserted after the binding", async () => {
    const value = cell<unknown>("open");
    const dedicated = createSelect(["open"]);
    const generic = createSelect(["open"]);
    const disposeDedicated = bindSelectValue(dedicated, () => ({ value: value.get() }));
    const disposeGeneric = bindSpreadProps(generic, () => ({ value: value.get() }));

    await flushEffects();
    expect(dedicated.value).toBe("open");

    for (const select of [dedicated, generic]) {
      const late = document.createElement("option");
      late.value = "late";
      late.textContent = "late";
      select.append(late);
    }
    value.set("late");
    await flushEffects();

    expect(dedicated.value).toBe("late");
    expect(dedicated.value).toBe(generic.value);

    for (const select of [dedicated, generic]) {
      select.options[1]?.remove();
    }
    value.set("open");
    await flushEffects();

    expect(dedicated.value).toBe("open");
    expect(dedicated.value).toBe(generic.value);

    disposeDedicated();
    disposeGeneric();
  });

  test("stops applying the value after disposal", async () => {
    const value = cell<unknown>("open");
    const select = createSelect(["open", "done"]);
    const dispose = bindSelectValue(select, () => ({ value: value.get() }));

    await flushEffects();
    dispose();
    value.set("done");
    await flushEffects();

    expect(select.value).toBe("open");
  });

  test("reapplies the selection to a retargeted element", async () => {
    const value = cell<unknown>("done");
    const select = createSelect(["open", "done"]);
    const next = createSelect(["open", "done"]);
    const dispose = withPropBindingMetadata(() =>
      bindSelectValue(select, () => ({ value: value.get() })),
    );

    await flushEffects();
    expect(select.value).toBe("done");

    const bindings = (select as unknown as RetargetableElement).__mreactPropBindings;

    expect(bindings).toHaveLength(1);
    bindings?.[0]?.retarget(next);
    await flushEffects();

    expect(next.value).toBe("done");

    value.set("open");
    await flushEffects();
    expect(next.value).toBe("open");

    dispose();
  });
});
