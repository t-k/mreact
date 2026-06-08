import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { startDevServer } from "../dist/dev-server.js";

test("dev hydration failures emit a mreact console diagnostic", async ({ page }) => {
  const rootDir = await mkdtemp(join(tmpdir(), "mreact-hydration-diagnostic-"));
  const appDir = join(rootDir, "app");
  const consoleErrors: string[] = [];

  page.on("console", (message) => {
    if (message.type() === "error") {
      consoleErrors.push(message.text());
    }
  });

  await mkdir(appDir, { recursive: true });
  await writeFile(
    join(appDir, "page.tsx"),
    `import { cell } from "@reckona/mreact-reactive-core";

export default function Page() {
  if (typeof window !== "undefined") {
    throw new Error("client hydrate boom");
  }

  const count = cell(0);
  return <main><h1>Hydration diagnostic</h1><button type="button" onClick={() => count.set((value) => value + 1)}>count: {count.get()}</button></main>;
}`,
  );

  const server = await startDevServer({ appDir, port: 0 });

  try {
    await page.goto(server.url);
    await expect(page.getByRole("heading", { name: "Hydration diagnostic" })).toBeVisible();
    await expect
      .poll(() => consoleErrors)
      .toContainEqual(expect.stringContaining("mreact: route hydration failed"));
    expect(consoleErrors.join("\n")).toContain("index");
    expect(consoleErrors.join("\n")).toContain("client hydrate boom");
  } finally {
    await server.close();
    await rm(rootDir, { force: true, recursive: true });
  }
});
