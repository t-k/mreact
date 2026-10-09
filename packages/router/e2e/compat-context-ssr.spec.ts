import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { buildApp } from "../dist/build.js";
import { startServer } from "../dist/serve.js";
import { contextDeliveryFixtures } from "../../../size/context-fixtures.js";
import { materializeClientDeliveryFixture } from "../../../size/fixtures.js";

let root: string;
let url: string;
let close: (() => Promise<void>) | undefined;

test.beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "mreact-context-ssr-browser-"));
  const fixture = contextDeliveryFixtures.find((fixture) => fixture.name === "compat-context-ui")!;
  const project = await materializeClientDeliveryFixture(fixture, root);
  await buildApp(project);
  const server = await startServer({ outDir: project.outDir, port: 0 });
  url = server.url;
  close = () => server.close();
});

test.afterAll(async () => {
  await close?.();
  await rm(root, { recursive: true, force: true });
});

test("shared Context produces initial HTML without JavaScript", async ({ browser, request }) => {
  const response = await request.get(url);
  const html = await response.text();
  expect(response.ok()).toBe(true);
  expect(html).toContain('<output data-value="">light</output>');
  expect(html).toContain('<output data-nested="">nested</output>');
  expect(html).toContain("data-mreact-compat-resume=");
  const context = await browser.newContext({ javaScriptEnabled: false });
  try {
    const page = await context.newPage();
    await page.goto(url);
    await expect(page.locator("[data-value]")).toHaveText("light");
    await expect(page.locator("[data-nested]")).toHaveText("nested");
    await expect(page.locator("[data-action]")).toBeVisible();
  } finally {
    await context.close();
  }
});

test("Context hydration retains DOM, pre-hydration edits and nested provider state", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/_mreact/client/**", async (route) => {
    await gate;
    await route.continue();
  });
  await page.addInitScript({
    content: `
    window.__contextMonitor = { nodes: new Map(), removed: [], forbidden: [] };
    new MutationObserver(records => {
      const state = window.__contextMonitor;
      for (const selector of ["[data-value]", "[data-nested]", "[data-edit]", "[data-action]", "#native"]) {
        const node = document.querySelector(selector);
        if (node && !state.nodes.has(selector)) state.nodes.set(selector, node);
      }
      for (const record of records) for (const node of record.removedNodes) {
        for (const original of state.nodes.values()) {
          if (node === original || node.contains(original)) state.removed.push(original);
        }
      }
      for (const node of document.querySelectorAll('[data-mreact-client-boundary="Panel"]:not([data-mreact-compat-resume])')) {
        state.forbidden.push(node.outerHTML);
      }
    }).observe(document, { subtree: true, childList: true });
  `,
  });
  try {
    await page.goto(url, { waitUntil: "commit" });
    await expect(page.locator("[data-action]")).toBeVisible();
    await page.locator("[data-edit]").fill("typed before hydration");
    await page.locator("[data-edit]").focus();
    release();
    await page.waitForFunction(() => document.documentElement.dataset.mreactHydrated === "true");
    await expect(page.locator("[data-edit]")).toHaveValue("typed before hydration");
    await expect(page.locator("[data-edit]")).toBeFocused();
    await page.locator("[data-action]").click();
    await expect(page.locator("[data-value]")).toHaveText("dark");
    await expect(page.locator("[data-nested]")).toHaveText("nested");
    expect(
      await page.evaluate(() => {
        const state = (window as any).__contextMonitor;
        return {
          nodes: state.nodes.size,
          retained: [...state.nodes.values()].every((node: Node) => node.isConnected),
          removed: state.removed.length,
          forbidden: state.forbidden,
        };
      }),
    ).toEqual({ nodes: 5, retained: true, removed: 0, forbidden: [] });
    await page.getByRole("link", { name: "Other", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Other page" })).toBeVisible();
    expect(
      await page.evaluate(() =>
        [...(window as any).__contextMonitor.nodes.values()].every(
          (node: Node) => !node.isConnected,
        ),
      ),
    ).toBe(true);
    await page.getByRole("link", { name: "Home", exact: true }).click();
    await expect(page.locator("[data-value]")).toHaveText("light");
    await page.locator("[data-action]").click();
    await expect(page.locator("[data-value]")).toHaveText("dark");
    expect(errors).toEqual([]);
  } finally {
    release();
    await page.unrouteAll({ behavior: "wait" });
  }
});
