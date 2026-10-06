import { expect, test } from "@playwright/test";
import { buildNativeReviewFixture } from "../../../benchmarks/primitive-browser/review-native-fixture.js";
import { keyedPropertyTextSource } from "../../compiler/test/fixtures/keyed-property-text.js";

for (const count of [3, 4, 5, 6, 7, 8]) {
  test(`compiled keyed rows refresh ${count} plain properties and dispose promoted getters`, async ({ page }) => {
    const fixture = await buildNativeReviewFixture(keyedPropertyTextSource(count), `
import { App } from "./compiled.js";
import { flushEffects } from "@reckona/mreact-reactive-core/testing";
document.querySelector("#root").append(App());
window.__flushNativeReview = flushEffects;
`);
    expect(fixture.generatedCode.match(/\bbindCompilerKeyedPropertyText\(/gu)).toHaveLength(count);
    await page.setContent('<div id="root"></div>');
    await page.addScriptTag({ content: fixture.bundle, type: "module" });
    const cells = page.locator("tbody td");
    const values = (prefix: string) => Array.from({ length: count }, (_, index) => `${prefix}:p${index + 1}`);
    await expect(cells).toHaveText(values("old"));
    await page.evaluate(() => { (window as any).__nativeReviewRow = document.querySelector("tr"); });
    for (const [id, prefix] of [["replace", "new"], ["reactive", "getter"], ["suffix", "updated"], ["replace", "new"]]) {
      await page.locator(`#${id}`).click();
      await page.evaluate(() => (window as any).__flushNativeReview());
      await expect(cells).toHaveText(values(prefix!));
      expect(await page.evaluate(() => (window as any).__nativeReviewRow === document.querySelector("tr"))).toBe(true);
    }
    await page.locator("#reactive").click();
    await page.evaluate(() => (window as any).__flushNativeReview());
    await expect(cells).toHaveText(values("updated"));
    await page.locator("#clear").click();
    await page.evaluate(() => (window as any).__flushNativeReview());
    await expect(page.locator("tr")).toHaveCount(0);
    await page.locator("#suffix").click();
    await page.evaluate(() => (window as any).__flushNativeReview());
    expect(await page.evaluate(() => Array.from((window as any).__nativeReviewRow.cells, (element: any) => element.textContent))).toEqual(values("updated"));
  });
}
