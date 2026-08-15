import { createServer, get, request as nodeRequest } from "node:http";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, test } from "vitest";
import { buildApp } from "../src/build.js";
import { startDevServer, type StartDevServerOptions } from "../src/dev-server.js";
import type { AppRouterLogEvent, AppRouterLogger } from "../src/logger.js";
import { renderBuiltAppRequest } from "../src/serve.js";
import { loadMreactRouterViteConfig } from "../src/vite-config.js";

const servers: Array<{ close(): Promise<void> }> = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));
});

describe("startDevServer", () => {
  test("applies query dehydration filtering in development", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-dev-dehydrate-"));
    await writeFile(
      join(appDir, "page.tsx"),
      `export async function loader({ queryClient }) {
  queryClient.setQueryData(["public"], "visible-value");
  queryClient.setQueryData(["private"], "secret-value");
}
export default function Page() { return <main>Query state</main>; }`,
    );
    await writeFile(
      join(appDir, "dehydrate-policy.ts"),
      `export const dehydrateOptions = {
  shouldDehydrateQuery(entry) {
    return entry.queryKey[0] === "public";
  },
};`,
    );
    const server = await startTrackedDevServer({
      appDir,
      dehydratePolicyModule: "dehydrate-policy.ts",
      port: 0,
    });

    const html = await (await fetch(server.url)).text();

    expect(html).toContain("visible-value");
    expect(html).not.toContain("secret-value");
  });

  test("serves client route modules", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-dev-"));
    await writeFile(
      join(appDir, "page.mreact.tsx"),
      `import { cell } from "@reckona/mreact-reactive-core";

export default function Page() {
  const count = cell(0);
  return <button type="button" onClick={() => count.set(value => value + 1)}>count: {count.get()}</button>;
}`,
    );
    const server = await startTrackedDevServer({ appDir, port: 0 });

    const response = await fetch(`${server.url}/_mreact/client/routes/index.js`);
    const script = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/javascript");
    expect(script).toContain("__mreactResumeRoute");
  });

  test("dev client route modules keep app-local singletons in Vite's shared module graph", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-dev-shared-singleton-"));
    await mkdir(join(appDir, "login"), { recursive: true });
    await mkdir(join(appDir, "mfa-challenge"), { recursive: true });
    await mkdir(join(appDir, "lib"), { recursive: true });
    await writeFile(
      join(appDir, "lib", "mfa-pending-store.ts"),
      `let pending: { ticket: string } | null = null;

export function setMfaPending(value: { ticket: string }) {
  pending = value;
}

export function getMfaPending() {
  return pending;
}

export function getMfaPendingStoreMarker() {
  return "__mfa_pending_store_marker__";
}
`,
    );
    await writeFile(
      join(appDir, "login", "page.tsx"),
      `import { getMfaPendingStoreMarker, setMfaPending } from "../lib/mfa-pending-store";

export default function Login() {
  return <a data-store={getMfaPendingStoreMarker()} href="/mfa-challenge" onClick={() => setMfaPending({ ticket: "ticket-totp-1" })}>Continue</a>;
}
`,
    );
    await writeFile(
      join(appDir, "mfa-challenge", "page.tsx"),
      `import { getMfaPending } from "../lib/mfa-pending-store";

export default function MfaChallenge() {
  const pending = getMfaPending();
  return <main><h1>{pending?.ticket ?? "expired"}</h1><button type="button" onClick={() => undefined}>noop</button></main>;
}
`,
    );
    const server = await startTrackedDevServer({ appDir, port: 0 });

    const [loginResponse, challengeResponse] = await Promise.all([
      fetch(`${server.url}/_mreact/client/routes/login.js`),
      fetch(`${server.url}/_mreact/client/routes/mfa-challenge.js`),
    ]);
    const [loginScript, challengeScript] = await Promise.all([
      loginResponse.text(),
      challengeResponse.text(),
    ]);

    expect(loginResponse.status).toBe(200);
    expect(challengeResponse.status).toBe(200);
    expect(loginScript).toContain("mfa-pending-store");
    expect(challengeScript).toContain("mfa-pending-store");
    expect(loginScript).not.toContain("let pending");
    expect(challengeScript).not.toContain("let pending");
  });

  test("dev client route modules lower early JSX returns before Vite parses query modules", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-dev-early-jsx-return-"));
    await writeFile(
      join(appDir, "page.tsx"),
      `"use client";

function StatusPage(props: { status: string }) {
  return <main>{props.status}</main>;
}

export default function Page() {
  if (window.location.pathname === "/missing") {
    return <StatusPage status="not_found" />;
  }

  return <StatusPage status="ok" />;
}
`,
    );
    const server = await startTrackedDevServer({ appDir, port: 0 });

    const response = await fetch(`${server.url}/_mreact/client/routes/index.js`);
    const script = await response.text();

    expect(response.status).toBe(200);
    expect(script).toContain("__mreactResumeRoute");
    expect(script).not.toContain("return <StatusPage");
  });

  test("dev client route modules keep parenthesized early JSX returns valid", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-dev-early-jsx-oxc-"));
    await writeFile(
      join(appDir, "page.tsx"),
      `"use client";

function AuthLayout(props: { children: unknown }) {
  return <main>{props.children}</main>;
}

export default function Page() {
  const pending = "";
  if (pending === "") {
    return (
      <AuthLayout>
        <h1>Unavailable</h1>
      </AuthLayout>
    );
  }

  return <AuthLayout><h1>Ready</h1></AuthLayout>;
}
`,
    );
    const server = await startTrackedDevServer({ appDir, port: 0 });

    const response = await fetch(`${server.url}/_mreact/client/routes/index.js`);
    const script = await response.text();

    expect(response.status).toBe(200);
    expect(script).toContain("__mreactResumeRoute");
    expect(script).not.toContain("return <AuthLayout");
  });

  test("dev client boundary dependencies are transformed to DOM output", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "mreact-app-dev-boundary-dep-"));
    const appDir = join(projectRoot, "app");
    const componentsDir = join(projectRoot, "components");
    await mkdir(appDir, { recursive: true });
    await mkdir(componentsDir, { recursive: true });
    await writeFile(
      join(componentsDir, "AccountMenu.tsx"),
      `"use client";

export function AccountMenu() {
  return <button type="button">Account</button>;
}`,
    );
    await writeFile(
      join(componentsDir, "AppShell.tsx"),
      `import { AccountMenu } from "./AccountMenu";

export function AppShell() {
  return <header><AccountMenu /></header>;
}`,
    );
    await writeFile(
      join(appDir, "layout.tsx"),
      `import { Slot } from "@reckona/mreact-router/app-router-globals";
import { AppShell } from "../components/AppShell";

export default function Layout() {
  return <html><body><AppShell /><Slot /></body></html>;
}`,
    );
    await writeFile(
      join(appDir, "page.tsx"),
      `export default function Page() {
  return <main>Home</main>;
}`,
    );
    const server = await startTrackedDevServer({
      allowedSourceDirs: ["app", "components"],
      projectRoot,
      routesDir: "app",
      port: 0,
    });

    const routeAsset = await fetch(`${server.url}/_mreact/client/routes/index.js`);
    const routeScript = await routeAsset.text();
    const boundaryModule = await fetch(`${server.url}/components/AccountMenu.tsx`);
    const boundaryScript = await boundaryModule.text();

    expect(routeAsset.status).toBe(200);
    expect(routeScript).toContain("/components/AccountMenu.tsx");
    expect(boundaryModule.status).toBe(200);
    expect(boundaryScript).toContain("createTemplate");
    expect(boundaryScript).not.toContain("react/jsx-dev-runtime");
  });

  test("dev client boundary dependency transform ignores server utilities and resolves compat runtime", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "mreact-app-dev-boundary-compat-"));
    const appDir = join(projectRoot, "src", "app");
    const componentsDir = join(projectRoot, "src", "components");
    const libDir = join(projectRoot, "src", "lib");
    await mkdir(appDir, { recursive: true });
    await mkdir(componentsDir, { recursive: true });
    await mkdir(libDir, { recursive: true });
    await writeFile(
      join(libDir, "auth-guard.ts"),
      `export function hasSession(cookieHeader: string | null): boolean {
  return cookieHeader?.includes("session=") === true;
}

export function redirectToLogin(request: Request): Response {
  return new Response(null, {
    headers: { location: new URL("/login", request.url).pathname },
    status: 303,
  });
}`,
    );
    await writeFile(
      join(componentsDir, "VideoPlayer.compat.tsx"),
      `export function VideoPlayer() {
  return <video controls />;
}`,
    );
    await writeFile(
      join(componentsDir, "AppShell.tsx"),
      `import { VideoPlayer } from "./VideoPlayer.compat";

export function AppShell() {
  return <header><VideoPlayer /></header>;
}`,
    );
    await writeFile(
      join(appDir, "layout.tsx"),
      `import { Slot } from "@reckona/mreact-router/app-router-globals";
import { hasSession, redirectToLogin } from "../lib/auth-guard";
import { AppShell } from "../components/AppShell";

export function loader(props: { request: Request }) {
  if (!hasSession(props.request.headers.get("cookie"))) {
    return redirectToLogin(props.request);
  }
  return {};
}

export default function Layout() {
  return <html><body><AppShell /><Slot /></body></html>;
}`,
    );
    await writeFile(
      join(appDir, "page.tsx"),
      `export default function Page() {
  return <main>Home</main>;
}`,
    );
    const server = await startTrackedDevServer({
      allowedSourceDirs: ["src"],
      projectRoot,
      routesDir: "src/app",
      port: 0,
    });

    const [routeAsset, compatComponent] = await Promise.all([
      fetch(`${server.url}/_mreact/client/routes/index.js`, {
        headers: { cookie: "session=1" },
      }),
      fetch(`${server.url}/src/components/VideoPlayer.compat.tsx`),
    ]);
    const [routeAssetText, compatComponentText] = await Promise.all([
      routeAsset.text(),
      compatComponent.text(),
    ]);

    expect(routeAsset.status, routeAssetText).toBe(200);
    expect(routeAssetText).not.toContain("MR_UNSUPPORTED_COMPONENT_RETURN");
    expect(compatComponent.status, compatComponentText).toBe(200);
    expect(compatComponentText).toContain("jsxDEV");
    expect(compatComponentText).not.toContain("Failed to resolve import");
  });

  test("serves page-imported AppShell client boundary dependencies from matched route assets", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "mreact-app-dev-page-app-shell-"));
    const appDir = join(projectRoot, "src", "app");
    const componentsDir = join(projectRoot, "src", "components", "layout");
    const libDir = join(projectRoot, "src", "lib");
    await mkdir(join(appDir, "settings"), { recursive: true });
    await mkdir(componentsDir, { recursive: true });
    await mkdir(libDir, { recursive: true });
    await writeFile(
      join(libDir, "locale-state.ts"),
      `import { cell } from "@reckona/mreact-reactive-core";

export const activeLocale = cell("ja");

export function setActiveLocale(locale: "ja" | "en"): void {
  activeLocale.set(locale);
}
`,
    );
    await writeFile(
      join(libDir, "i18n.ts"),
      `export function t(key: string, locale: string): string {
  return \`\${locale}:\${key}\`;
}
`,
    );
    await writeFile(
      join(componentsDir, "UploadNavigationItem.tsx"),
      `"use client";
import { cell } from "@reckona/mreact-reactive-core";
import { t } from "../../lib/i18n";
import { activeLocale } from "../../lib/locale-state";

const canUpload = cell(false);

export function UploadNavigationItem(props: { readonly linkClass: string }) {
  return <li hidden={!canUpload.get()}><a aria-label={t("upload", activeLocale.get())} class={props.linkClass} href="/upload">Upload</a></li>;
}`,
    );
    await writeFile(
      join(componentsDir, "AccountMenu.tsx"),
      `import { cell } from "@reckona/mreact-reactive-core";
import { t } from "../../lib/i18n";
import { activeLocale } from "../../lib/locale-state";

export function AccountMenu() {
  const open = cell(false);
  return <button type="button" aria-expanded={open.get() ? "true" : "false"} onClick={() => open.set(!open.get())} aria-label={t("account", activeLocale.get())}>Account</button>;
}`,
    );
    await writeFile(
      join(componentsDir, "AppShell.tsx"),
      `import type { JSX } from "@reckona/mreact/jsx-runtime";
import { AccountMenu } from "./AccountMenu";
import { UploadNavigationItem } from "./UploadNavigationItem";

function NavigationLinks() {
  const linkClass = "nav-link";
  return <ul><UploadNavigationItem linkClass={linkClass} /></ul>;
}

export function AppShell(props: { readonly children: JSX.Element }) {
  return <div><header><AccountMenu /></header><nav aria-label="Desktop navigation"><NavigationLinks /></nav><main>{props.children}</main></div>;
}`,
    );
    await writeFile(
      join(appDir, "settings", "page.tsx"),
      `import { AppShell } from "../../components/layout/AppShell";
import { readFileSync } from "node:fs";

export function loader() {
  if (readFileSync === undefined) throw new Error("unreachable");
  return {};
}

export default function SettingsPage() {
  return <AppShell><section>Settings</section></AppShell>;
}`,
    );
    const server = await startTrackedDevServer({
      allowedSourceDirs: ["src"],
      projectRoot,
      routesDir: "src/app",
      port: 0,
    });

    const htmlResponse = await fetch(`${server.url}/settings`);
    const html = await htmlResponse.text();
    const routeAsset = await fetch(`${server.url}/_mreact/client/routes/settings.js`);
    const routeScript = await routeAsset.text();
    const [accountMenu, uploadNavigationItem] = await Promise.all([
      fetch(`${server.url}/src/components/layout/AccountMenu.tsx`),
      fetch(`${server.url}/src/components/layout/UploadNavigationItem.tsx`),
    ]);
    const [localeState, i18n] = await Promise.all([
      fetch(`${server.url}/src/lib/locale-state.ts`),
      fetch(`${server.url}/src/lib/i18n.ts`),
    ]);
    const [accountMenuText, uploadNavigationItemText, localeStateText, i18nText] =
      await Promise.all([
        accountMenu.text(),
        uploadNavigationItem.text(),
        localeState.text(),
        i18n.text(),
      ]);

    expect(htmlResponse.status, html).toBe(200);
    expect(html).toContain('src="/_mreact/client/routes/settings.js"');
    expect(html).toContain('data-mreact-client-boundary="AccountMenu"');
    expect(html).toContain('data-mreact-client-boundary="UploadNavigationItem"');
    expect(routeAsset.status, routeScript).toBe(200);
    expect(routeScript).toContain("/src/components/layout/AccountMenu.tsx");
    expect(routeScript).toContain("/src/components/layout/UploadNavigationItem.tsx");
    expect(accountMenu.status, accountMenuText).toBe(200);
    expect(uploadNavigationItem.status, uploadNavigationItemText).toBe(200);
    expect(localeState.status, localeStateText).toBe(200);
    expect(i18n.status, i18nText).toBe(200);
    expect(accountMenuText).toContain("createTemplate");
    expect(uploadNavigationItemText).toContain("bindProp");
    expect(uploadNavigationItemText).not.toContain("react/jsx-dev-runtime");
    expect(localeStateText).toContain("export const activeLocale");
    expect(localeStateText).toContain("export function setActiveLocale");
    expect(localeStateText).not.toBe("export {};");
    expect(i18nText).toContain("export function t");
    expect(i18nText).not.toBe("export {};");
  });

  test("streams page chunks without buffering the whole response", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-dev-stream-"));
    await writeFile(
      join(appDir, "page.mreact.tsx"),
      `export const stream = true;

export default function Page() {
  const name = new Promise((resolve) => setTimeout(() => resolve("Ada"), 200));
  return <main><Await value={name} placeholder={<em>loading</em>}>{value => <strong>{value}</strong>}</Await></main>;
}`,
    );
    const server = await startTrackedDevServer({ appDir, port: 0 });

    const firstChunk = await firstResponseChunk(server.url);

    expect(firstChunk).toContain("<!DOCTYPE html>");
    expect(firstChunk).toContain("<em>loading</em>");
    expect(firstChunk).not.toContain("<strong>Ada</strong>");
  });

  test("passes request headers and body to route handlers", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-dev-request-"));
    await mkdir(join(appDir, "api", "echo"), { recursive: true });
    await writeFile(
      join(appDir, "api", "echo", "route.ts"),
      `export async function POST(request: Request) {
  return Response.json({
    body: await request.text(),
    header: request.headers.get("x-mreact-test"),
    method: request.method,
  });
}`,
    );
    const server = await startTrackedDevServer({ appDir, port: 0 });

    const response = await postJson(`${server.url}/api/echo`, "hello body");

    expect(response.status).toBe(200);
    expect(JSON.parse(response.body)).toEqual({
      body: "hello body",
      header: "present",
      method: "POST",
    });
  });

  test("shares app-local modules between dev route handlers and page loaders", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "mreact-app-dev-shared-loader-api-"));
    const appDir = join(projectRoot, "src", "app");
    const libDir = join(projectRoot, "src", "lib");
    await mkdir(join(appDir, "api", "sensors", "$name"), { recursive: true });
    await mkdir(libDir, { recursive: true });
    await writeFile(
      join(libDir, "sensor-store.ts"),
      `let sensors = ["Sensor to Delete", "Sensor to Keep"];

export function listSensors() {
  return sensors;
}

export function deleteSensor(name: string) {
  sensors = sensors.filter((sensor) => sensor !== name);
}
`,
    );
    await writeFile(
      join(appDir, "page.tsx"),
      `import { listSensors } from "../lib/sensor-store";

export function loader() {
  return { sensors: listSensors() };
}

export default function Page(props) {
  return <main>{props.data.sensors.map((sensor) => <article>{sensor}</article>)}</main>;
}
`,
    );
    await writeFile(
      join(appDir, "api", "sensors", "$name", "route.ts"),
      `import { deleteSensor } from "../../../../lib/sensor-store";

export function DELETE(_request: Request, context: { params: { name: string } }) {
  deleteSensor(context.params.name);
  return new Response(null, { status: 204 });
}
`,
    );
    const server = await startTrackedDevServer({
      allowedSourceDirs: ["src"],
      projectRoot,
      routesDir: "src/app",
      port: 0,
    });

    const before = await fetch(`${server.url}/`);
    const beforeHtml = await before.text();
    const deleted = await fetch(`${server.url}/api/sensors/Sensor%20to%20Delete`, {
      method: "DELETE",
    });
    const after = await fetch(`${server.url}/`, {
      headers: {
        "x-mreact-navigation": "1",
        "x-mreact-navigation-cache": "reload",
      },
    });
    const afterHtml = await after.text();

    expect(beforeHtml).toContain("Sensor to Delete");
    expect(deleted.status).toBe(204);
    expect(afterHtml).not.toContain("Sensor to Delete");
    expect(afterHtml).toContain("Sensor to Keep");
  });

  test("runs dev route handlers that directly import allowed CJS and ESM packages", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "mreact-app-dev-api-externals-"));
    const appDir = join(projectRoot, "src", "app");
    const cjsPackageDir = join(projectRoot, "node_modules", "fixture-cjs-db");
    const esmPackageDir = join(projectRoot, "node_modules", "fixture-esm-codec");
    await mkdir(join(appDir, "api", "tasks"), { recursive: true });
    await mkdir(cjsPackageDir, { recursive: true });
    await mkdir(esmPackageDir, { recursive: true });
    await writeFile(
      join(projectRoot, "package.json"),
      JSON.stringify({
        dependencies: {
          "fixture-cjs-db": "1.0.0",
          "fixture-esm-codec": "1.0.0",
        },
        type: "module",
      }),
    );
    await writeFile(
      join(cjsPackageDir, "package.json"),
      JSON.stringify({ main: "index.js", name: "fixture-cjs-db" }),
    );
    await writeFile(
      join(cjsPackageDir, "index.js"),
      `let tasks = ["initial task"];
module.exports = {
  all() {
    return tasks;
  },
  insert(title) {
    tasks = [...tasks, title];
    return tasks;
  },
};
`,
    );
    await writeFile(
      join(esmPackageDir, "package.json"),
      JSON.stringify({ name: "fixture-esm-codec", type: "module" }),
    );
    await writeFile(
      join(esmPackageDir, "index.js"),
      `export function encodeTasks(tasks) {
  return tasks.map((task) => ({ title: task }));
}
`,
    );
    await writeFile(
      join(appDir, "api", "tasks", "route.ts"),
      `import db from "fixture-cjs-db";
import { encodeTasks } from "fixture-esm-codec";

export function GET() {
  return Response.json({ tasks: encodeTasks(db.all()) });
}

export async function POST(request: Request) {
  const body = await request.json();
  return Response.json({ tasks: encodeTasks(db.insert(String(body.title))) });
}
`,
    );
    const server = await startTrackedDevServer({
      allowedSourceDirs: ["src"],
      projectRoot,
      routesDir: "src/app",
      port: 0,
    });

    const getResponse = await fetch(`${server.url}/api/tasks`);
    const postResponse = await fetch(`${server.url}/api/tasks`, {
      body: JSON.stringify({ title: "created task" }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });

    expect(getResponse.status).toBe(200);
    await expect(getResponse.json()).resolves.toEqual({
      tasks: [{ title: "initial task" }],
    });
    expect(postResponse.status).toBe(200);
    await expect(postResponse.json()).resolves.toEqual({
      tasks: [{ title: "initial task" }, { title: "created task" }],
    });
  });

  test("runs dev route handlers that call bindings-style native addon loaders", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "mreact-app-dev-api-bindings-"));
    const appDir = join(projectRoot, "src", "app");
    const packageDir = join(projectRoot, "node_modules", "fixture-native-bindings-loader");
    const packageLibDir = join(packageDir, "lib");
    await mkdir(join(appDir, "api", "native"), { recursive: true });
    await mkdir(packageLibDir, { recursive: true });
    await writeFile(
      join(projectRoot, "package.json"),
      JSON.stringify({
        dependencies: {
          "fixture-native-bindings-loader": "1.0.0",
        },
        type: "module",
      }),
    );
    await writeFile(
      join(packageDir, "package.json"),
      JSON.stringify({ main: "index.js", name: "fixture-native-bindings-loader" }),
    );
    await writeNativeBindingsFixture(packageDir);
    await writeFile(
      join(appDir, "api", "native", "route.ts"),
      `import Database from "fixture-native-bindings-loader";

export function GET() {
  const db = new Database();
  return Response.json({
    callerFileName: db.callerFileName,
    moduleFilename: Database.moduleFilename,
  });
}
`,
    );
    const server = await startTrackedDevServer({
      allowedSourceDirs: ["src"],
      projectRoot,
      routesDir: "src/app",
      port: 0,
    });

    const response = await fetch(`${server.url}/api/native`);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      callerFileName: join(packageLibDir, "database.js"),
      moduleFilename: join(packageDir, "index.js"),
    });
  });

  test("uses routesDir as the default allowed source directory for dev route externalization", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "mreact-app-dev-api-routes-dir-externals-"));
    const appDir = join(projectRoot, "app");
    const packageDir = join(projectRoot, "node_modules", "fixture-native-bindings-loader");
    const packageLibDir = join(packageDir, "lib");
    await mkdir(join(appDir, "api", "native"), { recursive: true });
    await mkdir(packageLibDir, { recursive: true });
    await writeFile(join(projectRoot, "package.json"), JSON.stringify({ type: "module" }));
    await writeFile(
      join(packageDir, "package.json"),
      JSON.stringify({ main: "index.js", name: "fixture-native-bindings-loader" }),
    );
    await writeNativeBindingsFixture(packageDir);
    await writeFile(
      join(appDir, "api", "native", "route.ts"),
      `import Database from "fixture-native-bindings-loader";

export function GET() {
  const db = new Database();
  return Response.json({
    callerFileName: db.callerFileName,
    moduleFilename: Database.moduleFilename,
  });
}
`,
    );
    const server = await startTrackedDevServer({
      importPolicy: { allowedPackages: ["fixture-native-bindings-loader"] },
      projectRoot,
      routesDir: "app",
      port: 0,
    });

    const response = await fetch(`${server.url}/api/native`);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      callerFileName: join(packageLibDir, "database.js"),
      moduleFilename: join(packageDir, "index.js"),
    });
  });

  test("applies importPolicy from vite.config.ts when startDevServer loads project config", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "mreact-app-dev-vite-import-policy-"));
    const appDir = join(projectRoot, "app");
    const packageDir = join(projectRoot, "node_modules", "fixture-native-bindings-loader");
    const packageLibDir = join(packageDir, "lib");
    await mkdir(join(appDir, "api", "native"), { recursive: true });
    await mkdir(packageLibDir, { recursive: true });
    await writeFile(join(projectRoot, "package.json"), JSON.stringify({ type: "module" }));
    await writeFile(
      join(packageDir, "package.json"),
      JSON.stringify({ main: "index.js", name: "fixture-native-bindings-loader" }),
    );
    await writeNativeBindingsFixture(packageDir);
    await writeFile(
      join(appDir, "api", "native", "route.ts"),
      `import Database from "fixture-native-bindings-loader";

export function GET() {
  const db = new Database();
  return Response.json({
    callerFileName: db.callerFileName,
    moduleFilename: Database.moduleFilename,
  });
}
`,
    );
    await writeViteConfig(projectRoot, {
      importPolicy: { allowedPackages: ["fixture-native-bindings-loader"] },
      publicDir: "public",
      routesDir: "app",
    });

    const server = await startTrackedDevServer({
      projectRoot,
      port: 0,
    });

    const response = await fetch(`${server.url}/api/native`);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      callerFileName: join(packageLibDir, "database.js"),
      moduleFilename: join(packageDir, "index.js"),
    });
  });

  test("applies vite.config.ts importPolicy to stream pages loaded by startDevServer", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "mreact-app-dev-vite-stream-policy-"));
    const appDir = join(projectRoot, "app");
    const packageDir = join(projectRoot, "node_modules", "fixture-native-bindings-loader");
    const packageLibDir = join(packageDir, "lib");
    await mkdir(appDir, { recursive: true });
    await mkdir(packageLibDir, { recursive: true });
    await writeFile(join(projectRoot, "package.json"), JSON.stringify({ type: "module" }));
    await writeFile(
      join(packageDir, "package.json"),
      JSON.stringify({ main: "index.js", name: "fixture-native-bindings-loader" }),
    );
    await writeNativeBindingsFixture(packageDir);
    await writeFile(
      join(appDir, "page.tsx"),
      `import Database from "fixture-native-bindings-loader";

export const stream = true;

function readNativeBinding() {
  const db = new Database();
  return db.callerFileName;
}

export default function Page() {
  return <main><Await value={Promise.resolve().then(readNativeBinding)} placeholder={<span>Loading</span>}>{file => <strong>{file}</strong>}</Await></main>;
}
`,
    );
    await writeViteConfig(projectRoot, {
      importPolicy: { allowedPackages: ["fixture-native-bindings-loader"] },
      publicDir: "public",
      routesDir: "app",
    });

    const server = await startTrackedDevServer({
      projectRoot,
      port: 0,
    });

    const response = await fetch(server.url);
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain(join(packageLibDir, "database.js"));
  });

  test("applies Vite define values consistently in dev and built Node SSR", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "mreact-app-dev-built-define-"));
    const appDir = join(projectRoot, "app");
    const outDir = join(projectRoot, ".mreact");
    const hostileValue = `quoted "</script><script>nope</script>" value`;
    const viteModule = pathToFileURL(
      join(process.cwd(), "packages", "router", "src", "vite.ts"),
    ).href;
    await mkdir(appDir, { recursive: true });
    await writeFile(join(projectRoot, "package.json"), JSON.stringify({ type: "module" }));
    await writeFile(
      join(appDir, "page.tsx"),
      `declare const __MREACT_DEFINE_VALUE__: string;

export function loader() {
  return {
    defineValue: __MREACT_DEFINE_VALUE__,
    ssr: import.meta.env.SSR,
  };
}

export default function Page(props) {
  return <main>{props.data.defineValue}::{String(props.data.ssr)}</main>;
}
`,
    );
    await writeFile(
      join(projectRoot, "vite.config.ts"),
      `import { mreactRouter } from ${JSON.stringify(viteModule)};

export default {
  define: {
    __MREACT_DEFINE_VALUE__: ${JSON.stringify(JSON.stringify(hostileValue))},
  },
  plugins: [
    mreactRouter({
      projectRoot: __dirname,
      publicDir: "public",
      routesDir: "app",
    }),
  ],
};
`,
    );

    const server = await startTrackedDevServer({
      projectRoot,
      port: 0,
    });
    const devResponse = await fetch(server.url);
    await buildApp({
      outDir,
      projectRoot,
      routesDir: "app",
      targets: ["node"],
      viteConfig: {
        define: {
          __MREACT_DEFINE_VALUE__: JSON.stringify(hostileValue),
        },
      },
    });
    const builtResponse = await renderBuiltAppRequest({
      outDir,
      request: new Request("http://local.test/"),
    });
    const devHtml = await devResponse.text();
    const builtHtml = await builtResponse.text();
    const expected =
      "quoted &quot;&lt;/script&gt;&lt;script&gt;nope&lt;/script&gt;&quot; value::true";

    expect(devResponse.status, devHtml).toBe(200);
    expect(builtResponse.status, builtHtml).toBe(200);
    expect(devHtml).toContain(expected);
    expect(builtHtml).toContain(expected);
    expect(devHtml).not.toContain("</script><script>nope</script>");
    expect(builtHtml).not.toContain("</script><script>nope</script>");
  });

  test("emits request lifecycle events when a logger is configured", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-dev-logger-"));
    await writeFile(
      join(appDir, "page.tsx"),
      `export default function Page() { return <main>Dev logger</main>; }`,
    );
    const events: AppRouterLogEvent[] = [];
    const logger: AppRouterLogger = {
      info(event) {
        events.push(event);
      },
    };
    const server = await startTrackedDevServer({ appDir, logger, port: 0 });

    const response = await fetch(`${server.url}/?token=secret`);

    expect(response.status).toBe(200);
    await eventually(() => {
      expect(events.map((event) => event.type)).toEqual([
        "router:request:start",
        "router:request:end",
      ]);
    });
    expect(events[0]).toMatchObject({
      method: "GET",
      path: "/",
      runtime: "node",
      type: "router:request:start",
    });
    expect(events[1]).toMatchObject({
      method: "GET",
      path: "/",
      runtime: "node",
      status: 200,
      type: "router:request:end",
    });
    expect(JSON.stringify(events)).not.toContain("secret");
  });

  test("emits render timing events when a debug logger is configured", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-dev-render-logger-"));
    await writeFile(
      join(appDir, "page.tsx"),
      `export default function Page() { return <main>Dev render logger</main>; }`,
    );
    const events: AppRouterLogEvent[] = [];
    const logger: AppRouterLogger = {
      debug(event) {
        events.push(event);
      },
    };
    const server = await startTrackedDevServer({ appDir, logger, port: 0 });

    const response = await fetch(`${server.url}/`);

    expect(response.status).toBe(200);
    await eventually(() => {
      expect(events.some((event) => event.type === "router:render:timing")).toBe(true);
    });
    expect(events.find((event) => event.type === "router:render:timing")).toMatchObject({
      method: "GET",
      path: "/",
      status: 200,
      type: "router:render:timing",
    });
  });

  test("allows declared server dependencies during dev requests", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "mreact-dev-server-deps-"));
    const routesDir = join(projectRoot, "src", "app");
    await mkdir(routesDir, { recursive: true });
    await writeDevPackageFixture(projectRoot);
    await writeFile(
      join(routesDir, "page.tsx"),
      `import { version } from "fixture-lib";

export function loader() {
  return { version };
}

export default function Page(props) {
  return <main>{props.data.version}</main>;
}`,
    );
    await writeViteConfig(projectRoot, {
      allowedSourceDirs: ["src"],
      publicDir: "public",
      routesDir: "src/app",
    });
    const server = await startTrackedDevServer({ projectRoot, port: 0 });

    const response = await fetch(server.url);

    expect(response.status).toBe(200);
    expect(await response.text()).toContain("<main>fixture-dev-ok</main>");
  });

  test("preserves file import.meta.url for app-local server modules", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "mreact-dev-import-meta-file-"));
    const routesDir = join(projectRoot, "src", "app");
    const libDir = join(projectRoot, "src", "lib");
    await mkdir(routesDir, { recursive: true });
    await mkdir(libDir, { recursive: true });
    await writeFile(
      join(libDir, "resource.ts"),
      `import { basename } from "node:path";
import { fileURLToPath } from "node:url";

export const resourceFile = basename(fileURLToPath(import.meta.url));
`,
    );
    await writeFile(
      join(routesDir, "page.tsx"),
      `import { resourceFile } from "../lib/resource.js";

export function loader() {
  return { resourceFile };
}

export default function Page(props) {
  return <main>{props.data.resourceFile}</main>;
}`,
    );
    await writeViteConfig(projectRoot, {
      allowedSourceDirs: ["src"],
      publicDir: "public",
      routesDir: "src/app",
    });
    const server = await startTrackedDevServer({ projectRoot, port: 0 });

    const response = await fetch(server.url);
    const body = await response.text();

    expect(response.status, body).toBe(200);
    expect(body).toContain("<main>resource.ts</main>");
  });

  test("does not expose the legacy SSE reload endpoint", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-dev-watch-"));
    const pageFile = join(appDir, "page.mreact.tsx");
    await writeFile(pageFile, "export default function Page() { return <main>before</main>; }");
    const server = await startTrackedDevServer({ appDir, port: 0 });

    const response = await fetch(`${server.url}/_mreact/dev`);

    expect(response.status).toBe(404);
  });

  test("injects Vite HMR into client route bundles", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-dev-reload-client-"));
    await writeFile(
      join(appDir, "page.mreact.tsx"),
      `import { cell } from "@reckona/mreact-reactive-core";

export default function Page() {
  const count = cell(0);
  return <button type="button" onClick={() => count.set(value => value + 1)}>count: {count.get()}</button>;
}`,
    );
    const server = await startTrackedDevServer({ appDir, port: 0 });

    const response = await fetch(`${server.url}/_mreact/client/routes/index.js`);
    const script = await response.text();

    expect(script).toContain("/@vite/client");
    expect(script).toContain("import.meta.hot");
    expect(script).toContain("__mreactHydrateRoute");
  });

  test("marks HMR route updates as state preserving", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-dev-state-hmr-"));
    await writeFile(
      join(appDir, "page.mreact.tsx"),
      `import { cell } from "@reckona/mreact-reactive-core";

export default function Page() {
  const count = cell(0);
  return <button type="button" onClick={() => count.set(value => value + 1)}>count: {count.get()}</button>;
}`,
    );
    const server = await startTrackedDevServer({ appDir, port: 0 });

    const response = await fetch(`${server.url}/_mreact/client/routes/index.js`);
    const script = await response.text();

    expect(script).toContain("__mreactRouteStates");
    expect(script).toContain("__mreactPreserveRouteState");
    expect(script).toContain("import.meta.hot.data.__mreactRouteStates");
  });

  test("drops preserved HMR route state when the compiled cell signature changes", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-app-dev-state-hmr-signature-"));
    await writeFile(
      join(appDir, "page.mreact.tsx"),
      `import { cell } from "@reckona/mreact-reactive-core";

export default function Page() {
  const count = cell(0);
  return <button type="button" onClick={() => count.set(value => value + 1)}>count: {count.get()}</button>;
}`,
    );
    const server = await startTrackedDevServer({ appDir, port: 0 });

    const response = await fetch(`${server.url}/_mreact/client/routes/index.js`);
    const script = await response.text();

    expect(script).toContain("__mreactRouteStateSignature");
    expect(script).toContain("__mreactDropMismatchedRouteState");
    expect(script).toContain("mreact: dropping stale route state");
  });

  test("loads mreactRouter project options from vite.config.ts", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "mreact-dev-server-config-"));
    const routesDir = join(projectRoot, "routes");
    await mkdir(routesDir, { recursive: true });
    await writeFile(
      join(routesDir, "page.tsx"),
      `export default function Page() { return <main>Loaded from vite config</main>; }`,
    );
    await writeViteConfig(projectRoot, {
      allowedSourceDirs: ["routes"],
      publicDir: "public",
      routesDir: "routes",
    });
    await expect(
      loadMreactRouterViteConfig({ command: "serve", cwd: projectRoot }),
    ).resolves.toMatchObject({
      routesDir,
    });

    const server = await startTrackedDevServer({
      projectRoot,
      port: 0,
    });
    const response = await fetch(server.url);

    expect(response.status).toBe(200);
    expect(await response.text()).toContain("<main>Loaded from vite config</main>");
  });

  test("uses vite server.port when no explicit dev port is provided", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "mreact-dev-server-vite-port-"));
    const routesDir = join(projectRoot, "routes");
    const port = await unusedTcpPort();
    await mkdir(routesDir, { recursive: true });
    await writeFile(
      join(routesDir, "page.tsx"),
      `export default function Page() { return <main>Configured port</main>; }`,
    );
    await writeViteConfig(projectRoot, {
      allowedSourceDirs: ["routes"],
      publicDir: "public",
      routesDir: "routes",
      serverPort: port,
    });

    const server = await startTrackedDevServer({
      projectRoot,
    });

    expect(server.url).toBe(`http://127.0.0.1:${port}`);
    expect((await fetch(server.url)).status).toBe(200);
  });

  test("rejects with an actionable message when the dev port is already in use", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-dev-server-port-conflict-"));
    await writeFile(
      join(appDir, "page.tsx"),
      `export default function Page() { return <main>Port conflict</main>; }`,
    );
    const blocker = createServer((_request, response) => {
      response.end("busy");
    });
    const port = await listenTestServer(blocker);

    try {
      await expect(startDevServer({ appDir, port })).rejects.toThrow(
        `mreact dev server could not start because 127.0.0.1:${port} is already in use. Stop the process using that port or run with PORT=<free-port>.`,
      );
    } finally {
      await closeTestServer(blocker);
    }
  });

  test("explicit route options override vite.config.ts project options", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "mreact-dev-server-override-"));
    await mkdir(join(projectRoot, "src", "app"), { recursive: true });
    await mkdir(join(projectRoot, "app"), { recursive: true });
    await writeFile(
      join(projectRoot, "src", "app", "page.tsx"),
      `export default function Page() { return <main>Config route</main>; }`,
    );
    await writeFile(
      join(projectRoot, "app", "page.tsx"),
      `export default function Page() { return <main>Explicit route</main>; }`,
    );
    await writeViteConfig(projectRoot, {
      allowedSourceDirs: ["src"],
      publicDir: "public",
      routesDir: "src/app",
    });

    const server = await startTrackedDevServer({
      allowedSourceDirs: ["app"],
      projectRoot,
      publicDir: "public",
      routesDir: "app",
      port: 0,
    });
    const response = await fetch(server.url);

    expect(response.status).toBe(200);
    expect(await response.text()).toContain("<main>Explicit route</main>");
  });

  test("hides dev server error stacks from the HTTP response body by default", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-dev-server-error-body-"));
    await writeFile(
      join(appDir, "page.tsx"),
      `export default function Page() { throw new Error("secret absolute path ${appDir}"); }`,
    );
    const server = await startTrackedDevServer({
      appDir,
      port: 0,
    });

    const response = await fetch(server.url);
    const body = await response.text();

    expect(response.status).toBe(500);
    expect(body).toBe("Internal Server Error");
    expect(body).not.toContain(appDir);
    expect(body).not.toContain(" at ");
  });

  test("loads the app response hook convention", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-dev-response-hook-"));
    await writeFile(
      join(appDir, "page.tsx"),
      `export default function Page() { return <main>Hooked</main>; }`,
    );
    await writeFile(
      join(appDir, "on-response.ts"),
      `export function onResponse(response: Response, context: { request: Request }) {
  const headers = new Headers(response.headers);
  headers.set("vary", "Cookie");
  if (context.request.headers.get("cookie")?.includes("session=")) {
    headers.set("cache-control", "private, no-store");
  }
  return new Response(response.body, { headers, status: response.status, statusText: response.statusText });
}`,
    );
    const server = await startTrackedDevServer({ appDir, port: 0 });

    const publicResponse = await fetch(server.url);
    const sessionResponse = await fetch(server.url, { headers: { cookie: "session=active" } });

    expect(publicResponse.headers.get("vary")).toBe("Cookie");
    expect(publicResponse.headers.get("cache-control")).toBeNull();
    expect(sessionResponse.headers.get("vary")).toBe("Cookie");
    expect(sessionResponse.headers.get("cache-control")).toBe("private, no-store");
  });
});

async function startTrackedDevServer(options: StartDevServerOptions) {
  const server = await startDevServer(options);
  servers.push(server);
  return server;
}

async function eventually(assertion: () => void): Promise<void> {
  const started = performance.now();
  let lastError: unknown;

  while (performance.now() - started < 500) {
    try {
      assertion();
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }

  throw lastError;
}

function unusedTcpPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();

    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address !== null ? address.port : undefined;

      server.close((error) => {
        if (error !== undefined) {
          reject(error);
          return;
        }

        if (port === undefined) {
          reject(new Error("failed to allocate a TCP port"));
          return;
        }

        resolve(port);
      });
    });
  });
}

function listenTestServer(server: ReturnType<typeof createServer>): Promise<number> {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address !== null ? address.port : undefined;

      if (port === undefined) {
        reject(new Error("failed to allocate a TCP port"));
        return;
      }

      resolve(port);
    });
  });
}

function closeTestServer(server: ReturnType<typeof createServer>): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

function firstResponseChunk(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const request = get(url, (response) => {
      response.setEncoding("utf8");
      response.once("data", (chunk) => {
        request.destroy();
        resolve(String(chunk));
      });
      response.once("error", reject);
    });

    request.once("error", reject);
  });
}

function postJson(
  url: string,
  body: string,
): Promise<{ body: string; status: number | undefined }> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const request = nodeRequest(
      {
        headers: {
          "content-length": Buffer.byteLength(body),
          "content-type": "text/plain",
          "x-mreact-test": "present",
        },
        hostname: parsed.hostname,
        method: "POST",
        path: `${parsed.pathname}${parsed.search}`,
        port: parsed.port,
      },
      (response) => {
        response.setEncoding("utf8");
        let text = "";

        response.on("data", (chunk) => {
          text += String(chunk);
        });
        response.on("end", () => {
          resolve({ body: text, status: response.statusCode });
        });
        response.on("error", reject);
      },
    );

    request.on("error", reject);
    request.end(body);
  });
}

async function writeViteConfig(
  projectRoot: string,
  options: {
    allowedSourceDirs?: readonly string[] | undefined;
    importPolicy?: { allowedPackages: readonly string[] } | undefined;
    publicDir: string;
    routesDir: string;
    serverPort?: number | undefined;
  },
): Promise<void> {
  const viteModule = pathToFileURL(
    join(process.cwd(), "packages", "router", "src", "vite.ts"),
  ).href;
  await writeFile(
    join(projectRoot, "vite.config.ts"),
    `import { mreactRouter } from ${JSON.stringify(viteModule)};

export default {
  ${options.serverPort === undefined ? "" : `server: { port: ${options.serverPort} },`}
  plugins: [
    mreactRouter({
      ${options.allowedSourceDirs === undefined ? "" : `allowedSourceDirs: ${JSON.stringify(options.allowedSourceDirs)},`}
      ${options.importPolicy === undefined ? "" : `importPolicy: ${JSON.stringify(options.importPolicy)},`}
      projectRoot: __dirname,
      publicDir: ${JSON.stringify(options.publicDir)},
      routesDir: ${JSON.stringify(options.routesDir)},
    }),
  ],
};
`,
  );
}

async function writeNativeBindingsFixture(packageDir: string): Promise<void> {
  const packageLibDir = join(packageDir, "lib");
  await writeFile(
    join(packageDir, "index.js"),
    `const Database = require("./lib/database");

Database.moduleFilename = __filename;

module.exports = Database;
`,
  );
  await writeFile(
    join(packageLibDir, "database.js"),
    `const readCallerFileName = require("./bindings-helper");

function Database() {
  this.callerFileName = readCallerFileName();
}

module.exports = Database;
`,
  );
  await writeFile(
    join(packageLibDir, "bindings-helper.js"),
    `module.exports = function readCallerFileName() {
  const originalPrepareStackTrace = Error.prepareStackTrace;
  const originalStackTraceLimit = Error.stackTraceLimit;
  const dummy = {};
  let fileName;

  Error.stackTraceLimit = 10;
  Error.prepareStackTrace = function (_error, stack) {
    for (let index = 0; index < stack.length; index += 1) {
      fileName = stack[index].getFileName();
      if (fileName !== __filename) {
        return;
      }
    }
  };

  Error.captureStackTrace(dummy);
  dummy.stack;
  Error.prepareStackTrace = originalPrepareStackTrace;
  Error.stackTraceLimit = originalStackTraceLimit;

  if (fileName.indexOf("file://") === 0) {
    return new URL(fileName).pathname;
  }
  return fileName;
};
`,
  );
}

async function writeDevPackageFixture(projectRoot: string): Promise<void> {
  const packageDir = join(projectRoot, "node_modules", "fixture-lib");

  await mkdir(packageDir, { recursive: true });
  await writeFile(
    join(projectRoot, "package.json"),
    JSON.stringify({ dependencies: { "fixture-lib": "1.0.0" }, type: "module" }),
  );
  await writeFile(
    join(packageDir, "package.json"),
    JSON.stringify({ type: "module", exports: "./index.js" }),
  );
  await writeFile(join(packageDir, "index.js"), 'export const version = "fixture-dev-ok";');
}
