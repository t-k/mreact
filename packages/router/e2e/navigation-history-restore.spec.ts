import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { expect, test } from "@playwright/test";
import { buildApp } from "../dist/build.js";
import { startServer } from "../dist/serve.js";

for (const mode of ["native", "compat"]) {
  test(`history restore brings back the nested layout, title and interactivity in ${mode}`, async ({
    page,
  }) => {
    const root = await mkdtemp(join(tmpdir(), "mreact-history-restore-"));
    const appDir = join(root, "app");
    const outDir = join(root, "build");
    const counter =
      mode === "native"
        ? `import { cell } from "@reckona/mreact-reactive-core";
export function Counter() { const count=cell(0); return <button onClick={()=>count.set(n=>n+1)}>count: {count.get()}</button>; }`
        : `import { useState } from "@reckona/mreact-compat/hooks";
export function Counter() { const [count,setCount]=useState(0); return <button onClick={()=>setCount(n=>n+1)}>count: {count}</button>; }`;
    const counterFile = mode === "native" ? "Counter.tsx" : "Counter.compat.tsx";
    const counterModule = counterFile.replace(/\.tsx$/, "");
    const files: Record<string, string> = {
      [counterFile]: counter,
      "layout.tsx": `import { Link } from "@reckona/mreact-router";
export default function Layout() { return <section><nav id="shell"><Link href="/">Home</Link><Link href="/docs">Docs</Link></nav><Slot /></section>; }`,
      "docs/layout.tsx": `export default function DocsLayout() { return <aside id="docs-shell"><p>Docs shell</p><Slot /></aside>; }`,
      "page.tsx": `import { Counter } from "./${counterModule}";
export const metadata = { title: "Home title" };
export default function Page() { return <main><h1>Home</h1><Counter /></main>; }`,
      "docs/page.tsx": `import { Counter } from "../${counterModule}";
export const metadata = { title: "Docs title" };
export default function Page() { return <main><h1>Docs</h1><Counter /></main>; }`,
    };
    for (const [path, code] of Object.entries(files)) {
      await mkdir(dirname(join(appDir, path)), { recursive: true });
      await writeFile(join(appDir, path), code);
    }
    let close: (() => Promise<void>) | undefined;
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const clickCounter = async () => {
      const counterButton = page.getByRole("button", { name: /^count: / });
      const count = Number((await counterButton.textContent())?.split(":")[1]);
      await counterButton.click();
      await expect(counterButton).toHaveText(`count: ${count + 1}`);
    };
    const expectPage = async (title: string, docsShell: boolean) => {
      await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
      await expect(page).toHaveTitle(`${title} title`);
      await expect(page.locator("#docs-shell")).toHaveCount(docsShell ? 1 : 0);
      await expect(page.locator("#shell")).toHaveCount(1);
      await expect(
        page.evaluate(() => (window as any).__sessionDocument === document),
      ).resolves.toBe(true);
      await clickCounter();
    };
    try {
      await buildApp({ appDir, outDir });
      const server = await startServer({ outDir, port: 0 });
      close = () => server.close();
      await page.goto(server.url);
      await page.evaluate(() => {
        (window as any).__sessionDocument = document;
      });
      await expectPage("Home", false);
      await page.getByRole("link", { name: "Docs", exact: true }).click();
      await expectPage("Docs", true);
      await page.goBack();
      await expectPage("Home", false);
      await page.goForward();
      await expectPage("Docs", true);
      expect(errors).toEqual([]);
    } finally {
      await close?.();
      await rm(root, { recursive: true, force: true });
    }
  });
}
