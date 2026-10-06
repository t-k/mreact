import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { expect, test } from "@playwright/test";
import { buildApp } from "../dist/build.js";
import { startServer } from "../dist/serve.js";

let directory: string;
let server: Awaited<ReturnType<typeof startServer>>;
let navigationRuntimeUrl: string;
test.beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), "mreact-navigation-ownership-"));
  const appDir = join(directory, "app");
  const files: Record<string, string> = {
    "layout.tsx": 'export default function Layout() { return <section><nav><a href="/a" data-mreact-prefetch="none" data-mreact-transition="auto">A</a><a href="/b" data-mreact-prefetch="none">B</a></nav><Slot /></section>; }',
  };
  for (const [path, title] of [["", "Home"], ["a/", "A"], ["b/", "B"]]) {
    files[`${path}page.tsx`] = `import { cell } from "@reckona/mreact-reactive-core";
export default function Page() { const count = cell(0); return <main><h1>${title}</h1><a href="/" data-mreact-prefetch="none">Home</a><button onClick={() => count.set(n => n + 1)}>{count.get()}</button></main>; }`;
  }
  for (const [path, code] of Object.entries(files)) {
    await mkdir(dirname(join(appDir, path)), { recursive: true });
    await writeFile(join(appDir, path), code);
  }
  await buildApp({ appDir, outDir: join(directory, "build") });
  server = await startServer({ outDir: join(directory, "build"), port: 0 });
  const manifest = JSON.parse(await readFile(join(directory, "build/client/manifest.json"), "utf8"));
  navigationRuntimeUrl = new URL(`/_mreact/client/${manifest.navigationScript}`, server.url).href;
});
test.afterAll(async () => { await server?.close(); await rm(directory, { force: true, recursive: true }); });

for (const oldCompletion of ["success", "failure"]) {
  test(`a late ${oldCompletion} cannot replace the latest page or trigger a document fallback`, async ({ page }) => {
    let release!: () => void;
    let held = false;
    await page.route("**/a", async (route) => {
      if (route.request().headers()["x-mreact-navigation"] === "1") {
        held = true;
        await new Promise<void>((resolve) => { release = resolve; });
        if (oldCompletion === "failure") { await route.abort("failed"); return; }
      }
      await route.continue();
    });
    await page.goto(server.url);
    await page.waitForFunction(() => document.documentElement.hasAttribute("data-mreact-hydrated"));
    const documentRequests: string[] = [];
    page.on("request", (request) => { if (request.isNavigationRequest()) documentRequests.push(request.url()); });
    await page.evaluate(() => { (window as any).__ownershipDocument = document; });
    const historyLength = await page.evaluate(() => history.length);
    await page.getByRole("link", { name: "A", exact: true }).click();
    await expect.poll(() => held).toBe(true);
    await page.getByRole("link", { name: "B", exact: true }).click();
    await expect(page.getByRole("heading")).toHaveText("B");
    release();
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveURL(/\/b$/);
    await expect(page.getByRole("heading")).toHaveText("B");
    expect(await page.evaluate(() => (window as any).__ownershipDocument === document)).toBe(true);
    expect(await page.evaluate(() => history.length)).toBe(historyLength + 1);
    expect(documentRequests).toEqual([]);
    await page.getByRole("button").click();
    await expect(page.getByRole("button")).toHaveText("1");
  });
}

test("the earlier completion leaves the latest pending state intact", async ({ page }) => {
  const releases = new Map<string, () => void>();
  await page.route("**/*", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (route.request().headers()["x-mreact-navigation"] === "1" && (path === "/a" || path === "/b")) {
      await new Promise<void>((resolve) => { releases.set(path, resolve); });
    }
    await route.continue();
  });
  await page.goto(server.url);
  await page.waitForFunction(() => document.documentElement.hasAttribute("data-mreact-hydrated"));
  await page.getByRole("link", { name: "A", exact: true }).click();
  await expect.poll(() => releases.has("/a")).toBe(true);
  await page.getByRole("link", { name: "B", exact: true }).click();
  await expect.poll(() => releases.has("/b")).toBe(true);
  releases.get("/a")!();
  await page.waitForTimeout(100);
  await expect(page.locator("html")).toHaveAttribute("data-mreact-navigation-pending", "true");
  await expect(page.locator("html")).toHaveAttribute("data-mreact-navigation-to", `${server.url}/b`);
  await expect(page.getByRole("heading")).toHaveText("Home");
  releases.get("/b")!();
  await expect(page.getByRole("heading")).toHaveText("B");
  await expect(page.locator("html")).not.toHaveAttribute("data-mreact-navigation-pending");
});

test("a delayed view transition callback cannot move the page or history backwards", async ({ page }) => {
  await page.goto(server.url);
  await page.waitForFunction(() => document.documentElement.hasAttribute("data-mreact-hydrated"));
  await page.evaluate(() => {
    document.startViewTransition = ((callback: () => void) => {
      let done!: () => void;
      const updateCallbackDone = new Promise<void>((resolve) => { done = resolve; });
      (window as any).__releaseOwnershipTransition = () => { callback(); done(); };
      return { updateCallbackDone, ready: Promise.resolve(), finished: Promise.resolve() };
    }) as any;
  });
  await page.getByRole("link", { name: "A", exact: true }).click();
  await page.waitForFunction(() => typeof (window as any).__releaseOwnershipTransition === "function");
  await page.getByRole("link", { name: "B", exact: true }).click();
  await expect(page.getByRole("heading")).toHaveText("B");
  await page.evaluate(() => (window as any).__releaseOwnershipTransition());
  await page.waitForLoadState("networkidle");
  await expect(page).toHaveURL(/\/b$/);
  await expect(page.getByRole("heading")).toHaveText("B");
});

test("a history gesture during the first runtime import supersedes an earlier link gesture", async ({ page }) => {
  let release!: () => void;
  let held = false;
  await page.route("**/*.js", async (route) => {
    if (route.request().url() === navigationRuntimeUrl) {
      held = true;
      await new Promise<void>((resolve) => { release = resolve; });
    }
    await route.continue();
  });
  await page.goto(server.url);
  await page.waitForFunction(() => document.documentElement.hasAttribute("data-mreact-hydrated"));
  expect(await page.evaluate(() => new URL(JSON.parse(document.getElementById("mreact-navigation-runtime")!.textContent!).script, location.href).href)).toBe(navigationRuntimeUrl);
  await page.getByRole("link", { name: "A", exact: true }).click();
  await expect.poll(() => held).toBe(true);
  await page.evaluate(() => {
    const state = { __mreact: true, url: new URL("/b", location.href).href, scrollX: 0, scrollY: 0 };
    history.replaceState(state, "", "/b");
    dispatchEvent(new PopStateEvent("popstate", { state }));
  });
  release();
  await expect(page.getByRole("heading")).toHaveText("B");
  await page.waitForLoadState("networkidle");
  await expect(page).toHaveURL(/\/b$/);
  await expect(page.getByRole("heading")).toHaveText("B");
});

test("a link during the first runtime import supersedes an earlier history gesture", async ({ page }) => {
  let release!: () => void;
  let held = false;
  await page.route("**/*.js", async (route) => {
    if (route.request().url() === navigationRuntimeUrl) {
      held = true;
      await new Promise<void>((resolve) => { release = resolve; });
    }
    await route.continue();
  });
  await page.goto(server.url);
  await page.waitForFunction(() => document.documentElement.hasAttribute("data-mreact-hydrated"));
  await expect.poll(() => held).toBe(true);
  await page.evaluate(() => {
    const state = { __mreact: true, url: new URL("/a", location.href).href, scrollX: 0, scrollY: 0 };
    history.replaceState(state, "", "/a");
    dispatchEvent(new PopStateEvent("popstate", { state }));
  });
  await page.getByRole("link", { name: "B", exact: true }).click();
  release();
  await expect(page.getByRole("heading")).toHaveText("B");
  await page.waitForLoadState("networkidle");
  await expect(page).toHaveURL(/\/b$/);
  await expect(page.getByRole("heading")).toHaveText("B");
});
