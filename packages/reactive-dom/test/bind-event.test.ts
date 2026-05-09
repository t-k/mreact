// @vitest-environment happy-dom

import { describe, expect, test } from "vitest";
import { bindEvent } from "../src/index.js";

describe("bindEvent", () => {
  test("uses native events and removes listener on dispose", () => {
    const button = document.createElement("button");
    let calls = 0;

    const dispose = bindEvent(button, "click", () => {
      calls += 1;
    });

    button.click();
    expect(calls).toBe(1);

    dispose();
    button.click();
    expect(calls).toBe(1);
  });
});
