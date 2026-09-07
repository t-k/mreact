import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { buildApp } from "../dist/build.js";
import { startServer } from "../dist/serve.js";

/**
 * Hydration retargets prop bindings onto the server-rendered nodes and re-applies
 * the last value on the way (`bindProp`'s `retarget`, and the same shape in
 * `bindElementProperty`). Whether that write is destructive can only be settled
 * by typing into a server-rendered input before any client code runs, so every
 * test here withholds the route entry with `page.route`, types, and then releases
 * it. `bindText` has a `preserveInitial` escape hatch and the prop bindings do
 * not; these tests pin what that asymmetry actually costs.
 *
 * The fixture exercises both retarget sites: `value` and `defaultValue` go
 * through the generic `bindProp`, `title` goes through the specialized
 * `bindElementProperty`, and `aria-label` goes through `bindProp` without being
 * the value.
 */

const pageSource = `import { cell } from "@reckona/mreact-reactive-core";

export default function Page() {
  const controlled = cell("server-controlled");
  const seed = cell("server-seed");
  const flavour = cell("server-title");

  return (
    <main>
      <h1>Pre-hydration input</h1>
      <input id="controlled" value={controlled.get()} onInput={(event) => controlled.set(event.currentTarget.value)} />
      <input id="mirror-controlled" value={controlled.get()} onInput={(event) => controlled.set(event.currentTarget.value)} />
      <input id="uncontrolled-static" defaultValue="static-seed" />
      <input id="uncontrolled-bound" defaultValue={seed.get()} />
      <input id="pristine-bound" defaultValue={seed.get()} />
      <input id="decorated" title={flavour.get()} aria-label={flavour.get()} />
      <p id="controlled-echo">{controlled.get()}</p>
      <button type="button" onClick={() => flavour.set("client-title")}>retitle</button>
    </main>
  );
}
`;

const clientAssetPattern = "**/_mreact/client/**";

let rootDir: string;
let serverUrl: string;
let closeServer: () => Promise<void>;

/**
 * Loads the route with the client entry withheld, so the returned `release`
 * is the only thing that lets hydration run. `waitUntil: "commit"` is required
 * because a deferred module script keeps `domcontentloaded` pending.
 */
async function openWithHydrationWithheld(page: Page): Promise<() => void> {
  let release: (() => void) | undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });

  await page.route(clientAssetPattern, async (route) => {
    await gate;
    await route.continue();
  });
  await page.goto(serverUrl, { waitUntil: "commit" });
  await expect(page.locator("#controlled")).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.dataset.mreactHydrated),
    "hydration must not have run before the keystrokes",
  ).toBeUndefined();

  return () => release?.();
}

async function waitForHydration(page: Page): Promise<void> {
  await page.waitForFunction(() => document.documentElement.dataset.mreactHydrated === "true");
}

function inputValue(page: Page, id: string): Promise<string> {
  return page.locator(`#${id}`).inputValue();
}

test.describe.serial("pre-hydration input preservation", () => {
  test.beforeAll(async () => {
    rootDir = await mkdtemp(join(tmpdir(), "mreact-pre-hydration-input-"));
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

  test.afterEach(async ({ page }) => {
    await page.unroute(clientAssetPattern);
  });

  test("a controlled bound value replaces pre-hydration keystrokes with the bound value", async ({
    page,
  }) => {
    const release = await openWithHydrationWithheld(page);

    await page.locator("#controlled").pressSequentially("-typed");
    expect(await inputValue(page, "controlled")).toBe("-typedserver-controlled");

    release();
    await waitForHydration(page);

    // The bound value is authoritative for a controlled input, so the retarget
    // write is expected to win. Losing the keystrokes here is the documented
    // outcome, not a defect.
    expect(await inputValue(page, "controlled")).toBe("server-controlled");
    expect(await inputValue(page, "mirror-controlled")).toBe("server-controlled");
    await expect(page.locator("#controlled-echo")).toHaveText("server-controlled");
  });

  test("an uncontrolled defaultValue keeps pre-hydration keystrokes through hydration", async ({
    page,
  }) => {
    const release = await openWithHydrationWithheld(page);

    await page.locator("#uncontrolled-static").pressSequentially("-typed");
    await page.locator("#uncontrolled-bound").pressSequentially("-typed");

    release();
    await waitForHydration(page);

    // `defaultValue` resolves to the element's default, which a dirty input no
    // longer mirrors, so the retarget write cannot reach the typed value.
    expect(await inputValue(page, "uncontrolled-static")).toBe("-typedstatic-seed");
    expect(await inputValue(page, "uncontrolled-bound")).toBe("-typedserver-seed");
    // An untouched bound defaultValue still shows its server value afterwards.
    // The untouched *static* defaultValue is deliberately not asserted here: it
    // is wiped by a separate client-template defect that has nothing to do with
    // user input, where `packages/compiler/src/emit-client.ts` writes raw JSX
    // prop names into the client template so hydration replaces `value` with a
    // parsed-lowercase `defaultvalue`.
    expect(await inputValue(page, "pristine-bound")).toBe("server-seed");
  });

  test("a bound non-value property leaves pre-hydration input, selection and focus intact", async ({
    page,
  }) => {
    const release = await openWithHydrationWithheld(page);

    await page.locator("#decorated").pressSequentially("typed-here");
    await page.evaluate(() => {
      (document.getElementById("decorated") as HTMLInputElement).setSelectionRange(2, 5);
    });

    release();
    await waitForHydration(page);

    expect(await inputValue(page, "decorated")).toBe("typed-here");
    expect(
      await page.evaluate(() => {
        const decorated = document.getElementById("decorated") as HTMLInputElement;
        return {
          activeElementId: document.activeElement?.id ?? "",
          ariaLabel: decorated.getAttribute("aria-label"),
          selectionEnd: decorated.selectionEnd,
          selectionStart: decorated.selectionStart,
          title: decorated.title,
        };
      }),
    ).toEqual({
      activeElementId: "decorated",
      ariaLabel: "server-title",
      selectionEnd: 5,
      selectionStart: 2,
      title: "server-title",
    });

    // The retarget did land on the server node: the binding still drives it.
    await page.getByRole("button", { name: "retitle" }).click();
    await expect(page.locator("#decorated")).toHaveAttribute("title", "client-title");
    await expect(page.locator("#decorated")).toHaveAttribute("aria-label", "client-title");
    expect(await inputValue(page, "decorated")).toBe("typed-here");
  });

  test("controlled inputs still track their cell after hydration", async ({ page }) => {
    await page.goto(serverUrl);
    await waitForHydration(page);

    await page.locator("#controlled").pressSequentially("!");

    expect(await inputValue(page, "controlled")).toBe("!server-controlled");
    expect(await inputValue(page, "mirror-controlled")).toBe("!server-controlled");
    await expect(page.locator("#controlled-echo")).toHaveText("!server-controlled");
  });
});
