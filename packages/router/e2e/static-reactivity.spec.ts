import { mkdir, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { buildApp } from "../dist/build.js";
import { startServer } from "../dist/serve.js";
import {
  clientDeliveryFixtures,
  materializeClientDeliveryFixture,
} from "../../../size/fixtures.js";

const repositoryRoot = fileURLToPath(new URL("../../..", import.meta.url));

test("a closed direct-cell route updates its existing button and text node", async ({ page }) => {
  const fixture = clientDeliveryFixtures.find(
    (entry) => entry.name === "native-counter-no-navigation",
  );
  expect(fixture).toBeDefined();
  if (fixture === undefined) return;

  const workDir = join(repositoryRoot, "test-results", "static-reactivity-e2e");
  await rm(workDir, { force: true, recursive: true });
  await mkdir(workDir, { recursive: true });
  const project = await materializeClientDeliveryFixture(fixture, workDir);
  const previousNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";

  try {
    await buildApp({
      appDir: project.appDir,
      outDir: project.outDir,
      projectRoot: project.projectRoot,
    });
  } finally {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
  }

  const server = await startServer({ outDir: project.outDir, port: 0 });
  try {
    await page.goto(server.url);
    await page.waitForFunction(() => document.documentElement.hasAttribute("data-mreact-hydrated"));
    const button = page.getByRole("button");
    await expect(button).toHaveText("count: 0");
    await button.evaluate((element) => {
      (
        window as typeof window & {
          __mreactCounterButton?: Element;
          __mreactCounterText?: ChildNode;
        }
      ).__mreactCounterButton = element;
      (window as typeof window & { __mreactCounterText?: ChildNode }).__mreactCounterText =
        element.lastChild ?? undefined;
    });

    await button.click();
    await expect(button).toHaveText("count: 1");
    await button.click();
    await expect(button).toHaveText("count: 2");
    expect(
      await button.evaluate((element) => {
        const host = window as typeof window & {
          __mreactCounterButton?: Element;
          __mreactCounterText?: ChildNode;
        };
        return (
          host.__mreactCounterButton === element &&
          host.__mreactCounterText === element.lastChild &&
          document.activeElement === element
        );
      }),
    ).toBe(true);
  } finally {
    await server.close();
    await rm(workDir, { force: true, recursive: true });
  }
});

test("a fixed route preserves an imported SSR title and lazily loads its mount fallback", async ({
  page,
}) => {
  const base = clientDeliveryFixtures.find(
    (entry) => entry.name === "native-counter-no-navigation",
  );
  expect(base).toBeDefined();
  if (base === undefined) return;

  const workDir = join(repositoryRoot, "test-results", "static-attach-e2e");
  await rm(workDir, { force: true, recursive: true });
  await mkdir(workDir, { recursive: true });
  const fixture = {
    ...base,
    name: "native-attach-e2e",
    files: {
      ...base.files,
      "src/app/legal-copy.ts": 'export const legalText = "Legal notice rendered on the server";',
      "src/app/page.tsx": `import { cell } from "@reckona/mreact-reactive-core";
import { legalText } from "./legal-copy";
export const clientNavigation = false;
export default function Page() {
  const count = cell(0);
  return <main><p>Long content rendered only on the server</p><button type="button" title={legalText} onClick={() => count.set(value => value + 1)}>{count.get()}</button></main>;
}`,
    },
  };
  const project = await materializeClientDeliveryFixture(fixture, workDir);
  const previousNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  try {
    await buildApp({
      appDir: project.appDir,
      outDir: project.outDir,
      projectRoot: project.projectRoot,
    });
  } finally {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
  }

  const server = await startServer({ outDir: project.outDir, port: 0 });
  try {
    const manifest = JSON.parse(
      await readFile(join(project.outDir, "client", "manifest.json"), "utf8"),
    ) as { routes: Array<{ path: string; dynamicImports?: string[] }> };
    const deferredChunks =
      manifest.routes.find((route) => route.path === "/")?.dynamicImports ?? [];
    expect(deferredChunks.length).toBeGreaterThan(0);
    const requestedAssets: string[] = [];
    page.on("request", (request) => requestedAssets.push(new URL(request.url()).pathname));
    await page.addInitScript(() => {
      const host = window as typeof window & {
        __mreactSsrButton?: Element;
        __mreactSsrText?: ChildNode;
      };
      new MutationObserver(() => {
        const button = document.querySelector("button");
        if (button !== null && host.__mreactSsrButton === undefined) {
          host.__mreactSsrButton = button;
          host.__mreactSsrText = button.firstChild ?? undefined;
        }
      }).observe(document, { childList: true, subtree: true });
    });
    await page.goto(server.url);
    await page.waitForFunction(() => document.documentElement.hasAttribute("data-mreact-hydrated"));
    const marker = page.locator("[data-mreact-route-id]");
    await expect(marker).toHaveAttribute("data-mreact-attach-script", /assets\/routes\//);
    const button = page.getByRole("button");
    await expect(button).toHaveText("0");
    await expect(button).toHaveAttribute("title", "Legal notice rendered on the server");
    expect(
      await button.evaluate((element) => {
        const host = window as typeof window & {
          __mreactSsrButton?: Element;
          __mreactSsrText?: ChildNode;
        };
        return host.__mreactSsrButton === element && host.__mreactSsrText === element.firstChild;
      }),
    ).toBe(true);
    expect(
      requestedAssets.some((path) => deferredChunks.some((chunk) => path.endsWith(chunk))),
    ).toBe(false);
    await button.evaluate((element) => {
      (window as typeof window & { __mreactAttachedButton?: Element }).__mreactAttachedButton =
        element;
    });
    await button.click();
    await expect(button).toHaveText("1");
    expect(
      await button.evaluate(
        (element) =>
          (window as typeof window & { __mreactAttachedButton?: Element })
            .__mreactAttachedButton === element && document.activeElement === element,
      ),
    ).toBe(true);

    await page.route(server.url, async (route) => {
      const response = await route.fetch();
      const html = await response.text();
      expect(html).toContain("data-mreact-attach-script");
      await route.fulfill({
        response,
        body: html.replace(
          /data-mreact-attach-script="[^"]+"/u,
          'data-mreact-attach-script="stale-build"',
        ),
      });
    });
    await page.reload();
    await page.waitForFunction(() => document.documentElement.hasAttribute("data-mreact-hydrated"));
    await expect(button).toHaveText("0");
    await expect(button).toHaveAttribute("title", "Legal notice rendered on the server");
    await button.click();
    await expect(button).toHaveText("1");
    expect(
      requestedAssets.some((path) => deferredChunks.some((chunk) => path.endsWith(chunk))),
    ).toBe(true);
  } finally {
    await server.close();
    await rm(workDir, { force: true, recursive: true });
  }
});

test("an imported SSR title survives client navigation into an attach route", async ({ page }) => {
  const base = clientDeliveryFixtures.find(
    (entry) => entry.name === "native-counter-no-navigation",
  );
  expect(base).toBeDefined();
  if (base === undefined) return;

  const workDir = join(repositoryRoot, "test-results", "static-attach-navigation-e2e");
  await rm(workDir, { force: true, recursive: true });
  await mkdir(workDir, { recursive: true });
  const fixture = {
    ...base,
    name: "native-attach-navigation-e2e",
    files: {
      ...base.files,
      "src/app/page.tsx": `import { cell } from "@reckona/mreact-reactive-core";
export default function Home() {
  const count = cell(0);
  return <main><a href="/about">About</a><button onClick={() => count.set(value => value + 1)}>{count.get()}</button></main>;
}`,
      "src/app/about/legal-copy.ts": 'export const legalText = "About notice";',
      "src/app/about/page.tsx": `import { cell } from "@reckona/mreact-reactive-core";
import { legalText } from "./legal-copy";
export const clientNavigation = false;
export default function About() {
  const count = cell(0);
  return <button title={legalText} onClick={() => count.set(value => value + 1)}>{count.get()}</button>;
}`,
    },
  };
  const project = await materializeClientDeliveryFixture(fixture, workDir);
  const previousNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  try {
    await buildApp({
      appDir: project.appDir,
      outDir: project.outDir,
      projectRoot: project.projectRoot,
    });
  } finally {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
  }

  const server = await startServer({ outDir: project.outDir, port: 0 });
  try {
    await page.goto(server.url);
    await page.waitForFunction(() => document.documentElement.hasAttribute("data-mreact-hydrated"));
    await page.evaluate(() => {
      (window as typeof window & { __mreactNavigationMarker?: object }).__mreactNavigationMarker =
        {};
    });
    await page.getByRole("link", { name: "About" }).click();
    await expect(page).toHaveURL(/\/about$/u);
    const button = page.getByRole("button");
    await expect(button).toHaveAttribute("title", "About notice");
    expect(
      await page.evaluate(
        () =>
          (window as typeof window & { __mreactNavigationMarker?: object })
            .__mreactNavigationMarker !== undefined,
      ),
    ).toBe(true);
    await button.click();
    await expect(button).toHaveText("1");
  } finally {
    await server.close();
    await rm(workDir, { force: true, recursive: true });
  }
});
