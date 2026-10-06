// @vitest-environment happy-dom

import { expect, test } from "vitest";
import { flushEffects } from "@reckona/mreact-reactive-core/testing";
import { transform } from "../src/index.js";
import { runClientComponent } from "./helpers.js";

import { keyedPropertyTextSource } from "./fixtures/keyed-property-text.js";

test.each([0, 1, 2, 3, 4, 5, 6, 7, 8])("refreshes all %i direct property texts and disposes promoted getters", async (count) => {
  const output = transform({ code: keyedPropertyTextSource(count), filename: "App.tsx", target: "client", dev: false });
  expect(output.diagnostics).toEqual([]);
  expect(output.code.match(/\bbindCompilerKeyedPropertyText\(/gu) ?? []).toHaveLength(count);
  const node = await runClientComponent(output.code) as HTMLElement;
  const row = node.querySelector("tr")!;
  const values = (prefix: string) => Array.from({ length: count }, (_, index) => `${prefix}:p${index + 1}`);
  const texts = () => Array.from(row.cells, (element) => element.textContent);
  expect(texts()).toEqual(values("old"));
  for (const [id, prefix] of [["replace", "new"], ["reactive", "getter"], ["suffix", "updated"], ["replace", "new"]]) {
    node.querySelector<HTMLButtonElement>(`#${id}`)!.click();
    await flushEffects();
    expect(node.querySelector("tr")).toBe(row);
    expect(texts()).toEqual(values(prefix!));
  }
  node.querySelector<HTMLButtonElement>("#reactive")!.click();
  await flushEffects();
  expect(texts()).toEqual(values("updated"));
  node.querySelector<HTMLButtonElement>("#clear")!.click();
  await flushEffects();
  node.querySelector<HTMLButtonElement>("#suffix")!.click();
  await flushEffects();
  expect(node.querySelector("tr")).toBeNull();
  expect(texts()).toEqual(values("updated"));
});
