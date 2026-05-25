import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { once } from "node:events";
import { type AddressInfo, createServer as createNetServer } from "node:net";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { createServer as createViteServer, type ViteDevServer } from "vite";
import { startDevServer } from "../../packages/router/dist/dev-server.js";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));

interface RunningServer {
  close(): Promise<void>;
  url: string;
}

test.describe.serial("app-router example", () => {
  let server: RunningServer;

  test.beforeAll(async () => {
    server = await startDevServer({
      port: 0,
      projectRoot: join(repoRoot, "examples/app-router"),
    });
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("renders every tour route", async ({ page }) => {
    const routes = [
      ["/", "mreact App Router — Tour"],
      ["/about", "About"],
      ["/counter", "Client counter"],
      ["/streaming", "Streaming SSR"],
      ["/server-actions", "Server Actions"],
      ["/query", "Query"],
      ["/forms", "Forms"],
      ["/forms/valibot", "Valibot form"],
      ["/forms/zod", "Zod v4 form"],
      ["/users/ada", "User: Ada Lovelace"],
      ["/files/readme.md", "Catch-all segment"],
      ["/docs", "Docs Overview"],
      ["/docs/routing", "Routing"],
      ["/docs/slots", "Named slots"],
      ["/contact", "Contact"],
      ["/blocked", "Blocked"],
      ["/login", "Login"],
      ["/forbidden", "Forbidden"],
      ["/i18n", "Locale detection"],
      ["/i18n/ja", "ロケール検出"],
    ] as const;

    for (const [path, heading] of routes) {
      await page.goto(`${server.url}${path}`);
      await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
    }
  });

  test("handles client state, server actions, auth, and route handlers", async ({ page }) => {
    await page.goto(`${server.url}/counter`);
    await page.getByRole("button", { name: "+1" }).click();
    await expect(page.locator(".counter-display")).toHaveText("1");

    await page.goto(`${server.url}/server-actions`);
    await page.getByPlaceholder("Type a note and press Enter…").fill("E2E note");
    await page.getByRole("button", { name: "Add note" }).click();
    await expect(page.getByText("E2E note")).toBeVisible();

    const apiResult = await page.evaluate(async () => {
      const response = await fetch("/api/time?source=e2e");
      return await response.json();
    });
    expect(apiResult).toMatchObject({
      asked: { method: "GET", pathname: "/api/time", query: { source: "e2e" } },
      framework: "mreact",
      ok: true,
    });

    await page.goto(`${server.url}/admin`);
    await expect(page.getByRole("heading", { name: "Login" })).toBeVisible();
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByRole("heading", { name: "Admin" })).toBeVisible();
    await page.getByRole("link", { name: "/admin/audit" }).click();
    await expect(page.getByRole("heading", { name: "Admin audit log" })).toBeVisible();
  });

  test("submits the hand-written, Valibot, and Zod form examples", async ({ page }) => {
    await page.goto(`${server.url}/forms`);
    await page.getByRole("button", { name: "Send" }).click();
    await expect(page.getByText("Name must be at least 2 characters.")).toBeVisible();
    await page.getByLabel("Name").fill("Ada");
    await page.getByLabel("Email").fill("ada@example.test");
    await page.getByLabel("Message").fill("This contains spam content.");
    await page.getByRole("button", { name: "Send" }).click();
    await expect(page.getByText("Server rejected the message.")).toBeVisible();
    await page.getByLabel("Message").fill("Hello from Playwright.");
    await page.getByRole("button", { name: "Send" }).click();
    await expect(page.getByText("Saved Ada <ada@example.test>")).toBeVisible();

    await page.goto(`${server.url}/forms/valibot`);
    await page.getByRole("button", { name: "Submit" }).click();
    await expect(page.getByText("Name must be at least 2 characters.")).toBeVisible();
    await page.getByLabel("Name").fill("Grace");
    await page.getByLabel("Email").fill("grace@example.test");
    await page.getByLabel("Plan").selectOption("pro");
    await page.getByLabel("Seats").fill("3");
    await page.getByLabel("Accept terms").check();
    await page.getByRole("button", { name: "Submit" }).click();
    await expect(page.getByText("Submitted Grace for the pro plan with 3 seats.")).toBeVisible();

    await page.goto(`${server.url}/forms/zod`);
    await page.getByRole("button", { name: "Invite" }).click();
    await expect(page.getByText("Enter a valid email.")).toBeVisible();
    await page.getByRole("textbox", { name: "Email" }).fill("admin@example.test");
    await page.getByLabel("Role").selectOption("admin");
    await page.getByLabel("Seats").fill("5");
    await page.getByRole("button", { name: "Invite" }).click();
    await expect(page.getByText("Invited admin@example.test as admin with 5 seats.")).toBeVisible();
    await expect(page.getByText("Welcome email: no.")).toBeVisible();
  });
});

test.describe.serial("hacker-news example", () => {
  let server: RunningServer;

  test.beforeAll(async () => {
    const projectRoot = join(repoRoot, "examples/hacker-news");
    await runPnpmScript(projectRoot, "prepare:css");
    await runPnpmScript(projectRoot, "build:css");
    server = await startDevServer({
      port: 0,
      projectRoot,
    });
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("renders story feeds and navigates to a story detail", async ({ page }) => {
    const response = await page.goto(`${server.url}/`, { waitUntil: "domcontentloaded" });
    expect(response?.headers()["x-mreact-stream"]).toBe("1");
    await expect(page.getByRole("heading", { level: 1, name: "Top Stories" })).toBeVisible();
    await expect(page.getByRole("link", { exact: true, name: "Hacker News" })).toBeVisible();
    await expect(page.locator("link[rel='stylesheet'][href='/styles.css']")).toHaveCount(1);
    await expect(page.locator("meta[name='robots'][content='noindex, nofollow']")).toHaveCount(1);
    await expect.poll(async () => {
      return page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    }).toBe("rgb(246, 246, 239)");
    await expect
      .poll(async () => page.locator("[data-testid='story-link']").count())
      .toBeGreaterThanOrEqual(10);
    const ranks = await page
      .locator("main li:not([aria-hidden='true'])")
      .evaluateAll((items) =>
        items.map((item) => Number(item.getAttribute("value"))).filter(Number.isFinite),
      );
    expect(ranks.slice(0, 10)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    const feedNav = page.getByRole("navigation", { name: "Story feeds" });
    await expect(feedNav).toBeVisible();

    await feedNav.getByRole("link", { exact: true, name: "New" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "New Stories" })).toBeVisible();

    await feedNav.getByRole("link", { exact: true, name: "Best" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Best Stories" })).toBeVisible();

    await page.goto(`${server.url}/`);
    const firstStory = page.locator("[data-testid='story-link']").first();
    await expect(firstStory).toBeVisible();
    const storyHref = await firstStory.getAttribute("href");
    expect(storyHref).toBeTruthy();
    const detailResponse = await page.goto(new URL(storyHref ?? "", server.url).toString(), {
      waitUntil: "domcontentloaded",
    });
    expect(detailResponse?.headers()["x-mreact-stream"]).toBe("1");
    await expect(page.getByTestId("story-detail")).toBeVisible();
  });

  test("serves robots.txt that blocks indexing", async ({ request }) => {
    const response = await request.get(`${server.url}/robots.txt`);
    expect(response.status()).toBe(200);
    const text = await response.text();
    expect(text).toContain("User-agent: *");
    expect(text).toContain("Disallow: /");
  });

  test("renders a user profile from story metadata", async ({ page }) => {
    await page.goto(`${server.url}/`);
    const firstUser = page.locator("[data-testid='story-user-link']").first();
    await expect(firstUser).toBeVisible();
    await firstUser.click();
    await expect(page.getByTestId("user-profile")).toBeVisible();
  });
});

test.describe.serial("reactive-primitives example", () => {
  let server: RunningServer;

  test.beforeAll(async () => {
    server = await startViteExample("reactive-primitives");
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("covers the cell, computed, and effect pages", async ({ page }) => {
    await page.goto(`${server.url}/`);
    await expect(page.getByRole("heading", { name: "reactive-primitives" })).toBeVisible();

    await page.goto(`${server.url}/counter.html`);
    await expect(page.getByRole("heading", { name: "cell" })).toBeVisible();
    await page.getByRole("button", { name: "+1" }).click();
    await expect(page.locator("strong")).toHaveText("1");

    await page.goto(`${server.url}/derived.html`);
    await expect(page.getByRole("heading", { name: "computed" })).toBeVisible();
    await page.locator("input").first().fill("Grace");
    await expect(page.locator("strong")).toHaveText("Grace Lovelace");

    await page.goto(`${server.url}/effect.html`);
    await expect(page.getByRole("heading", { name: "effect" })).toBeVisible();
    await page.getByRole("button", { name: "bump" }).click();
    await expect(page.getByText(/tick=1 at/)).toBeVisible();
  });
});

test.describe.serial("store example", () => {
  let server: RunningServer;

  test.beforeAll(async () => {
    server = await startViteExample("store");
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("covers cart mutation, selectors, and subscribe pages", async ({ page }) => {
    await page.goto(`${server.url}/`);
    await expect(page.getByRole("heading", { name: "store" })).toBeVisible();

    await page.goto(`${server.url}/cart.html`);
    await expect(page.getByRole("heading", { name: "cart store" })).toBeVisible();
    await page.getByRole("button", { name: "add one book" }).click();
    const bookRow = page.getByRole("row", { name: /Programmable Matter/ });
    await expect(bookRow).toContainText("$48");
    await page.getByRole("button", { name: "apply MREACT10" }).click();
    await expect(page.getByText("promo code: MREACT10")).toBeVisible();

    await page.goto(`${server.url}/selectors.html`);
    await expect(page.getByRole("heading", { name: "selectors" })).toBeVisible();
    await expect(page.getByText("items")).toBeVisible();
    await expect(page.getByText("subtotal")).toBeVisible();

    await page.goto(`${server.url}/subscribe.html`);
    await expect(page.getByRole("heading", { name: "subscribe" })).toBeVisible();
  });
});

test.describe.serial("virtual-grid example", () => {
  let server: RunningServer;

  test.beforeAll(async () => {
    server = await startViteExample("virtual-grid");
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("keeps a 10000-photo grid bounded while jumping between top and end", async ({ page }) => {
    await page.goto(`${server.url}/`);
    await expect(page.getByRole("heading", { name: "virtual-grid" })).toBeVisible();
    await expect(page.getByText("10,000 photos")).toBeVisible();

    await expect(page.locator("[data-testid='photo-card']")).toHaveCount(15);
    await expect(page.getByTestId("visible-range")).toHaveText("0-9");
    await expect(page.getByTestId("first-rendered")).toHaveText("photo-00000");

    await page.getByRole("button", { name: "Jump to end" }).click();
    await expect(page.getByTestId("visible-range")).toHaveText("9993-10000");
    await expect(page.getByTestId("last-rendered")).toHaveText("photo-09999");
    await expect(page.locator("[data-testid='photo-card']")).toHaveCount(13);

    await page.getByRole("button", { name: "Back to top" }).click();
    await expect(page.getByTestId("visible-range")).toHaveText("0-9");
    await expect(page.getByTestId("first-rendered")).toHaveText("photo-00000");
    await expect(page.locator("[data-testid='photo-card']")).toHaveCount(15);
  });

  test("updates spacer telemetry when paging through the gallery", async ({ page }) => {
    await page.goto(`${server.url}/`);

    await expect(page.getByTestId("top-spacer")).toHaveText("0 px");
    await expect(page.getByTestId("bottom-spacer")).toHaveText("399480 px");

    await page.getByRole("button", { name: "Page down" }).click();
    await expect(page.getByTestId("visible-range")).toHaveText("9-18");
    await expect(page.getByTestId("top-spacer")).toHaveText("120 px");
    await expect(page.getByTestId("bottom-spacer")).toHaveText("399120 px");
    await expect(page.locator("[data-testid='photo-card']")).toHaveCount(21);
  });

  test("updates rendered cards when the viewport is scrolled manually", async ({ page }) => {
    await page.goto(`${server.url}/`);

    await page.getByTestId("photo-viewport").evaluate((node) => {
      node.scrollTop = 1_200;
      node.dispatchEvent(new Event("scroll", { bubbles: true }));
    });

    await expect(page.getByTestId("visible-range")).toHaveText("30-39");
    await expect(page.getByTestId("first-rendered")).toHaveText("photo-00024");
    await expect(page.locator("[data-testid='photo-card']")).toHaveCount(21);
  });
});

test("react-compat example supports hooks and lazy Suspense", async ({ page }) => {
  const server = await startViteExample("react-compat");
  try {
    await page.goto(`${server.url}/`);
    await expect(page.getByRole("heading", { name: "react-compat" })).toBeVisible();
    await page.getByRole("button", { name: "+1" }).click();
    await expect(page.locator("strong").first()).toHaveText("1");
    await expect(page).toHaveTitle("count = 1");
    await page.getByRole("button", { name: "Show About" }).click();
    await expect(page.getByRole("heading", { name: "About this demo" })).toBeVisible();
  } finally {
    await server.close();
  }
});

test("selective-hydration example hydrates on interaction and then updates state", async ({
  page,
}) => {
  const port = await getAvailablePort();
  const server = await startProcessServer({
    args: ["dev"],
    cwd: join(repoRoot, "examples/selective-hydration"),
    env: { PORT: String(port) },
    url: `http://127.0.0.1:${port}`,
  });

  try {
    await page.goto(server.url);
    await expect(page.getByRole("heading", { name: "Selective hydration" })).toBeVisible();
    await page.getByRole("button", { name: "+1" }).click();
    await expect(page.getByText("status: hydrated")).toBeVisible();
    await page.getByRole("button", { name: "+1" }).click();
    await expect(page.getByText("count: 1")).toBeVisible();
  } finally {
    await server.close();
  }
});

test("ssr-streaming example scripts emit the documented output", async () => {
  const cwd = join(repoRoot, "examples/ssr-streaming");

  const stringOutput = await runPnpmScript(cwd, "demo:string");
  expect(stringOutput).toContain("=== server-string output ===");
  expect(stringOutput).toContain("<h1>Hello SSR</h1>");

  const streamOutput = await runPnpmScript(cwd, "demo:stream");
  expect(streamOutput).toContain("=== server-stream chunks ===");
  expect(streamOutput).toContain("<h1>Server-stream output</h1>");
  expect(streamOutput).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");

  const awaitOutput = await runPnpmScript(cwd, "demo:await");
  expect(awaitOutput).toContain("=== <Await> chunk-by-chunk ===");
  expect(awaitOutput).toContain("Ada Lovelace");
  expect(awaitOutput).toContain("network down");
});

async function startViteExample(exampleName: string): Promise<RunningServer> {
  const root = join(repoRoot, "examples", exampleName);
  const vite = await createViteServer({
    configFile: join(root, "vite.config.ts"),
    root,
    server: {
      hmr: false,
      host: "127.0.0.1",
      port: 0,
      strictPort: false,
    },
    logLevel: "warn",
  });

  await vite.listen();
  const url = localViteUrl(vite);

  return {
    url,
    close: async () => {
      await vite.close();
    },
  };
}

function localViteUrl(vite: ViteDevServer): string {
  const url = vite.resolvedUrls?.local[0];
  if (url === undefined) {
    throw new Error("Vite server did not expose a local URL.");
  }
  return url.replace(/\/$/, "");
}

async function startProcessServer(options: {
  args: string[];
  cwd: string;
  env?: Record<string, string>;
  url: string;
}): Promise<RunningServer> {
  const child = spawn("pnpm", options.args, {
    cwd: options.cwd,
    env: { ...process.env, ...options.env, FORCE_COLOR: "0" },
  });
  let output = "";
  child.stdout.on("data", (chunk) => {
    output += String(chunk);
  });
  child.stderr.on("data", (chunk) => {
    output += String(chunk);
  });

  await waitForHttp(options.url, () => {
    if (child.exitCode !== null) {
      throw new Error(`Process exited before server was ready:\n${output}`);
    }
  });

  return {
    url: options.url,
    close: async () => {
      await stopChild(child);
    },
  };
}

async function waitForHttp(url: string, checkAlive: () => void): Promise<void> {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    checkAlive();
    try {
      const response = await fetch(url);
      await response.arrayBuffer();
      if (response.ok) return;
    } catch {
      // Retry until the server starts accepting connections.
    }
    await delay(100);
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function runPnpmScript(cwd: string, script: string): Promise<string> {
  const child = spawn("pnpm", [script], {
    cwd,
    env: { ...process.env, FORCE_COLOR: "0" },
  });
  let output = "";
  child.stdout.on("data", (chunk) => {
    output += String(chunk);
  });
  child.stderr.on("data", (chunk) => {
    output += String(chunk);
  });

  const [code] = (await once(child, "exit")) as [number | null, NodeJS.Signals | null];
  if (code !== 0) {
    throw new Error(`pnpm ${script} failed with ${code}:\n${output}`);
  }
  return output;
}

async function getAvailablePort(): Promise<number> {
  const server = createNetServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as AddressInfo;
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error === undefined ? resolve() : reject(error)));
  });
  return address.port;
}

async function stopChild(child: ChildProcessWithoutNullStreams): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) {
    return;
  }

  child.kill("SIGTERM");
  const exited = once(child, "exit").then(() => undefined);
  await Promise.race([
    exited,
    delay(5_000).then(() => {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill("SIGKILL");
      }
    }),
  ]);
  await exited;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
