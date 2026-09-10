import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { expect, test } from "@playwright/test";
import { buildApp } from "../dist/build.js";
import { startServer } from "../dist/serve.js";

for (const mode of ["native", "compat"]) {
  test(`hydrates ${mode} counters across consecutive shell navigation and revisits`, async ({
    page,
  }) => {
    const root = await mkdtemp(join(tmpdir(), "mreact-navigation-hydration-"));
    const appDir = join(root, "app");
    const outDir = join(root, "build");
    let close: (() => Promise<void>) | undefined;
    try {
      const counterFile = mode === "native" ? "Counter.tsx" : "Counter.compat.tsx";
      const files: Record<string, string> = {
        [counterFile]:
          mode === "native"
            ? 'import { cell } from "@reckona/mreact-reactive-core"; export function Counter() { const count=cell(0); return <button onClick={()=>count.set(n=>n+1)}>count: {count.get()}</button>; }'
            : 'import { useState } from "@reckona/mreact-compat/hooks"; export function Counter() { const [count,setCount]=useState(0); return <button onClick={()=>setCount(n=>n+1)}>count: {count}</button>; }',
        "layout.tsx":
          'import { Link } from "@reckona/mreact-router"; export default function Layout() { return <section><nav id="shell"><Link href="/">Home</Link><Link href="/other">Other</Link><Link href="/third">Third</Link></nav><Slot /></section>; }',
      };
      for (const [path, title] of [
        ["", "Home"],
        ["other/", "Other"],
        ["third/", "Third"],
      ]) {
        files[`${path}page.tsx`] =
          `import { Counter } from "${path ? "../" : "./"}${counterFile.replace(/\.tsx$/, "")}"; export default function Page() { return <main><h1>${title}</h1><Counter /></main>; }`;
      }
      for (const [path, code] of Object.entries(files)) {
        await mkdir(dirname(join(appDir, path)), { recursive: true });
        await writeFile(join(appDir, path), code);
      }
      await buildApp({ appDir, outDir });
      const server = await startServer({ outDir, port: 0 });
      close = () => server.close();
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto(server.url);
      await page.locator("#shell").evaluate((shell) => {
        Object.defineProperty(shell, "__testIdentity", { value: true });
      });
      for (const title of ["Home", "Other", "Third", "Home", "Third"]) {
        if (title !== "Home" || (await page.locator("h1").textContent()) !== "Home") {
          await page.getByRole("link", { name: title, exact: true }).click();
        }
        await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
        const marker = page.locator("[data-mreact-route-id]");
        await expect(marker).toHaveAttribute("data-mreact-hydrated", "true");
        const button = page.getByRole("button", { name: /^count: / });
        const before = Number((await button.textContent())?.split(":")[1]);
        await button.click();
        await expect(button).toHaveText(`count: ${before + 1}`);
        expect(
          await page
            .locator("#shell")
            .evaluate(
              (shell) => (shell as HTMLElement & { __testIdentity?: boolean }).__testIdentity,
            ),
        ).toBe(true);
        const id = title === "Home" ? "index" : title.toLowerCase();
        const props = await page.locator(`#mreact-props-${id}`).textContent();
        expect(typeof JSON.parse(props ?? "")).toBe("object");
        expect(await page.locator('script[id^="mreact-props-"]').count()).toBe(1);
      }
      expect(errors).toEqual([]);
    } finally {
      await close?.();
      await rm(root, { recursive: true, force: true });
    }
  });
}
