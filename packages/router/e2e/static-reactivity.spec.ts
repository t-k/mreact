import { mkdir, rm } from "node:fs/promises";
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
