import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { buildApp } from "../dist/build.js";
import { startServer } from "../dist/serve.js";

/**
 * Static JSX prop names used to enter the client template verbatim. HTML parsing
 * lowercased them, and attribute synchronisation then removed the server's real
 * attributes - `class`, `for`, `value`, `checked` - because the template node did
 * not carry those names, and copied the lowercased JSX names across instead.
 *
 * The failure was silent: no console error, no failing unit test, just styling
 * that stopped applying and form controls that emptied. These assertions run
 * against the hydrated document, so they fail on the attributes a user would
 * actually lose rather than on emitted output.
 */
const pageSource = `export default function Page() {
  return (
    <main className="shell" id="root">
      <label htmlFor="seeded" className="field-label">Seeded</label>
      <input id="seeded" defaultValue="seed" />
      <input id="ticked" type="checkbox" defaultChecked />
      <textarea id="notes" defaultValue="area" />
      <a id="anchor" className="link" href="/next">next</a>
      <button id="noop" type="button" onClick={() => undefined}>noop</button>
    </main>
  );
}
`;

let rootDir: string;
let serverUrl: string;
let closeServer: () => Promise<void>;

async function waitForHydration(page: Page): Promise<void> {
  await page.waitForFunction(() => document.documentElement.dataset.mreactHydrated === "true");
}

function attributeNames(page: Page, selector: string): Promise<string[]> {
  return page.evaluate((target) => {
    const element = document.querySelector(target);

    if (element === null) {
      throw new Error(`missing element for ${target}`);
    }

    return [...element.attributes].map((attribute) => attribute.name).sort();
  }, selector);
}

// Not serial: every test navigates for itself, so a failure in one still lets
// the others report, which is what makes this suite useful as a regression net.
test.describe("static attribute names survive hydration", () => {
  test.beforeAll(async () => {
    rootDir = await mkdtemp(join(tmpdir(), "mreact-static-attribute-names-"));
    const appDir = join(rootDir, "app");
    const outDir = join(rootDir, ".mreact");
    await mkdir(appDir, { recursive: true });
    await writeFile(join(appDir, "page.tsx"), pageSource);

    const previousNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      await buildApp({ appDir, outDir });
    } finally {
      if (previousNodeEnv === undefined) {
        delete process.env.NODE_ENV;
      } else {
        process.env.NODE_ENV = previousNodeEnv;
      }
    }

    const server = await startServer({ outDir, port: 0 });
    serverUrl = server.url;
    closeServer = () => server.close();
  });

  test.afterAll(async () => {
    await closeServer?.();
    await rm(rootDir, { force: true, recursive: true });
  });

  test("className and htmlFor keep their HTML names after hydration", async ({ page }) => {
    await page.goto(serverUrl);
    await waitForHydration(page);

    expect(await attributeNames(page, "#root")).toEqual(["class", "id"]);
    expect(await attributeNames(page, 'label[for="seeded"]')).toEqual(["class", "for"]);
    expect(await page.locator("#root").getAttribute("class")).toBe("shell");
  });

  test("a label keeps driving its input after hydration", async ({ page }) => {
    await page.goto(serverUrl);
    await waitForHydration(page);

    // `for` is what makes the label click focus the input, so this fails if the
    // attribute was replaced by a lowercased `htmlfor`.
    await page.locator('label[for="seeded"]').click();
    expect(await page.evaluate(() => document.activeElement?.id)).toBe("seeded");
  });

  test("static input defaults survive hydration", async ({ page }) => {
    await page.goto(serverUrl);
    await waitForHydration(page);

    expect(await page.locator("#seeded").inputValue()).toBe("seed");
    expect(await page.locator("#ticked").isChecked()).toBe(true);
    expect(await attributeNames(page, "#seeded")).toEqual(["id", "value"]);
    expect(await attributeNames(page, "#ticked")).toEqual(["checked", "id", "type"]);
  });

  test("a static textarea seed survives hydration", async ({ page }) => {
    await page.goto(serverUrl);
    await waitForHydration(page);

    // The server writes the seed as element content, so the template has to as
    // well; an attribute here would be a structural divergence, not a name one.
    expect(await page.locator("#notes").inputValue()).toBe("area");
    expect(await attributeNames(page, "#notes")).toEqual(["id"]);
  });

  test("hydration does not change the attributes the server sent", async ({ page }) => {
    const response = await page.goto(serverUrl);
    const serverHtml = await response?.text();

    if (serverHtml === undefined) {
      throw new Error("the route did not respond with a document");
    }

    const serverAttributes = await page.evaluate((html) => {
      const parsed = new DOMParser().parseFromString(html, "text/html");
      return [...(parsed.querySelector("#root")?.parentElement?.querySelectorAll("*") ?? [])]
        .filter((element) => element.id !== "" || element.tagName === "LABEL")
        .map(
          (element) =>
            `${element.tagName.toLowerCase()}[${[...element.attributes]
              .map((attribute) => `${attribute.name}=${attribute.value}`)
              .sort()
              .join(",")}]`,
        );
    }, serverHtml);

    await waitForHydration(page);

    const hydratedAttributes = await page.evaluate(() =>
      [...(document.querySelector("#root")?.parentElement?.querySelectorAll("*") ?? [])]
        .filter((element) => element.id !== "" || element.tagName === "LABEL")
        .map(
          (element) =>
            `${element.tagName.toLowerCase()}[${[...element.attributes]
              .map((attribute) => `${attribute.name}=${attribute.value}`)
              .sort()
              .join(",")}]`,
        ),
    );

    expect(hydratedAttributes).toEqual(serverAttributes);
  });
});
