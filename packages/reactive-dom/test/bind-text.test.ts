// @vitest-environment happy-dom

import { describe, expect, test } from "vitest";
import { cell } from "@modular-react/reactive-core";
import { flushEffects } from "@modular-react/reactive-core/testing";
import { bindText } from "../src/index.js";

describe("bindText", () => {
  test("updates text data and stops after dispose", async () => {
    const count = cell(0);
    const text = document.createTextNode("");
    const dispose = bindText(text, () => count.get());

    expect(text.data).toBe("0");

    count.set(1);
    await flushEffects();
    expect(text.data).toBe("1");

    dispose();
    count.set(2);
    await flushEffects();
    expect(text.data).toBe("1");
  });
});
