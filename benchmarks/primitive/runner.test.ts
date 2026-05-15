import { describe, expect, it } from "vitest";
import { createBenchmarkDom } from "./dom.js";
import {
  createRowsData,
  validateRows,
  validateRowsReversed,
} from "./fixtures/rows.js";
import { validateTextNodes } from "./fixtures/text-binding.js";

describe("primitive fixtures", () => {
  it("validates row DOM shape", () => {
    const context = createBenchmarkDom();
    const host = context.document.createElement("div");
    const rows = createRowsData(3);

    for (const row of rows) {
      const item = context.document.createElement("div");
      item.dataset.key = String(row.id);
      item.textContent = row.label;
      host.append(item);
    }

    expect(() => validateRows(host, rows)).not.toThrow();
  });

  it("validates reversed keyed DOM shape", () => {
    const context = createBenchmarkDom();
    const host = context.document.createElement("div");
    const rows = createRowsData(3);

    for (const row of rows.toReversed()) {
      const item = context.document.createElement("div");
      item.dataset.key = String(row.id);
      item.textContent = row.label;
      host.append(item);
    }

    expect(() => validateRowsReversed(host, rows)).not.toThrow();
  });

  it("validates text node values", () => {
    const context = createBenchmarkDom();
    const nodes = [
      context.document.createTextNode("7"),
      context.document.createTextNode("7"),
    ];

    expect(() => validateTextNodes(nodes, "7")).not.toThrow();
  });
});
