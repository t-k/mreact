// @vitest-environment happy-dom

import { describe, expect, it } from "vitest";
import { bindText } from "@reckona/mreact-reactive-dom";
import {
  act,
  createCellMock,
  createComputedMock,
  flushReactive,
  render,
} from "../src/index.js";

describe("component test utils", () => {
  it("renders reactive-dom output and unmounts it", () => {
    const view = render(() => document.createTextNode("hello"));

    expect(view.container.textContent).toBe("hello");

    view.unmount();

    expect(view.container.textContent).toBe("");
  });

  it("rerenders into the same container", () => {
    const view = render(() => document.createTextNode("first"));

    view.rerender(() => document.createTextNode("second"));

    expect(view.container.textContent).toBe("second");
  });

  it("flushes reactive updates through act", async () => {
    const count = createCellMock(0);
    const doubled = createComputedMock(() => count.get() * 2);
    const view = render(() => {
      const text = document.createTextNode("");
      bindText(text, () => doubled.get());
      return text;
    });

    await act(() => {
      count.set(2);
      count.set(3);
    });

    expect(view.container.textContent).toBe("6");
  });

  it("flushReactive drains pending effects without wrapping a mutation", async () => {
    const value = createCellMock("initial");
    const view = render(() => {
      const text = document.createTextNode("");
      bindText(text, () => value.get());
      return text;
    });

    value.set("updated");
    await flushReactive();

    expect(view.container.textContent).toBe("updated");
  });
});
