// @vitest-environment happy-dom

import { describe, expect, it } from "vitest";
import { cell } from "@reckona/mreact-reactive-core";
import { flushEffects } from "@reckona/mreact-reactive-core/testing";
import { bindText, insertDynamic } from "@reckona/mreact-reactive-dom";
import { createForm } from "../src/index.js";

describe("conditional form fields in the DOM", () => {
  it("re-shows a hidden field and keeps its live value binding", async () => {
    const form = createForm({ initialValues: { email: "", name: "" } });
    const visible = cell(true);
    const parent = document.createElement("div");
    const marker = document.createComment("field");
    parent.append(marker);

    const dispose = insertDynamic(parent, marker, () => {
      if (!visible.get()) {
        return null;
      }

      const text = document.createTextNode("");
      bindText(text, () => form.field("email").state.get().value);
      return text;
    });

    try {
      await form.setValue("email", "ada@example.test");
      await flushEffects();
      expect(parent.textContent).toBe("ada@example.test");

      visible.set(false);
      await flushEffects();
      expect(parent.textContent).toBe("");

      visible.set(true);
      await flushEffects();
      expect(parent.textContent).toBe("ada@example.test");

      await form.setValue("email", "grace@example.test");
      await flushEffects();
      expect(parent.textContent).toBe("grace@example.test");
    } finally {
      dispose();
    }
  });

  it("re-shows a hidden field array and keeps stable row keys", async () => {
    const form = createForm({ initialValues: { tags: ["alpha"] } });
    const visible = cell(true);
    const parent = document.createElement("div");
    const marker = document.createComment("rows");
    parent.append(marker);

    const dispose = insertDynamic(parent, marker, () => {
      if (!visible.get()) {
        return null;
      }

      const text = document.createTextNode("");
      bindText(text, () =>
        form
          .fieldArray("tags")
          .fields.get()
          .map((row) => `${row.key}=${String(row.value)}`)
          .join(","),
      );
      return text;
    });

    try {
      await flushEffects();
      const initialText = parent.textContent;

      visible.set(false);
      await flushEffects();
      await form.fieldArray("tags").append("beta");
      visible.set(true);
      await flushEffects();

      expect(initialText).toBe("tags:0=alpha");
      expect(parent.textContent).toBe("tags:0=alpha,tags:1=beta");
    } finally {
      dispose();
    }
  });
});
