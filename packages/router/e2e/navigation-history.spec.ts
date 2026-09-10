import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { buildApp } from "../dist/build.js";
import { startServer } from "../dist/serve.js";

for (const repeatedPendingTraversal of [false, true]) {
  test(`history traversal preserves snapshots with ${repeatedPendingTraversal ? "repeated" : "single"} pending traversal`, async ({
    page,
  }) => {
    const root = await mkdtemp(join(tmpdir(), "mreact-history-entries-"));
    const appDir = join(root, "app");
    const outDir = join(root, "build");
    let close: (() => Promise<void>) | undefined;
    let releaseNavigation: (() => void) | undefined;
    try {
      await mkdir(join(appDir, "other"), { recursive: true });
      for (const [path, title, href, link] of [
        ["", "Home", "/other", "Other"],
        ["other/", "Other", "/", "Home"],
      ]) {
        await writeFile(
          join(appDir, `${path}page.tsx`),
          `import { cell } from "@reckona/mreact-reactive-core";
export default function Page() { const count=cell(0); return <main style="min-height:2000px;padding-top:50px"><h1>${title}</h1><button onClick={()=>count.set(n=>n+1)}>count: {count.get()}</button><nav style="position:fixed;top:0"><a href="${href}">${link}</a></nav></main>; }`,
        );
      }
      await buildApp({ appDir, outDir });
      const server = await startServer({ outDir, port: 0 });
      close = () => server.close();
      await page.goto(server.url);
      await page.evaluate(() => {
        document.documentElement.dataset.testDocument = "original";
      });
      const check = async (title: string, scroll: number) => {
        await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
        await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(scroll);
        await expect
          .poll(() =>
            page.evaluate(() => ({
              url: history.state.url,
              html: history.state.html,
              current: location.href,
            })),
          )
          .toMatchObject({
            url: new URL(title === "Home" ? "/" : "/other", server.url).href,
            html: expect.stringContaining(`<h1>${title}</h1>`),
          });
      };
      await page.evaluate(() => window.scrollTo(0, 200));
      await page.getByRole("link", { name: "Other" }).click();
      await expect(page.getByRole("heading", { name: "Other" })).toBeVisible();
      await page.evaluate(() => window.scrollTo(0, 400));
      await page.getByRole("link", { name: "Home" }).click();
      await expect(page.getByRole("heading", { name: "Home" })).toBeVisible();
      await page.evaluate(() => window.scrollTo(0, 700));
      await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(700);
      await page.goBack();
      await check("Other", 400);
      await page.goBack();
      await check("Home", 200);
      await page.goForward();
      await check("Other", 400);
      await page.goForward();
      await check("Home", 700);
      await expect(page.locator("html")).toHaveAttribute("data-test-document", "original");
      const navigationBlocked = new Promise<void>((resolve) => {
        releaseNavigation = resolve;
      });
      let markNavigationRequested!: () => void;
      const navigationRequested = new Promise<void>((resolve) => {
        markNavigationRequested = resolve;
      });
      await page.route("**/__mreact_navigation_runtime.*.js", async (route) => {
        markNavigationRequested();
        await navigationBlocked;
        await route.continue();
      });
      await page.reload();
      await navigationRequested;
      await page.evaluate(() => {
        document.documentElement.dataset.testDocument = "reloaded";
      });
      await page.goBack();
      if (repeatedPendingTraversal) {
        await page.goBack();
      }
      releaseNavigation();
      await check(repeatedPendingTraversal ? "Home" : "Other", repeatedPendingTraversal ? 200 : 400);
      await expect(page.locator("html")).toHaveAttribute("data-test-document", "reloaded");
    } finally {
      releaseNavigation?.();
      await close?.();
      await rm(root, { recursive: true, force: true });
    }
  });
}
