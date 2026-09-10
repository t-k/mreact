import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { buildApp } from "../dist/build.js";
import { startServer } from "../dist/serve.js";

const payload = '<img src=x onerror="globalThis.__compatXss = true">&text';
let root: string;
let url: string;
let close: (() => Promise<void>) | undefined;

test.describe.serial("production compat SSR hydration", () => {
  test.beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), "mreact-compat-browser-"));
    const appDir = join(root, "app");
    const outDir = join(root, ".mreact");
    await mkdir(join(appDir, "other"), { recursive: true });
    await writeFile(
      join(appDir, "Counter.compat.tsx"),
      `import { useState, useId, useRef, useLayoutEffect } from "@reckona/mreact-compat";
export function Counter({ label }) {
  const [count, setCount] = useState(0);
  const id = useId();
  const [value, setValue] = useState("controlled");
  const button = useRef(null);
  useLayoutEffect(() => {
    button.current?.setAttribute("data-mounted", "true");
    return () => button.current?.setAttribute("data-disposed", "true");
  }, []);
  return <><button ref={button} type="button" data-counter={label} className={count ? "active" : "idle"} style={{ color: "red" }} onClick={() => setCount(value => value + 1)}>{label}: {count}</button><label htmlFor={id}>{label}</label><input id={id} data-input={label} defaultValue={label} /><input data-controlled={label} value={value} onInput={event => setValue(event.currentTarget.value)} /><output data-value={label}>{value}</output></>;
}`,
    );
    await writeFile(
      join(appDir, "Text.compat.tsx"),
      "export function Text(props) { return props.value; }",
    );
    await writeFile(
      join(appDir, "page.tsx"),
      `import { Counter } from "./Counter.compat";
import { Text } from "./Text.compat";
import { Link } from "@reckona/mreact-router";
export default function Page() { return <main><Counter label="first" /><p id="native">Native sibling</p><Counter label="second" /><aside id="text"><Text value={${JSON.stringify(payload)}} /></aside><Link href="/other">Other</Link></main>; }`,
    );
    await writeFile(
      join(appDir, "other/page.tsx"),
      `import { Link } from "@reckona/mreact-router";
export default function Page() { return <main><h1>Other page</h1><Link href="/">Home</Link></main>; }`,
    );
    await buildApp({ appDir, outDir });
    const server = await startServer({ outDir, port: Number(process.env.PORT ?? 0) });
    close = () => server.close();
    url = server.url;
  });
  test.afterAll(async () => {
    await close?.();
    await rm(root, { recursive: true, force: true });
  });

  test("SSR is visible without JavaScript", async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    try {
      const page = await context.newPage();
      await page.goto(url);
      await expect(page.locator("[data-counter=first]")).toHaveText("first: 0");
      await expect(page.locator("[data-counter=second]")).toHaveText("second: 0");
      await expect(page.locator("[data-counter=first]")).toHaveClass("idle");
      const ids = await page
        .locator("input[id]")
        .evaluateAll((nodes) => nodes.map((node) => node.id));
      expect(new Set(ids).size).toBe(2);
    } finally {
      await context.close();
    }
  });

  test("hydration preserves nodes, edits, focus and siblings through updates and navigation", async ({
    page,
  }) => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route("**/_mreact/client/**", async (route) => {
      await gate;
      await route.continue();
    });
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    await page.addInitScript(() => {
      (window as any).__compatXss = false;
    });
    await page.goto(url, { waitUntil: "commit" });
    await expect(page.locator("[data-counter=first]")).toBeVisible();
    await page.evaluate(() => {
      const state = {
        nodes: Array.from(document.querySelectorAll("button,input,#native")),
        textNode: Array.from(document.querySelector("#text")!.childNodes).find(
          (node) => node.nodeType === Node.TEXT_NODE,
        ),
        removed: [] as Node[],
      };
      (window as any).__compatTest = state;
      new MutationObserver((records) => {
        for (const record of records)
          for (const node of record.removedNodes)
            if (state.nodes.includes(node as Element)) state.removed.push(node);
      }).observe(document.body, { subtree: true, childList: true });
    });
    expect(await page.evaluate(() => (window as any).__compatTest.textNode?.textContent)).toBe(
      payload,
    );
    await expect(page.locator("#text img")).toHaveCount(0);
    const input = page.locator("[data-input=first]");
    await input.fill("user edit");
    await input.focus();
    release();
    await page.waitForFunction(() => document.documentElement.dataset.mreactHydrated === "true");
    await expect(page.locator("#text")).toHaveText(payload);
    expect(await page.evaluate(() => (window as any).__compatTest.textNode?.isConnected)).toBe(
      true,
    );
    expect(await page.evaluate(() => (window as any).__compatXss)).toBe(false);
    await expect(input).toHaveValue("user edit");
    await expect(input).toBeFocused();
    await expect(page.locator("[data-controlled=first]")).toHaveValue("controlled");
    await page.locator("[data-controlled=first]").fill("updated");
    await expect(page.locator("[data-value=first]")).toHaveText("updated");
    expect(
      await page.evaluate(() =>
        (window as any).__compatTest.nodes.every((node: Node) => node.isConnected),
      ),
    ).toBe(true);
    expect(await page.evaluate(() => (window as any).__compatTest.removed.length)).toBe(0);
    await page.locator("[data-counter=first]").click();
    await expect(page.locator("[data-counter=first]")).toHaveText("first: 1");
    await expect(page.locator("[data-counter=second]")).toHaveText("second: 0");
    await expect(page.locator("[data-counter=first]")).toHaveClass("active");
    await page.getByRole("link", { name: "Other", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Other page" })).toBeVisible();
    expect(
      await page.evaluate(() =>
        (window as any).__compatTest.nodes
          .filter((node: Element) => node.tagName === "BUTTON")
          .every((node: Element) => node.getAttribute("data-disposed") === "true"),
      ),
    ).toBe(true);
    await page.getByRole("link", { name: "Home", exact: true }).click();
    await expect(page.locator("[data-counter=first]")).toHaveText("first: 0");
    await expect(page.locator("[data-counter=second]"), errors.join("\n")).toHaveAttribute(
      "data-mounted",
      "true",
    );
    await page.locator("[data-counter=second]").click();
    await expect(page.locator("[data-counter=second]")).toHaveText("second: 1");
    expect(errors).toEqual([]);
  });
});
