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

    for (const row of [...rows].reverse()) {
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

  it("rejects row child count mismatch", () => {
    const context = createBenchmarkDom();
    const host = context.document.createElement("div");
    const rows = createRowsData(2);

    const item = context.document.createElement("div");
    item.dataset.key = String(rows[0]!.id);
    item.textContent = rows[0]!.label;
    host.append(item);

    expect(() => validateRows(host, rows)).toThrow(
      "expected 2 rows, received 1",
    );
  });

  it("rejects row key mismatch with row index and received value", () => {
    const context = createBenchmarkDom();
    const host = context.document.createElement("div");
    const rows = createRowsData(1);

    const item = context.document.createElement("div");
    item.dataset.key = "999";
    item.textContent = rows[0]!.label;
    host.append(item);

    expect(() => validateRows(host, rows)).toThrow(
      "row 0 expected data-key 0, received 999",
    );
  });

  it("rejects row label mismatch with row index and received value", () => {
    const context = createBenchmarkDom();
    const host = context.document.createElement("div");
    const rows = createRowsData(1);

    const item = context.document.createElement("div");
    item.dataset.key = String(rows[0]!.id);
    item.textContent = "Wrong";
    host.append(item);

    expect(() => validateRows(host, rows)).toThrow(
      "row 0 expected label Row 0, received Wrong",
    );
  });

  it("rejects text node value mismatch", () => {
    const context = createBenchmarkDom();
    const nodes = [
      context.document.createTextNode("7"),
      context.document.createTextNode("8"),
    ];

    expect(() => validateTextNodes(nodes, "7")).toThrow(
      "text node 1 expected 7, received 8",
    );
  });
});
