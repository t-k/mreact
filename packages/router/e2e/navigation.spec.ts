import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { buildApp } from "../dist/build.js";
import { startDevServer } from "../dist/dev-server.js";
import { startServer } from "../dist/serve.js";

test("client navigation preserves layouts and restores history snapshots", async ({
  page,
}) => {
  const rootDir = await mkdtemp(join(tmpdir(), "mreact-router-e2e-"));
  const appDir = join(rootDir, "app");
  const outDir = join(rootDir, ".mreact");
  await mkdir(join(appDir, "about"), { recursive: true });
  await writeFile(
    join(appDir, "layout.tsx"),
    `export default function Layout() {
  return <section id="root-layout"><header id="app-shell">Shell</header><Slot /></section>;
}`,
  );
  await writeFile(
    join(appDir, "page.tsx"),
    `import { cell } from "@reckona/mreact-reactive-core";

export default function Page() {
  const count = cell(0);
  return <main style="min-height: 1600px; padding-top: 48px"><h1>Home</h1><a href="/about" style="position: fixed; top: 0; left: 0">About</a><button type="button" onClick={() => count.set(value => value + 1)}>count: {count.get()}</button></main>;
}`,
  );
  await writeFile(
    join(appDir, "about", "page.tsx"),
    `export default function About() {
  return <main style="min-height: 1600px"><h1>About</h1><a href="/">Home</a></main>;
}`,
  );

  await buildApp({ appDir, outDir });
  const server = await startServer({ outDir, port: 0 });

  try {
    await page.goto(server.url);
    await expect(page.getByRole("heading", { name: "Home" })).toBeVisible();
    await page.getByRole("button", { name: "count: 0" }).click();
    await expect(page.getByRole("button", { name: "count: 1" })).toBeVisible();
    await page.evaluate(() => {
      window.scrollTo(0, 400);
      window.__mreactE2eShell = document.getElementById("app-shell");
    });

    await page.getByRole("link", { name: "About" }).hover();
    await page.getByRole("link", { name: "About" }).click();
    await expect(page.getByRole("heading", { name: "About" })).toBeVisible();
    await expect(
      page.evaluate(() => document.getElementById("app-shell") === window.__mreactE2eShell),
    ).resolves.toBe(true);

    await page.goBack();
    await expect(page.getByRole("heading", { name: "Home" })).toBeVisible();
    await expect(page.getByRole("button", { name: "count: 1" })).toBeVisible();
    await expect(page.evaluate(() => window.scrollY)).resolves.toBe(400);
  } finally {
    await server.close();
    await rm(rootDir, { force: true, recursive: true });
  }
});

test("intent prefetch adds modulepreload for client route scripts", async ({ page }) => {
  const rootDir = await mkdtemp(join(tmpdir(), "mreact-router-prefetch-e2e-"));
  const appDir = join(rootDir, "app");
  const outDir = join(rootDir, ".mreact");
  await mkdir(join(appDir, "about"), { recursive: true });
  await writeFile(
    join(appDir, "page.tsx"),
    `import { cell } from "@reckona/mreact-reactive-core";

export default function Page() {
  const count = cell(0);
  return <main><h1>Home</h1><a href="/about">About</a><button type="button" onClick={() => count.set(value => value + 1)}>count: {count.get()}</button></main>;
}`,
  );
  await writeFile(
    join(appDir, "about", "page.tsx"),
    `import { cell } from "@reckona/mreact-reactive-core";

export default function About() {
  const count = cell(0);
  return <main><h1>About</h1><button type="button" onClick={() => count.set(value => value + 1)}>about count: {count.get()}</button></main>;
}`,
  );

  await buildApp({ appDir, outDir });
  const server = await startServer({ outDir, port: 0 });

  try {
    await page.goto(server.url);
    await page.getByRole("link", { name: "About" }).hover();
    await expect(
      page.locator('link[rel="modulepreload"][href*="/_mreact/client/assets/routes/about."]'),
    ).toHaveCount(1);
  } finally {
    await server.close();
    await rm(rootDir, { force: true, recursive: true });
  }
});

test("client navigation preserves module singleton state shared by route chunks", async ({
  page,
}) => {
  const { close, url } = await startFixtureServer({
    "lib/mfa-pending-store.ts": `let pending: { ticket: string } | null = null;

export function setMfaPending(value: { ticket: string }) {
  pending = value;
}

export function getMfaPending() {
  return pending;
}
`,
    "login/page.tsx": `import { setMfaPending } from "../lib/mfa-pending-store";

export default function Login() {
  return <main><h1>Login</h1><a href="/mfa-challenge" onClick={() => setMfaPending({ ticket: "ticket-totp-1" })}>Continue</a></main>;
}
`,
    "mfa-challenge/page.tsx": `import { getMfaPending } from "../lib/mfa-pending-store";

export default function MfaChallenge() {
  const pending = getMfaPending();
  return <main><h1>{pending === null ? "Expired" : "MFA required"}</h1><p>{pending?.ticket ?? "missing"}</p><button type="button" onClick={() => undefined}>noop</button></main>;
}
`,
  });

  try {
    await page.goto(`${url}/login`);
    await page.getByRole("link", { name: "Continue" }).click();
    await expect(page).toHaveURL(/\/mfa-challenge$/);
    await expect(page.getByRole("heading", { name: "MFA required" })).toBeVisible();
    await expect(page.getByText("ticket-totp-1")).toBeVisible();
  } finally {
    await close();
  }
});

test("server action form submit revalidates cached pages in the browser", async ({
  page,
}) => {
  const { close, url } = await startFixtureServer({
    "actions.ts": `"use server";

import { revalidatePath } from "@reckona/mreact-router";

export function save(formData: FormData) {
  const title = String(formData.get("title"));
  const state = globalThis as { __mreactE2eTitle?: string };
  state.__mreactE2eTitle = title;
  revalidatePath("/");
  return new Response("<!DOCTYPE html><div data-mreact-route-id=\\"index\\"><main><h1>Saved</h1><a href=\\"/\\">Home</a></main></div>", {
    headers: { "content-type": "text/html; charset=utf-8" },
    status: 200,
  });
}`,
    "page.tsx": `import { save } from "./actions";

export const revalidate = 60;

export function loader() {
  const state = globalThis as { __mreactE2eTitle?: string };
  return { title: state.__mreactE2eTitle ?? "Draft" };
}

export default function Page(props) {
  return <main><h1>{props.data.title}</h1><form action={save}><input name="title" value="Published" /><button type="submit">Save</button></form></main>;
}`,
  });

  try {
    await page.goto(url);
    await expect(page.getByRole("heading", { name: "Draft" })).toBeVisible();
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("heading", { name: "Saved" })).toBeVisible();
    await page.getByRole("link", { name: "Home" }).click();
    await expect(page.getByRole("heading", { name: "Published" })).toBeVisible();
  } finally {
    await close();
  }
});

test("server action form submit rejects tampered CSRF tokens in the browser", async ({
  page,
}) => {
  const { close, url } = await startFixtureServer({
    "actions.ts": `"use server";

export function save(formData: FormData) {
  const state = globalThis as { __mreactE2eRejectedTitle?: string };
  state.__mreactE2eRejectedTitle = String(formData.get("title"));
  return { ok: true };
}`,
    "page.tsx": `import { save } from "./actions";

export function loader() {
  const state = globalThis as { __mreactE2eRejectedTitle?: string };
  return { title: state.__mreactE2eRejectedTitle ?? "Draft" };
}

export default function Page(props) {
  return <main><h1>{props.data.title}</h1><form action={save}><input name="title" value="Should not persist" /><button type="submit">Save</button></form></main>;
}`,
  });

  try {
    await page.goto(url);
    await expect(page.getByRole("heading", { name: "Draft" })).toBeVisible();
    await page.locator('input[name="__mreact_csrf"]').evaluate((input) => {
      (input as HTMLInputElement).value = "tampered";
    });
    await page.getByRole("button", { name: "Save" }).click();

    await expect(page.getByText("Invalid CSRF token.")).toBeVisible();
    await page.goto(url);
    await expect(page.getByRole("heading", { name: "Draft" })).toBeVisible();
  } finally {
    await close();
  }
});

test("file input onChange fires after Playwright setInputFiles", async ({
  page,
}) => {
  const rootDir = await mkdtemp(join(tmpdir(), "mreact-router-file-input-e2e-"));
  const routeFile = join(rootDir, "route-fixture.txt");
  const boundaryFile = join(rootDir, "boundary-fixture.txt");
  const propFile = join(rootDir, "prop-fixture.txt");
  await writeFile(routeFile, "route");
  await writeFile(boundaryFile, "boundary");
  await writeFile(propFile, "prop");
  const { close, url } = await startFixtureServer({
    "Boundary.client.tsx": `import { cell } from "@reckona/mreact-reactive-core";

export function BoundaryUpload() {
  const fileName = cell("none");
  return <section><label>Boundary attachment<input type="file" onChange={(event) => fileName.set(event.currentTarget.files?.[0]?.name ?? "none")} /></label><output data-testid="boundary-output">{fileName.get()}</output></section>;
}`,
    "page.tsx": `import { cell } from "@reckona/mreact-reactive-core";
import { BoundaryUpload } from "./Boundary.client";

function FileField(props) {
  return <label>Prop attachment<input type="file" onChange={props.onChange} /></label>;
}

export default function Page() {
  const fileName = cell("none");
  const propFileName = cell("none");
  return <main><h1>Upload</h1><label>Route attachment<input type="file" onChange={(event) => fileName.set(event.currentTarget.files?.[0]?.name ?? "none")} /></label><output data-testid="route-output">{fileName.get()}</output><BoundaryUpload /><FileField onChange={(event) => propFileName.set(event.currentTarget.files?.[0]?.name ?? "none")} /><output data-testid="prop-output">{propFileName.get()}</output></main>;
}`,
  });

  try {
    await page.goto(url);
    await page.getByLabel("Route attachment").setInputFiles(routeFile);
    await expect(page.getByTestId("route-output")).toHaveText("route-fixture.txt");

    await page.getByLabel("Boundary attachment").setInputFiles(boundaryFile);
    await expect(page.getByTestId("boundary-output")).toHaveText("boundary-fixture.txt");

    await page.getByLabel("Prop attachment").setInputFiles(propFile);
    await expect(page.getByTestId("prop-output")).toHaveText("prop-fixture.txt");
  } finally {
    await close();
    await rm(rootDir, { force: true, recursive: true });
  }
});

test("template remount, error boundary, and streaming loading boundary work in the browser", async ({
  page,
}) => {
  const { close, url } = await startFixtureServer({
    "layout.tsx": `export default function Layout() {
  return <section><nav><a href="/">Home</a><a href="/profile">Profile</a><a href="/broken">Broken</a><a href="/stream">Stream</a></nav><Slot /></section>;
}`,
    "template.tsx": `export default function Template() {
  return <article data-token={String(Math.random())}><Slot /></article>;
}`,
    "error.tsx": `export default function ErrorPage(props) {
  return <main><h1>Error</h1><p>{props.error.message}</p></main>;
}`,
    "page.tsx": `export default function Page() {
  return <main><h1>Home</h1></main>;
}`,
    "profile/page.tsx": `export default function Profile() {
  return <main><h1>Profile</h1></main>;
}`,
    "broken/page.tsx": `export default function Broken() {
  throw new Error("route exploded");
}`,
    "stream/loading.tsx": `export default function Loading() {
  return <p>Loading stream</p>;
}`,
    "stream/page.tsx": `export const stream = true;

export async function loader() {
  return await new Promise(resolve => setTimeout(() => resolve({ name: "Ada" }), 250));
}

export default function StreamPage(props) {
  return <main><h1>Stream</h1><strong>{props.data.name}</strong></main>;
}`,
  });

  try {
    await page.goto(url);
    const firstToken = await page.locator("article").getAttribute("data-token");
    await page.getByRole("link", { name: "Profile" }).click();
    await expect(page.getByRole("heading", { name: "Profile" })).toBeVisible();
    const secondToken = await page.locator("article").getAttribute("data-token");
    expect(secondToken).not.toBe(firstToken);

    await page.getByRole("link", { name: "Broken" }).click();
    await expect(page.getByRole("heading", { name: "Error" })).toBeVisible();
    await expect(page.getByText("route exploded")).toBeVisible();

    await Promise.all([
      page.waitForRequest((request) => request.url().endsWith("/stream")),
      page.getByRole("link", { name: "Stream" }).click(),
    ]);
    await expect(page.getByText("Loading stream")).toBeVisible();
    await expect(page.getByText("Ada")).toBeVisible();
  } finally {
    await close();
  }
});

test("named slot と dynamic route と API route がブラウザ上で連携する", async ({
  page,
}) => {
  const { close, url } = await startFixtureServer({
    "layout.tsx": `export default function Layout() {
  return <section><header><Slot name="header" data-test-id="header-slot" /></header><main><Slot /></main></section>;
}`,
    "page.tsx": `export default function Page() {
  return <article><h1>Home</h1><a href="/users/ada">Ada</a></article>;
}`,
    "users/$id/page.tsx": `function Header(props) {
  return <h2>User header: {props.params.id}</h2>;
}

export const slots = { header: Header };

export function loader({ params }) {
  return { upper: params.id.toUpperCase() };
}

export default function UserPage(props) {
  return <article><h1>User {props.params.id}</h1><p>Upper {props.data.upper}</p></article>;
}`,
    "api/user/route.ts": `export function GET(request) {
  const url = new URL(request.url);
  return Response.json({ id: url.searchParams.get("id"), ok: true });
}`,
  });

  try {
    await page.goto(url);
    await page.getByRole("link", { name: "Ada" }).click();
    await expect(page.getByRole("heading", { name: "User ada" })).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "User header: ada" }),
    ).toBeVisible();
    await expect(page.getByText("Upper ADA")).toBeVisible();

    const apiResult = await page.evaluate(async () => {
      const response = await fetch("/api/user?id=ada");
      return await response.json();
    });

    expect(apiResult).toEqual({ id: "ada", ok: true });
  } finally {
    await close();
  }
});

test("later adjacent null client boundaries materialize without earlier siblings", async ({
  page,
}) => {
  const { close, url } = await startFixtureServer({
    "components/AppShell.tsx": `import { InstallBanner } from "./InstallBanner";
import { OfflineBanner } from "./OfflineBanner";
import { UpdateBanner } from "./UpdateBanner";

export function AppShell() {
  return (
    <main>
      <h1>Settings</h1>
      <OfflineBanner />
      <InstallBanner />
      <UpdateBanner />
    </main>
  );
}`,
    "components/InstallBanner.tsx": `"use client";
import { cell } from "@reckona/mreact-reactive-core";

const visible = cell(false);
let watching = false;

function startWatch(): void {
  if (typeof window === "undefined" || watching) return;
  watching = true;
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    visible.set(true);
  });
}

export function InstallBanner() {
  startWatch();
  if (!visible.get()) return null;
  return <div id="install-banner">Install</div>;
}`,
    "components/OfflineBanner.tsx": `"use client";
import { cell } from "@reckona/mreact-reactive-core";

const visible = cell(false);
let watching = false;

function startWatch(): void {
  if (typeof window === "undefined" || watching) return;
  watching = true;
  window.addEventListener("mreact-offline-ready", () => visible.set(true));
}

export function OfflineBanner() {
  startWatch();
  if (!visible.get()) return null;
  return <div id="offline-banner">Offline</div>;
}`,
    "components/UpdateBanner.tsx": `"use client";
import { cell } from "@reckona/mreact-reactive-core";

const visible = cell(false);
let watching = false;

function startWatch(): void {
  if (typeof window === "undefined" || watching) return;
  watching = true;
  window.addEventListener("mreact-update-ready", () => visible.set(true));
}

export function UpdateBanner() {
  startWatch();
  if (!visible.get()) return null;
  return <div id="update-banner">Update</div>;
}`,
    "page.tsx": `import { AppShell } from "./components/AppShell";

export default function Page() {
  return <AppShell />;
}`,
  });

  try {
    await page.goto(url);
    await expect(page.locator("#offline-banner")).toHaveCount(0);
    await expect(page.locator("#install-banner")).toHaveCount(0);
    await expect(page.locator("#update-banner")).toHaveCount(0);

    await page.evaluate(() => {
      const event = new Event("beforeinstallprompt") as Event & {
        prompt: () => Promise<void>;
        userChoice: Promise<{ outcome: "dismissed"; platform: string }>;
      };
      event.prompt = () => Promise.resolve();
      event.userChoice = Promise.resolve({ outcome: "dismissed", platform: "web" });
      window.dispatchEvent(event);
    });

    await expect(page.locator("#install-banner")).toBeVisible();
    await expect(page.locator("#offline-banner")).toHaveCount(0);

    await page.evaluate(() => window.dispatchEvent(new Event("mreact-update-ready")));

    await expect(page.locator("#update-banner")).toBeVisible();
    await expect(page.locator("#offline-banner")).toHaveCount(0);
  } finally {
    await close();
  }
});

test("dev server materializes later adjacent null client boundaries without earlier siblings", async ({
  page,
}) => {
  const { close, url } = await startDevFixtureServer({
    "components/AppShell.tsx": `import { InstallBanner } from "./InstallBanner";
import { OfflineBanner } from "./OfflineBanner";
import { UpdateBanner } from "./UpdateBanner";

export function AppShell() {
  return (
    <main>
      <h1>Settings</h1>
      <OfflineBanner />
      <InstallBanner />
      <UpdateBanner />
    </main>
  );
}`,
    "components/InstallBanner.tsx": `"use client";
import { cell } from "@reckona/mreact-reactive-core";

const visible = cell(false);
let watching = false;

function startWatch(): void {
  if (typeof window === "undefined" || watching) return;
  watching = true;
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    visible.set(true);
  });
}

export function InstallBanner() {
  startWatch();
  if (!visible.get()) return null;
  return <div id="install-banner">Install</div>;
}`,
    "components/OfflineBanner.tsx": `"use client";
import { cell } from "@reckona/mreact-reactive-core";

const visible = cell(false);
let watching = false;

function startWatch(): void {
  if (typeof window === "undefined" || watching) return;
  watching = true;
  window.addEventListener("mreact-offline-ready", () => visible.set(true));
}

export function OfflineBanner() {
  startWatch();
  if (!visible.get()) return null;
  return <div id="offline-banner">Offline</div>;
}`,
    "components/UpdateBanner.tsx": `"use client";
import { cell } from "@reckona/mreact-reactive-core";

const visible = cell(false);
let watching = false;

function startWatch(): void {
  if (typeof window === "undefined" || watching) return;
  watching = true;
  window.addEventListener("mreact-update-ready", () => visible.set(true));
}

export function UpdateBanner() {
  startWatch();
  if (!visible.get()) return null;
  return <div id="update-banner">Update</div>;
}`,
    "page.tsx": `import { AppShell } from "./components/AppShell";

export default function Page() {
  return <AppShell />;
}`,
  });

  try {
    await page.goto(url);
    await expect(page.locator("#offline-banner")).toHaveCount(0);
    await expect(page.locator("#install-banner")).toHaveCount(0);
    await expect(page.locator("#update-banner")).toHaveCount(0);

    await page.evaluate(() => {
      const event = new Event("beforeinstallprompt") as Event & {
        prompt: () => Promise<void>;
        userChoice: Promise<{ outcome: "dismissed"; platform: string }>;
      };
      event.prompt = () => Promise.resolve();
      event.userChoice = Promise.resolve({ outcome: "dismissed", platform: "web" });
      window.dispatchEvent(event);
    });

    await expect(page.locator("#install-banner")).toBeVisible();
    await expect(page.locator("#offline-banner")).toHaveCount(0);

    await page.evaluate(() => window.dispatchEvent(new Event("mreact-update-ready")));

    await expect(page.locator("#update-banner")).toBeVisible();
    await expect(page.locator("#offline-banner")).toHaveCount(0);
  } finally {
    await close();
  }
});

async function startFixtureServer(files: Record<string, string>): Promise<{
  close(): Promise<void>;
  url: string;
}> {
  const rootDir = await mkdtemp(join(tmpdir(), "mreact-router-e2e-fixture-"));
  const appDir = join(rootDir, "app");
  const outDir = join(rootDir, ".mreact");

  for (const [relativePath, code] of Object.entries(files)) {
    const file = join(appDir, relativePath);

    await mkdir(join(file, ".."), { recursive: true });
    await writeFile(file, code);
  }

  await buildApp({ appDir, outDir });
  const server = await startServer({ outDir, port: 0 });

  return {
    url: server.url,
    async close() {
      await server.close();
      await rm(rootDir, { force: true, recursive: true });
    },
  };
}

async function startDevFixtureServer(files: Record<string, string>): Promise<{
  close(): Promise<void>;
  url: string;
}> {
  const fixtureParentDir = join(process.cwd(), "test-results");
  await mkdir(fixtureParentDir, { recursive: true });
  const rootDir = await mkdtemp(join(fixtureParentDir, "mreact-router-dev-e2e-fixture-"));
  const appDir = join(rootDir, "app");

  await writeFile(
    join(rootDir, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: {
        jsx: "react-jsx",
        jsxImportSource: "@reckona/mreact",
      },
    }),
  );

  for (const [relativePath, code] of Object.entries(files)) {
    const file = join(appDir, relativePath);

    await mkdir(join(file, ".."), { recursive: true });
    await writeFile(file, code);
  }

  const server = await startDevServer({
    allowedSourceDirs: ["app"],
    port: 0,
    projectRoot: rootDir,
    routesDir: appDir,
  });

  return {
    url: server.url,
    async close() {
      await server.close();
      await rm(rootDir, { force: true, recursive: true });
    },
  };
}

declare global {
  interface Window {
    __mreactE2eShell?: HTMLElement | null;
  }
}
