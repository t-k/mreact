import { describe, expect, test } from "vitest";
import {
  hasGenerateStaticParamsExport,
  hasLoaderExport,
  hasPrerenderExport,
  isStreamRouteSource,
  stripRouteClientOnlyExports,
  stripRouteModuleExports,
  stripRouteRequestOnlyExports,
} from "../src/route-source.js";

describe("router route source transforms", () => {
  test("strips route runtime exports through one shared helper", () => {
    const source = `export const stream = true;
export const revalidate = 60;
export const prerender = true;
export const auth = "include-claims";

export async function generateStaticParams() {
  return [{ id: "ada" }];
}

export async function loader() {
  return { title: "server" };
}

export const metadata = {
  title: "metadata",
};

export default function Page(props) {
  return <main>{props.data.title}</main>;
}`;

    const stripped = stripRouteModuleExports(source);

    expect(stripped).not.toContain("export const stream");
    expect(stripped).not.toContain("export const revalidate");
    expect(stripped).not.toContain("export const prerender");
    expect(stripped).not.toContain("export const auth");
    expect(stripped).not.toContain("function generateStaticParams");
    expect(stripped).not.toContain("function loader");
    expect(stripped).toContain("const metadata");
    expect(stripped).not.toContain("export const metadata");
    expect(stripped).toContain("export default function Page");
  });

  test("strips metadata only for client-only route compilation", () => {
    const source = `export const metadata = {
  title: "server-only",
} satisfies RouteMetadata;

export default function Page() {
  return <button onClick={() => undefined}>Save</button>;
}`;

    const stripped = stripRouteClientOnlyExports(source);

    expect(stripped).not.toContain("server-only");
    expect(stripped).not.toContain("satisfies RouteMetadata");
    expect(stripped).toContain("export default function Page");
  });

  test("strips function declaration loader with typed parameters for client-only route compilation", () => {
    const source = `import { cell } from "@reckona/mreact-reactive-core";

const selected = cell("system");

export function loader(context: { readonly request: Request }) {
  return {};
}

function ThemeToggle() {
  return <button type="button" onClick={() => selected.set("dark")}>{selected.get()}</button>;
}

export default function SettingsAppearancePage() {
  return <main>{ThemeToggle()}</main>;
}`;

    const stripped = stripRouteClientOnlyExports(source);

    expect(stripped).not.toContain("function loader");
    expect(stripped).not.toContain("readonly request");
    expect(stripped).toContain("function ThemeToggle");
    expect(stripped).toContain("export default function SettingsAppearancePage");
  });

  test("strips imports that are only referenced by server-only route exports for client-only route compilation", () => {
    const source = `import { cell } from "@reckona/mreact-reactive-core";
import { getAllTasks } from "./lib/db.js";

export async function loader() {
  return getAllTasks();
}

export default function Page(props: { data: unknown[] }) {
  const items = cell(props.data);
  return <div>{items.get().length}</div>;
}`;

    const stripped = stripRouteClientOnlyExports(source);

    expect(stripped).toContain("@reckona/mreact-reactive-core");
    expect(stripped).not.toContain("./lib/db.js");
    expect(stripped).not.toContain("getAllTasks");
    expect(stripped).toContain("export default function Page");
  });

  test("strips one-line and nested server exports with the parser", () => {
    const source = `export const loader = () => ({ title: "inline" });
export async function generateStaticParams() { return [{ id: "ada" }]; }
export function loaderTwo() { return "component-like export must stay"; }
export default function Page(props) {
  return <main>{props.data.title}</main>;
}`;

    const stripped = stripRouteModuleExports(source);

    expect(stripped).not.toContain("export const loader");
    expect(stripped).not.toContain("generateStaticParams");
    expect(stripped).toContain("function loaderTwo");
    expect(stripped).not.toContain("export function loaderTwo");
    expect(stripped).toContain("export default function Page");
  });

  test("strips only targeted names from mixed variable export declarations", () => {
    const source = `export const loader = () => ({ title: "server" }), helper = () => "client";
export const metadata = { title: "server-only" }, publicMetadata = "visible";
export default function Page() {
  return <main>{helper()}{publicMetadata}</main>;
}`;

    const stripped = stripRouteClientOnlyExports(source);

    expect(stripped).not.toContain("loader =");
    expect(stripped).not.toContain("metadata =");
    expect(stripped).toContain('const helper = () => "client";');
    expect(stripped).toContain('const publicMetadata = "visible";');
    expect(stripped).not.toContain("export const helper");
    expect(stripped).not.toContain("export const publicMetadata");
    expect(stripped).toContain("export default function Page");
  });

  test("strips only targeted names from mixed export specifier declarations", () => {
    const source = `const routeLoader = () => ({ title: "server" });
const helper = () => "client";
const routeMetadata = { title: "server-only" };
export { routeLoader as loader, helper, routeMetadata as metadata };
export default function Page() {
  return <main>{helper()}</main>;
}`;

    const stripped = stripRouteClientOnlyExports(source);

    expect(stripped).not.toContain("routeLoader as loader");
    expect(stripped).not.toContain("routeMetadata as metadata");
    expect(stripped).not.toContain("export { helper");
    expect(stripped).toContain("export default function Page");
  });

  test("keeps request exports while stripping page render exports", () => {
    const source = `export async function loader() {
  return { title: helper() };
}

export const metadata = { title: "request metadata" };
export const slots = { aside: () => <aside /> };
export const helper = () => "server";

export default function Page(props) {
  return <main>{props.data.title}</main>;
}`;

    const stripped = stripRouteRequestOnlyExports(source);

    expect(stripped).toContain("export async function loader");
    expect(stripped).toContain("export const metadata");
    expect(stripped).not.toContain("export const slots");
    expect(stripped).not.toContain("export default function Page");
    expect(stripped).toContain('const helper = () => "server";');
  });

  test("detects route config exports from the shared source helper", () => {
    expect(isStreamRouteSource("export const stream = true;")).toBe(true);
    expect(hasPrerenderExport("export const prerender = true;")).toBe(true);
    expect(hasGenerateStaticParamsExport("export function generateStaticParams() {}")).toBe(true);
    expect(hasLoaderExport("export const loader = () => ({ ok: true });")).toBe(true);
  });
});
