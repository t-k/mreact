import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { expect, test, type Page, type Route } from "@playwright/test";
import { buildApp } from "../dist/build.js";
import { startServer } from "../dist/serve.js";

// The initial document keeps no hydratable HTML in history, so traversing back to it refetches
// the page. These sessions pin what happens when that refetch is overtaken or refused.

async function startFixture() {
  const root = await mkdtemp(join(tmpdir(), "mreact-history-refetch-"));
  const appDir = join(root, "app");
  const outDir = join(root, "build");
  const files: Record<string, string> = {
    "Counter.tsx": `import { cell } from "@reckona/mreact-reactive-core";
export function Counter() { const count=cell(0); return <button onClick={()=>count.set(n=>n+1)}>count: {count.get()}</button>; }`,
    "layout.tsx": `import { Link } from "@reckona/mreact-router";
export default function Layout() { return <section><nav id="shell"><Link href="/">Home</Link><Link href="/other">Other</Link><Link href="/third">Third</Link></nav><Slot /></section>; }`,
  };
  for (const [path, title] of [
    ["", "Home"],
    ["other/", "Other"],
    ["third/", "Third"],
  ]) {
    files[`${path}page.tsx`] = `import { Counter } from "${path ? "../" : "./"}Counter";
export default function Page() { return <main><h1>${title}</h1><Counter /></main>; }`;
  }
  for (const [path, code] of Object.entries(files)) {
    await mkdir(dirname(join(appDir, path)), { recursive: true });
    await writeFile(join(appDir, path), code);
  }
  await buildApp({ appDir, outDir });
  const server = await startServer({ outDir, port: 0 });
  return {
    url: server.url,
    close: async () => {
      await server.close();
      await rm(root, { recursive: true, force: true });
    },
  };
}

const isHomeRefetch = (route: Route) => {
  const request = route.request();
  return (
    new URL(request.url()).pathname === "/" && request.headers()["x-mreact-navigation"] === "1"
  );
};

async function expectInteractive(page: Page, title: string) {
  await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
  const counterButton = page.getByRole("button", { name: /^count: / });
  const count = Number((await counterButton.textContent())?.split(":")[1]);
  await counterButton.click();
  await expect(counterButton).toHaveText(`count: ${count + 1}`);
}

const markDocument = (page: Page) =>
  page.evaluate(() => {
    (window as any).__sessionDocument = document;
  });
const sameDocument = (page: Page) =>
  page.evaluate(() => (window as any).__sessionDocument === document);

test("a link navigation during a history refetch wins over the refetched entry", async ({ page }) => {
  const fixture = await startFixture();
  let releaseRefetch: (() => void) | undefined;
  const refetchHeld = new Promise<void>((resolve) => {
    releaseRefetch = resolve;
  });
  let heldRefetches = 0;
  try {
    await page.route("**/*", async (route) => {
      if (isHomeRefetch(route)) {
        heldRefetches += 1;
        await refetchHeld;
      }
      await route.continue();
    });
    await page.goto(fixture.url);
    await markDocument(page);
    await page.getByRole("link", { name: "Other", exact: true }).click();
    await expectInteractive(page, "Other");
    await page.goBack();
    await expect.poll(() => heldRefetches).toBe(1);
    await expect(page).toHaveURL(/\/$/);

    await page.getByRole("link", { name: "Third", exact: true }).click();
    await expectInteractive(page, "Third");
    await expect(page).toHaveURL(/\/third$/);
    const entryId = await page.evaluate(() => history.state?.__mreactEntryId);
    releaseRefetch?.();
    await page.waitForTimeout(300);

    // The overtaken refetch neither replaces the document nor rewrites the current entry.
    await expect(page.getByRole("heading", { name: "Third", exact: true })).toBeVisible();
    await expect(page).toHaveURL(/\/third$/);
    await expect(page.evaluate(() => history.state?.__mreactEntryId)).resolves.toBe(entryId);
    await expect(page.evaluate(() => history.state?.url)).resolves.toMatch(/\/third$/);
    await expect(sameDocument(page)).resolves.toBe(true);
    await expect(
      page.evaluate(() => document.documentElement.hasAttribute("data-mreact-navigation-pending")),
    ).resolves.toBe(false);

    await page.goBack();
    await expectInteractive(page, "Home");
    await expect(sameDocument(page)).resolves.toBe(true);
  } finally {
    await fixture.close();
  }
});

test("an overtaken refetch does not clear the pending state of the navigation in flight", async ({
  page,
}) => {
  const fixture = await startFixture();
  const holds = new Map<string, () => void>();
  const held = (key: string) =>
    new Promise<void>((resolve) => {
      holds.set(key, resolve);
    });
  const pendingAttribute = () =>
    page.evaluate(() => document.documentElement.hasAttribute("data-mreact-navigation-pending"));
  try {
    await page.route("**/*", async (route) => {
      const request = route.request();
      const pathname = new URL(request.url()).pathname;
      if (request.headers()["x-mreact-navigation"] === "1" && (pathname === "/" || pathname === "/third")) {
        await held(pathname);
      }
      await route.continue();
    });
    await page.goto(fixture.url);
    await markDocument(page);
    await page.getByRole("link", { name: "Other", exact: true }).click();
    await expectInteractive(page, "Other");
    await page.goBack();
    await expect.poll(() => holds.has("/")).toBe(true);
    await expect(pendingAttribute()).resolves.toBe(true);

    await page.getByRole("link", { name: "Third", exact: true }).click();
    await expect.poll(() => holds.has("/third")).toBe(true);
    holds.get("/")?.();
    await page.waitForTimeout(300);

    // The refetch was overtaken, but the link navigation is still in flight and still pending.
    await expect(pendingAttribute()).resolves.toBe(true);
    await expect(page.getByRole("heading", { name: "Other", exact: true })).toBeVisible();

    holds.get("/third")?.();
    await expectInteractive(page, "Third");
    await expect(pendingAttribute()).resolves.toBe(false);
    await expect(sameDocument(page)).resolves.toBe(true);
  } finally {
    await fixture.close();
  }
});

test("a second traversal during a history refetch keeps its own entry", async ({ page }) => {
  const fixture = await startFixture();
  let releaseRefetch: (() => void) | undefined;
  const refetchHeld = new Promise<void>((resolve) => {
    releaseRefetch = resolve;
  });
  let heldRefetches = 0;
  try {
    await page.route("**/*", async (route) => {
      if (isHomeRefetch(route)) {
        heldRefetches += 1;
        await refetchHeld;
      }
      await route.continue();
    });
    await page.goto(fixture.url);
    await markDocument(page);
    await page.getByRole("link", { name: "Other", exact: true }).click();
    await expectInteractive(page, "Other");
    await page.getByRole("link", { name: "Third", exact: true }).click();
    await expectInteractive(page, "Third");
    await page.goBack();
    await expectInteractive(page, "Other");
    await page.goBack();
    await expect.poll(() => heldRefetches).toBe(1);
    await page.goForward();
    await expectInteractive(page, "Other");
    const entryId = await page.evaluate(() => history.state?.__mreactEntryId);
    releaseRefetch?.();
    await page.waitForTimeout(300);

    await expect(page.getByRole("heading", { name: "Other", exact: true })).toBeVisible();
    await expect(page).toHaveURL(/\/other$/);
    await expect(page.evaluate(() => history.state?.__mreactEntryId)).resolves.toBe(entryId);
    await expect(sameDocument(page)).resolves.toBe(true);
    // The synchronous restore does not own navigation state, so the overtaken refetch settles it.
    await expect(
      page.evaluate(() => document.documentElement.hasAttribute("data-mreact-navigation-pending")),
    ).resolves.toBe(false);
    await page.goBack();
    await expectInteractive(page, "Home");
  } finally {
    await fixture.close();
  }
});

test("a history refetch the runtime refuses falls back to a document reload", async ({ page }) => {
  const fixture = await startFixture();
  try {
    await page.route("**/*", async (route) => {
      if (isHomeRefetch(route)) {
        await route.fulfill({ status: 200, headers: { "x-mreact-navigation": "reload" }, body: "" });
        return;
      }
      await route.continue();
    });
    await page.goto(fixture.url);
    await markDocument(page);
    await page.getByRole("link", { name: "Other", exact: true }).click();
    await expectInteractive(page, "Other");
    await page.goBack();

    await expectInteractive(page, "Home");
    await expect(page).toHaveURL(/\/$/);
    await expect(sameDocument(page)).resolves.toBe(false);
  } finally {
    await fixture.close();
  }
});
