import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { buildClientRouteOutput as buildClientRouteOutputFromClient } from "../src/client.js";
import { inferClientRouteModule as inferClientRouteModuleFromClient } from "../src/client.js";
import {
  collectClientRouteReferences,
  detectNavigationRuntimeOverride,
  inferClientRouteModule,
  resolveNavigationRuntime,
} from "../src/client-route-inference.js";
import { buildClientRouteOutput } from "../src/navigation-runtime.js";

describe("client module boundaries", () => {
  test("exposes client-route inference without importing the navigation runtime surface", async () => {
    const result = await inferClientRouteModule({
      code: `"use client";
export default function Page() { return <button onClick={() => undefined}>ok</button>; }`,
      filename: "/app/page.tsx",
      routePath: "/",
    });
    const legacyResult = await inferClientRouteModuleFromClient({
      code: `"use client";
export default function Page() { return <button onClick={() => undefined}>ok</button>; }`,
      filename: "/app/page.tsx",
      routePath: "/",
    });

    expect(result).toEqual(legacyResult);
    expect(result.client).toBe(true);
  });

  test("keeps navigation runtime route output byte-identical through the boundary module", async () => {
    const options = {
      code: `export default function Page() { return <main>ok</main>; }`,
      filename: "/app/page.tsx",
      routePath: "/",
    };

    await expect(buildClientRouteOutput(options)).resolves.toEqual(
      await buildClientRouteOutputFromClient(options),
    );
  });
});

describe("detectNavigationRuntimeOverride", () => {
  test("returns undefined when the export is absent", () => {
    expect(
      detectNavigationRuntimeOverride("export default function Page() { return null; }"),
    ).toBeUndefined();
  });

  test("returns true for an explicit true export", () => {
    expect(detectNavigationRuntimeOverride("export const navigationRuntime = true;")).toBe(true);
  });

  test("returns false for an explicit false export", () => {
    expect(detectNavigationRuntimeOverride("export const navigationRuntime: boolean = false")).toBe(
      false,
    );
  });
});

describe("collectClientRouteReferences usesNavigationLink", () => {
  test("flags a Link rendered directly in the page", async () => {
    const code = `import { Link } from "@reckona/mreact-router/link";
export default function Page() { return <Link href="/a">A</Link>; }`;
    const result = await collectClientRouteReferences({ code, filename: "/app/page.tsx" });
    expect(result.usesNavigationLink).toBe(true);
  });

  test("does not flag a Link that is imported but never rendered", async () => {
    const code = `import { Link } from "@reckona/mreact-router/link";
export default function Page() { return <main>no link</main>; }`;
    const result = await collectClientRouteReferences({ code, filename: "/app/page.tsx" });
    expect(result.usesNavigationLink).toBe(false);
  });

  test("flags a Link rendered transitively through a custom component", async () => {
    const dir = await mkdtemp(join(tmpdir(), "mreact-nav-link-transitive-"));
    const appDir = join(dir, "app");
    await mkdir(join(appDir, "components"), { recursive: true });
    await writeFile(
      join(appDir, "components", "nav.tsx"),
      `import { Link } from "@reckona/mreact-router/link";
export function Nav() { return <Link href="/a">A</Link>; }`,
    );
    const pageFile = join(appDir, "page.tsx");
    const code = `import { Nav } from "./components/nav";
export default function Page() { return <Nav />; }`;
    await writeFile(pageFile, code);
    const result = await collectClientRouteReferences({ appDir, code, filename: pageFile });
    expect(result.usesNavigationLink).toBe(true);
  });
});

describe("resolveNavigationRuntime", () => {
  test("honors an explicit true override even without a Link", async () => {
    const code = `export const navigationRuntime = true;
export default function Page() { return <main>x</main>; }`;
    expect(await resolveNavigationRuntime({ code, filename: "/app/page.tsx" })).toBe(true);
  });

  test("honors an explicit false override even when a Link is rendered", async () => {
    const code = `import { Link } from "@reckona/mreact-router/link";
export const navigationRuntime = false;
export default function Page() { return <Link href="/a">A</Link>; }`;
    expect(await resolveNavigationRuntime({ code, filename: "/app/page.tsx" })).toBe(false);
  });

  test("auto-detects a rendered Link when no override is present", async () => {
    const code = `import { Link } from "@reckona/mreact-router/link";
export default function Page() { return <Link href="/a">A</Link>; }`;
    expect(await resolveNavigationRuntime({ code, filename: "/app/page.tsx" })).toBe(true);
  });

  test("returns false when no override and no Link is rendered", async () => {
    const code = `export default function Page() { return <main>x</main>; }`;
    expect(await resolveNavigationRuntime({ code, filename: "/app/page.tsx" })).toBe(false);
  });
});

describe("resolveNavigationRuntime dev/build parity", () => {
  test("resolves transitive Link the same way the build does, given appDir", async () => {
    const dir = await mkdtemp(join(tmpdir(), "mreact-nav-link-parity-"));
    const appDir = join(dir, "app");
    await mkdir(join(appDir, "components"), { recursive: true });
    await writeFile(
      join(appDir, "components", "nav.tsx"),
      `import { Link } from "@reckona/mreact-router/link";
export function Nav() { return <Link href="/a">A</Link>; }`,
    );
    const pageFile = join(appDir, "page.tsx");
    const code = `import { Nav } from "./components/nav";
export default function Page() { return <Nav />; }`;
    await writeFile(pageFile, code);

    expect(await resolveNavigationRuntime({ appDir, code, filename: pageFile })).toBe(true);
  });
});
