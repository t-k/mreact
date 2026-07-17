import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { buildApp } from "../dist/build.js";
import { buildClientRouteBundle } from "../dist/client.js";
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
}`,
    "page.tsx": `import { save } from "./actions";

export const revalidate = 60;
export const navigationRuntime = true;

export function loader() {
  const state = globalThis as { __mreactE2eTitle?: string };
  return { title: state.__mreactE2eTitle ?? "Draft" };
}

export default function Page(props) {
  return <main><h1>{props.data.title}</h1><form action={save}><input name="title" value="Published" /><button type="submit">Save</button></form></main>;
}`,
  });

  try {
    const formRequests: Array<{ method: string; pathname: string; singleFlight: string | undefined }> = [];
    page.on("request", (request) => {
      const requestUrl = new URL(request.url());

      if (requestUrl.pathname === "/" || requestUrl.pathname === "/_mreact/actions") {
        formRequests.push({
          method: request.method(),
          pathname: requestUrl.pathname,
          singleFlight: request.headers()["x-mreact-action-single-flight"],
        });
      }
    });
    await page.goto(url);
    await expect(page.getByRole("heading", { name: "Draft" })).toBeVisible();
    await page.waitForFunction(() => globalThis.__mreactNavigationState?.installed === true);
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("heading", { name: "Published" })).toBeVisible();
    await expect(page).toHaveURL(`${url}/`);
    expect(formRequests).toEqual([
      { method: "GET", pathname: "/", singleFlight: undefined },
      { method: "POST", pathname: "/_mreact/actions", singleFlight: "1" },
    ]);
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

test("dev server hydrates interactive route pages that share app modules with loaders and API routes", async ({
  page,
}) => {
  const { close, url } = await startDevFixtureServer({
    "lib/task-store.ts": `let tasks = ["initial task"];

export function listTasks() {
  return tasks;
}

export function addTask(title: string) {
  tasks = [...tasks, title];
  return tasks;
}
`,
    "api/tasks/route.ts": `import { addTask } from "../../lib/task-store";

export async function POST(request: Request) {
  const body = await request.json();
  return Response.json({ tasks: addTask(String(body.title)) });
}
`,
    "page.tsx": `import { cell } from "@reckona/mreact-reactive-core";
import { listTasks } from "./lib/task-store";

export function loader() {
  return { tasks: listTasks() };
}

export default function Page(props) {
  const tasks = cell(props.data.tasks);
  async function createTask() {
    const response = await fetch("/api/tasks", {
      body: JSON.stringify({ title: "created task" }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    const result = await response.json();
    tasks.set(result.tasks);
  }
  return <main><h1>Tasks</h1><button type="button" onClick={createTask}>Create task</button><ul>{tasks.get().map((task) => <li>{task}</li>)}</ul></main>;
}`,
  });

  try {
    await page.goto(url);
    await expect(page.getByText("initial task")).toBeVisible();
    await page.getByRole("button", { name: "Create task" }).click();
    await expect(page.getByText("created task")).toBeVisible();
  } finally {
    await close();
  }
});

test("dev server hydrates compat client boundaries imported by route pages", async ({
  page,
}) => {
  const { close, url } = await startDevFixtureServer({
    "components/Counter.compat.tsx": `import { useState } from "@reckona/mreact-compat";

export function Counter() {
  const [count, setCount] = useState(0);
  return <button type="button" onClick={() => setCount((value) => value + 1)}>compat count: {count}</button>;
}
`,
    "page.tsx": `import { Counter } from "./components/Counter.compat";

export default function Page() {
  return <main><h1>Compat</h1><Counter /></main>;
}`,
  });

  try {
    await page.goto(url);
    await page.getByRole("button", { name: "compat count: 0" }).click();
    await expect(page.getByRole("button", { name: "compat count: 1" })).toBeVisible();
  } finally {
    await close();
  }
});

test("dev server materializes Futaba-like AppShell adjacent null client boundaries", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const worker = new EventTarget() as EventTarget & { state: string };
    worker.state = "installing";
    const registration = new EventTarget() as EventTarget & {
      readonly installing: EventTarget & { state: string };
    };
    Object.defineProperty(registration, "installing", {
      get: () => worker,
    });
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: {
        controller: {},
        ready: Promise.resolve(registration),
      },
    });
    const state = window as unknown as { __triggerSwUpdate?: () => void };
    state.__triggerSwUpdate = () => {
      registration.dispatchEvent(new Event("updatefound"));
      worker.state = "installed";
      worker.dispatchEvent(new Event("statechange"));
    };
  });

  const { close, url } = await startDevFixtureServer({
    "components/AppShell.tsx": `import { t } from "../lib/i18n";
import { activeLocale } from "../lib/locale-state";
import { InstallBanner } from "./InstallBanner";
import { OfflineBanner } from "./OfflineBanner";
import { ProfileLocaleSynchronizer } from "./ProfileLocaleSynchronizer";
import { SwUpdateBanner } from "./SwUpdateBanner";

export function AppShell() {
  const locale = activeLocale.get();
  return (
    <div>
      <header><a aria-label={t("app.name", locale)} href="/">FUTABA</a></header>
      <main><h1>{t("settings", locale)}</h1></main>
      <ProfileLocaleSynchronizer />
      <OfflineBanner />
      <InstallBanner />
      <SwUpdateBanner />
    </div>
  );
}`,
    "components/BottomBanner.tsx": `import type { JSX } from "@reckona/mreact/jsx-runtime";

interface BottomBannerProps {
  readonly class?: string;
  readonly id?: string;
  readonly children: JSX.Element | JSX.Element[];
}

export function BottomBanner(props: BottomBannerProps) {
  return (
    <div
      id={props.id}
      class={["fixed bottom-20 left-4 right-4 z-50 animate-slide-up", props.class ?? ""]
        .filter(Boolean)
        .join(" ")}
    >
      {props.children}
    </div>
  );
}`,
    "components/InstallBanner.tsx": `"use client";
import { cell } from "@reckona/mreact-reactive-core";
import { buttonClass } from "../lib/ui-classes";
import { t } from "../lib/i18n";
import { activeLocale } from "../lib/locale-state";
import { safeLocalStorage } from "../lib/safe-storage";
import { isBeforeInstallPromptEvent } from "../lib/type-guards";
import type { BeforeInstallPromptEvent } from "../types/dom";
import { BottomBanner } from "./BottomBanner";

const DISMISS_KEY = "futaba-install-dismissed";
const DISMISS_DURATION_MS = 7 * 24 * 60 * 60 * 1000;
const BANNER_ID = "futaba-install-banner";

const showBanner = cell(false);
const installPrompt = cell<BeforeInstallPromptEvent | null>(null);
const installWatchStarted = cell(false);
const installGhostButtonClass = buttonClass({ variant: "ghost", size: "sm" });
const installPrimaryButtonClass = buttonClass({ variant: "primary", size: "sm" });

const isStandaloneDisplayMode = (): boolean =>
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(display-mode: standalone)").matches;

const isDismissedRecently = (): boolean => {
  const dismissedAt = safeLocalStorage.getItem(DISMISS_KEY);
  if (!dismissedAt) return false;

  const elapsed = Date.now() - Number(dismissedAt);
  if (Number.isFinite(elapsed) && elapsed < DISMISS_DURATION_MS) return true;
  safeLocalStorage.removeItem(DISMISS_KEY);
  return false;
};

function startWatch(): void {
  if (typeof window === "undefined" || installWatchStarted.get()) return;
  installWatchStarted.set(true);
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    if (!isBeforeInstallPromptEvent(event)) return;
    if (isStandaloneDisplayMode()) return;
    if (isDismissedRecently()) return;
    installPrompt.set(event);
    showBanner.set(true);
  });
}

export function InstallBanner() {
  startWatch();
  if (!showBanner.get()) return null;

  const locale = activeLocale.get();
  const bannerClass = [
    "bg-white border rounded-xl px-4 py-3 flex items-center gap-3",
    showBanner.get() ? "" : "hidden pointer-events-none",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <BottomBanner id={BANNER_ID} class={bannerClass}>
      <div class="min-w-0 flex-1">
        <p>{t("pwa.installTitle", locale)}</p>
        <p>{t("pwa.installDescription", locale)}</p>
      </div>
      <button type="button" class={installGhostButtonClass}>{t("common.close", locale)}</button>
      <button type="button" class={installPrimaryButtonClass}>{t("pwa.install", locale)}:{installPrompt.get() === null ? "missing" : "ready"}</button>
    </BottomBanner>
  );
}`,
    "components/OfflineBanner.tsx": `"use client";
import { cell } from "@reckona/mreact-reactive-core";
import { t } from "../lib/i18n";
import { activeLocale } from "../lib/locale-state";

const online = cell(true);
let watching = false;

function startWatch(): void {
  if (typeof window === "undefined" || watching) return;
  watching = true;
  online.set(navigator.onLine);
  window.addEventListener("offline", () => online.set(false));
}

export function OfflineBanner() {
  startWatch();
  if (online.get()) return null;
  return <div id="futaba-offline-banner">{t("pwa.offline", activeLocale.get())}</div>;
}`,
    "components/ProfileLocaleSynchronizer.tsx": `import { cell } from "@reckona/mreact-reactive-core";
import { activeLocale, setActiveLocale } from "../lib/locale-state";

const started = cell(false);

export function ProfileLocaleSynchronizer() {
  if (!started.get()) {
    started.set(true);
    queueMicrotask(() => {
      if (activeLocale.get() !== "en") {
        setActiveLocale("en");
      }
    });
  }
  return <span aria-hidden="true" hidden data-locale-sync="" />;
}`,
    "components/SwUpdateBanner.tsx": `"use client";
import { cell } from "@reckona/mreact-reactive-core";
import { buttonClass } from "../lib/ui-classes";
import { t } from "../lib/i18n";
import { activeLocale } from "../lib/locale-state";
import { BottomBanner } from "./BottomBanner";

const BANNER_ID = "futaba-sw-update-banner";
const hasUpdate = cell(false);
const updateWatchStarted = cell(false);
const updateButtonClass = buttonClass({ variant: "secondary", size: "sm" });

function startWatch(): void {
  if (typeof window === "undefined" || updateWatchStarted.get()) return;
  if (!("serviceWorker" in navigator)) return;
  updateWatchStarted.set(true);
  void navigator.serviceWorker.ready.then((registration) => {
    registration.addEventListener("updatefound", () => {
      const worker = registration.installing;
      if (!worker) return;
      worker.addEventListener("statechange", () => {
        if (worker.state === "installed" && navigator.serviceWorker.controller) {
          hasUpdate.set(true);
        }
      });
    });
  });
}

export function SwUpdateBanner() {
  startWatch();
  if (!hasUpdate.get()) return null;

  const locale = activeLocale.get();
  const bannerClass = [
    "bg-primary-600 text-white rounded-lg px-4 py-3 flex items-center justify-between",
    hasUpdate.get() ? "" : "hidden pointer-events-none",
  ]
    .filter(Boolean)
    .join(" ");

  return <BottomBanner id={BANNER_ID} class={bannerClass}><span>{t("pwa.updateAvailable", locale)}</span><button type="button" class={updateButtonClass}>{t("pwa.update", locale)}</button></BottomBanner>;
}`,
    "lib/i18n.ts": `export type Locale = "ja" | "en";
const messages = {
  en: {
    "app.name": "FUTABA",
    "common.close": "Close",
    "pwa.installDescription": "Install the app for quick access.",
    "pwa.installTitle": "Install app",
    "pwa.install": "Install",
    "pwa.offline": "Offline",
    "pwa.update": "Update",
    "pwa.updateAvailable": "Update available",
    settings: "Settings",
  },
  ja: {
    "app.name": "FUTABA",
    "common.close": "閉じる",
    "pwa.installDescription": "アプリをインストールできます。",
    "pwa.installTitle": "アプリをインストール",
    "pwa.install": "インストール",
    "pwa.offline": "オフライン",
    "pwa.update": "更新",
    "pwa.updateAvailable": "新しいバージョンがあります",
    settings: "設定",
  },
};

export function t(key: keyof typeof messages.en, locale: Locale) {
  return messages[locale][key];
}`,
    "lib/locale-state.ts": `import { cell } from "@reckona/mreact-reactive-core";
import type { Locale } from "./i18n";

const readBrowserLocale = (): Locale => {
  if (typeof document === "undefined") return "ja";
  return document.cookie.includes("futaba_locale=en") ? "en" : "ja";
};

export const activeLocale = cell<Locale>(readBrowserLocale());

export const setActiveLocale = (locale: Locale): void => {
  activeLocale.set(locale);
  if (typeof document !== "undefined") {
    document.cookie = \`futaba_locale=\${locale}; Path=/; SameSite=Lax\`;
  }
};`,
    "lib/safe-storage.ts": `export const safeLocalStorage = {
  getItem(key: string): string | null {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  removeItem(key: string): void {
    try {
      window.localStorage.removeItem(key);
    } catch {}
  },
  setItem(key: string, value: string): void {
    try {
      window.localStorage.setItem(key, value);
    } catch {}
  },
};`,
    "lib/type-guards.ts": `import type { BeforeInstallPromptEvent } from "../types/dom";

export const isBeforeInstallPromptEvent = (event: Event): event is BeforeInstallPromptEvent =>
  "prompt" in event && "userChoice" in event;`,
    "lib/ui-classes.ts": `export function buttonClass(options: { readonly variant: string; readonly size: string }): string {
  return \`button \${options.variant} \${options.size}\`;
}`,
    "types/dom.ts": `export interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}`,
    "page.tsx": `import { AppShell } from "./components/AppShell";

export default function Page() {
  return <AppShell />;
}`,
  });

  try {
    await page.goto(url);
    await expect(page.getByRole("heading", { name: "設定" })).toBeVisible();
    await expect(page.locator("#futaba-offline-banner")).toHaveCount(0);
    await expect(page.locator("#futaba-install-banner")).toHaveCount(0);
    await expect(page.locator("#futaba-sw-update-banner")).toHaveCount(0);

    await page.evaluate(() => {
      const event = new Event("beforeinstallprompt") as Event & {
        prompt: () => Promise<void>;
        userChoice: Promise<{ outcome: "dismissed"; platform: string }>;
      };
      event.prompt = () => Promise.resolve();
      event.userChoice = Promise.resolve({ outcome: "dismissed", platform: "web" });
      window.dispatchEvent(event);
    });

    await expect(page.locator("#futaba-install-banner")).toBeVisible();
    await expect(page.getByRole("button", { name: "Install:ready" })).toBeVisible();

    await page.evaluate(() => {
      (window as unknown as { __triggerSwUpdate: () => void }).__triggerSwUpdate();
    });

    await expect(page.locator("#futaba-sw-update-banner")).toBeVisible();
    await expect(page.getByRole("button", { name: "Update" })).toBeVisible();
    await expect(page.locator("#futaba-offline-banner")).toHaveCount(0);
  } finally {
    await close();
  }
});

test("hydrated legal route preserves mapped fragment order and nested paragraph text", async ({
  page,
}) => {
  const { close, url } = await startFixtureServer({
    "legal/privacy/page.tsx": `"use client";

import { cell } from "@reckona/mreact-reactive-core";

interface Block {
  readonly textEn: string;
  readonly textJa: string;
}

interface Section {
  readonly blocks: readonly Block[];
  readonly heading: string;
}

const activeLocale = cell<"ja" | "en">("ja");
const legalPage: { readonly sections: readonly Section[] } = {
  sections: [
    {
      heading: "Introduction",
      blocks: [{
        textEn: "Service terms remain visible after hydration.",
        textJa: "利用規約本文はhydration後も表示されます。",
      }],
    },
    {
      heading: "Contact",
      blocks: [{
        textEn: "Personal information manager: CEO",
        textJa: "株式会社レコナ 個人情報保護管理者: 代表取締役",
      }],
    },
  ],
};

function InlineText(props: { readonly textEn: string; readonly textJa: string }) {
  return <span>{activeLocale.get() === "ja" ? props.textJa : props.textEn}</span>;
}

function LegalParagraphText(props: { readonly textEn: string; readonly textJa: string }) {
  return <InlineText textEn={props.textEn} textJa={props.textJa} />;
}

function LegalDocumentBlockView(props: { readonly block: Block }) {
  return (
    <p>
      <LegalParagraphText textEn={props.block.textEn} textJa={props.block.textJa} />
    </p>
  );
}

function LegalSectionView(props: { readonly section: Section }) {
  return (
    <>
      <h2>{props.section.heading}</h2>
      {props.section.blocks.map((block) => (
        <LegalDocumentBlockView block={block} key={block.textJa} />
      ))}
    </>
  );
}

export default function LegalPage() {
  return (
    <article>
      <button type="button" onClick={() => activeLocale.set("en")}>English</button>
      {legalPage.sections.map((section) => (
        <LegalSectionView section={section} key={section.heading} />
      ))}
      <footer>Company contact</footer>
    </article>
  );
}`,
  });

  try {
    await page.goto(`${url}/legal/privacy`);
    await expect(page.getByText("利用規約本文はhydration後も表示されます。")).toBeVisible();
    await expect(page.getByText("株式会社レコナ 個人情報保護管理者: 代表取締役")).toBeVisible();
    await expect(
      page.locator("article > *").evaluateAll((nodes) => nodes.map((node) => node.tagName)),
    ).resolves.toEqual(["BUTTON", "H2", "P", "H2", "P", "FOOTER"]);
    await expect(page.locator("article > :last-child")).toHaveText("Company contact");

    await page.getByRole("button", { name: "English" }).click();

    await expect(page.getByText("Service terms remain visible after hydration.")).toBeVisible();
    await expect(page.getByText("Personal information manager: CEO")).toBeVisible();
    await expect(
      page.locator("article > *").evaluateAll((nodes) => nodes.map((node) => node.tagName)),
    ).resolves.toEqual(["BUTTON", "H2", "P", "H2", "P", "FOOTER"]);
    await expect(page.locator("article > :last-child")).toHaveText("Company contact");
  } finally {
    await close();
  }
});

test("native boundary wrappers never duplicate during hydration", async ({ page }) => {
  const { close, url } = await startFixtureServer({
    "Shell.tsx": `export function Shell(props) {
  const pathname = typeof window === "undefined" ? "/" : window.location.pathname;
  return <main id="main-content" data-shell="settings" data-pathname={pathname}>{props.children}</main>;
}`,
    "page.tsx": `import { Shell } from "./Shell";

export default function Page() {
  return <Shell><h1>Boundary only</h1></Shell>;
}`,
    "full/page.tsx": `"use client";

import { Shell } from "../Shell";

export default function FullPage() {
  return <Shell><h1>Full route</h1></Shell>;
}`,
  });
  const routes = [
    { componentFallback: true, heading: "Boundary only", pathname: "/" },
    { componentFallback: false, heading: "Full route", pathname: "/full" },
  ] as const;

  try {
    for (const route of routes) {
      const response = await fetch(`${url}${route.pathname}`);
      const html = await response.text();

      expect(response.status).toBe(200);
      expect(html.match(/data-shell="settings"/g) ?? []).toHaveLength(1);
      expect(html.match(/id="main-content"/g) ?? []).toHaveLength(1);

      if (route.componentFallback) {
        expect(html).toContain('data-mreact-client-boundary-fallback="component"');
        expect(html).toContain('data-mreact-client-boundary-children="Shell"');
        expect(html).toContain("<!--mreact-client-boundary-children-start-->");
        expect(html).toContain("<!--mreact-client-boundary-children-end-->");
      } else {
        expect(html).not.toContain('data-mreact-client-boundary-fallback="component"');
        expect(html).not.toContain('data-mreact-client-boundary-children="Shell"');
        expect(html).not.toContain("<!--mreact-client-boundary-children-start-->");
        expect(html).not.toContain("<!--mreact-client-boundary-children-end-->");
      }
    }

    await page.addInitScript(() => {
      const report = {
        maxMainContent: 0,
        maxNestedShells: 0,
        maxShells: 0,
      };
      const sample = () => {
        report.maxMainContent = Math.max(
          report.maxMainContent,
          document.querySelectorAll("#main-content").length,
        );
        report.maxNestedShells = Math.max(
          report.maxNestedShells,
          document.querySelectorAll("[data-shell] [data-shell]").length,
        );
        report.maxShells = Math.max(
          report.maxShells,
          document.querySelectorAll("[data-shell]").length,
        );
      };
      const observer = new MutationObserver(sample);
      observer.observe(document, { childList: true, subtree: true });
      const tick = () => {
        sample();
        if (!document.documentElement?.hasAttribute("data-mreact-hydrated")) {
          requestAnimationFrame(tick);
        }
      };

      (
        globalThis as typeof globalThis & {
          __mreactHydrationReport?: typeof report;
        }
      ).__mreactHydrationReport = report;
      requestAnimationFrame(tick);
    });

    for (const route of routes) {
      await page.goto(`${url}${route.pathname}`);
      await expect(page.locator("html")).toHaveAttribute("data-mreact-hydrated", "true");
      await expect(page.getByRole("heading", { name: route.heading })).toHaveCount(1);
      await expect(page.locator("[data-shell='settings']")).toHaveCount(1);
      await expect(page.locator("[data-shell='settings'] [data-shell='settings']")).toHaveCount(0);
      await expect(page.locator("script[data-mreact-client-boundary-props]")).toHaveCount(0);

      const report = await page.evaluate(
        () =>
          (
            globalThis as typeof globalThis & {
              __mreactHydrationReport?: {
                maxMainContent: number;
                maxNestedShells: number;
                maxShells: number;
              };
            }
          ).__mreactHydrationReport,
      );

      expect(report).toEqual({
        maxMainContent: 1,
        maxNestedShells: 0,
        maxShells: 1,
      });
    }
  } finally {
    await close();
  }
});

test("route resume removes stale SSR siblings after replacing a boundary template", async ({
  page,
}) => {
  const appDir = await mkdtemp(join(tmpdir(), "mreact-route-resume-browser-"));
  const file = join(appDir, "page.mreact.tsx");
  const code = `import { cell } from "@reckona/mreact-reactive-core";

export default function Page() {
  const count = cell(0);
  return <main data-shell="active"><h1>Settings</h1><button type="button" onClick={() => count.set(value => value + 1)}>count: {count.get()}</button></main>;
}`;
  await writeFile(file, code);
  const bundle = await buildClientRouteBundle({
    code,
    filename: file,
    routePath: "/",
  });
  const html = [
    "<!doctype html><html><body>",
    '<div data-mreact-route-id="index"><template data-mreact-client-boundary="Shell"></template><main data-shell="stale"><h1>Stale settings</h1></main><script type="application/json" data-mreact-client-boundary-props="Shell">{}</script></div>',
    '<script type="application/json" id="mreact-props-index">{}</script>',
    '<script type="application/json" id="mreact-client-references-index">[]</script>',
    '<script type="module" src="/route.js"></script>',
    "</body></html>",
  ].join("");
  const server = createServer((request, response) => {
    if (request.url === "/route.js") {
      response.writeHead(200, { "content-type": "text/javascript; charset=utf-8" });
      response.end(bundle);
      return;
    }

    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(html);
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();

  if (address === null || typeof address === "string") {
    server.close();
    await rm(appDir, { force: true, recursive: true });
    throw new Error("Route resume browser fixture did not bind a TCP port.");
  }

  try {
    await page.goto(`http://127.0.0.1:${address.port}`);
    const marker = page.locator("[data-mreact-route-id='index']");

    await expect(marker.locator(":scope > *")).toHaveCount(1);
    await expect(marker.locator("main")).toHaveCount(1);
    await expect(marker.locator("[data-shell='active']")).toHaveCount(1);
    await expect(marker.locator("[data-shell='stale']")).toHaveCount(0);
    await expect(marker.locator("script[data-mreact-client-boundary-props]")).toHaveCount(0);
    await page.getByRole("button", { name: "count: 0" }).click();
    await expect(page.getByRole("button", { name: "count: 1" })).toBeVisible();
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error === undefined ? resolve() : reject(error)));
    });
    await rm(appDir, { force: true, recursive: true });
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
