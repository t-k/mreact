import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { buildApp } from "../dist/build.js";
import { startServer } from "../dist/serve.js";

test("client navigation preserves layouts, restores history snapshots, and reuses prefetched HTML", async ({
  page,
}) => {
  const rootDir = await mkdtemp(join(tmpdir(), "mreact-app-router-e2e-"));
  const appDir = join(rootDir, "app");
  const outDir = join(rootDir, ".mreact");
  await mkdir(join(appDir, "about"), { recursive: true });
  await writeFile(
    join(appDir, "layout.tsx"),
    `export default function Layout() {
  return <section id="root-layout"><header id="app-shell">Shell</header><slot /></section>;
}`,
  );
  await writeFile(
    join(appDir, "page.tsx"),
    `import { cell } from "@modular-react/reactive-core";

export default function Page() {
  const count = cell(0);
  return <main style="min-height: 1600px; padding-top: 48px"><h1>Home</h1><a href="/about" style="position: fixed; top: 0; left: 0">About</a><button type="button" onClick={() => count.set(value => value + 1)}>count: {count.get()}</button></main>;
}`,
  );
  await writeFile(
    join(appDir, "about", "page.tsx"),
    `export default function About() {
  return <main style="min-height: 1600px"><h1>About</h1><a href="/">Home</a></main>;
}`,
  );

  await buildApp({ appDir, outDir });
  const server = await startServer({ outDir, port: 0 });

  try {
    await page.goto(server.url);
    await expect(page.getByRole("heading", { name: "Home" })).toBeVisible();
    await page.getByRole("button", { name: "count: 0" }).click();
    await expect(page.getByRole("button", { name: "count: 1" })).toBeVisible();
    await page.evaluate(() => {
      window.scrollTo(0, 400);
      window.__mreactE2eShell = document.getElementById("app-shell");
    });

    await page.getByRole("link", { name: "About" }).hover();
    await page.getByRole("link", { name: "About" }).click();
    await expect(page.getByRole("heading", { name: "About" })).toBeVisible();
    await expect(
      page.evaluate(() => document.getElementById("app-shell") === window.__mreactE2eShell),
    ).resolves.toBe(true);

    await page.goBack();
    await expect(page.getByRole("heading", { name: "Home" })).toBeVisible();
    await expect(page.getByRole("button", { name: "count: 1" })).toBeVisible();
    await expect(page.evaluate(() => window.scrollY)).resolves.toBe(400);
  } finally {
    await server.close();
    await rm(rootDir, { force: true, recursive: true });
  }
});

declare global {
  interface Window {
    __mreactE2eShell?: HTMLElement | null;
  }
}
