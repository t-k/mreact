import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
// @vitest-environment happy-dom

import {
  buildClientRouteBatchOutput,
  buildClientRouteBundle,
  buildClientRouteEntrySource,
} from "../src/client.js";

/** A DOM fragment marker that only the shared resume runtime emits. */
const resumeRuntimeMarker = "data-mreact-layout-boundary";
/** A DOM fragment marker that only the shared client boundary runtime emits. */
const clientBoundaryRuntimeMarker = "data-mreact-client-boundary-nonserializable";
/** A DOM selector that only the shared out-of-order fragment runtime emits. */
const fragmentRuntimeMarker = "template[data-mreact-oob-fragment]";

async function writeRoute(directory: string, name: string, code: string): Promise<string> {
  const filename = join(directory, `${name}.mreact.tsx`);
  await mkdir(join(filename, ".."), { recursive: true });
  await writeFile(filename, code);
  return filename;
}

const interactiveRouteCode = `import { cell } from "@reckona/mreact-reactive-core";

export const clientNavigation = false;

export default function Page() {
  const count = cell(0);
  return <button type="button" onClick={() => count.set(value => value + 1)}>{count.get()}</button>;
}`;

describe("shared route hydration runtime", () => {
  beforeEach(() => {
    document.head.innerHTML = "";
    document.body.innerHTML = "";
    document.documentElement.removeAttribute("data-mreact-hydrated");
  });

  afterEach(() => {
    delete (globalThis as { __mreactRouteStates?: unknown }).__mreactRouteStates;
    delete (globalThis as { __mreactRouteDisposers?: unknown }).__mreactRouteDisposers;
    delete (globalThis as { __mreactRouteCell?: unknown }).__mreactRouteCell;
  });

  test("route entries import the resume runtime instead of inlining its helpers", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-shared-resume-entry-"));
    const filename = await writeRoute(appDir, "index", interactiveRouteCode);

    const entry = await buildClientRouteEntrySource({
      code: interactiveRouteCode,
      clientNavigation: false,
      filename,
      routePath: "/",
    });

    expect(entry.code).toContain("mreact:route-hydration-runtime/resume");
    expect(entry.code).not.toContain("function __mreactResumeChildren(");
    expect(entry.code).not.toContain("function __mreactResumeNode(");
    expect(entry.code).not.toContain("function __mreactUnmountCompatBoundaries(");
    expect(entry.code).toContain("__mreactCreateRouteResumeRuntime(");
  });

  test("routes that cannot stream fragments never import the fragment runtime", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-shared-fragment-entry-"));
    const filename = await writeRoute(appDir, "index", interactiveRouteCode);

    const streaming = await buildClientRouteEntrySource({
      code: interactiveRouteCode,
      clientNavigation: false,
      filename,
      routeMayUseOutOfOrderFragments: true,
      routePath: "/",
    });
    const staticRoute = await buildClientRouteEntrySource({
      code: interactiveRouteCode,
      clientNavigation: false,
      filename,
      routePath: "/",
    });

    expect(streaming.code).toContain("mreact:route-hydration-runtime/fragments");
    expect(staticRoute.code).not.toContain("mreact:route-hydration-runtime/fragments");
    expect(staticRoute.code).not.toContain("__mreactApplyOutOfOrderFragments");
  });

  test("routes without client references never import the client boundary runtime", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-shared-boundary-entry-"));
    const filename = await writeRoute(appDir, "index", interactiveRouteCode);

    const entry = await buildClientRouteEntrySource({
      code: interactiveRouteCode,
      clientNavigation: false,
      filename,
      routePath: "/",
    });

    expect(entry.code).not.toContain("mreact:route-hydration-runtime/boundaries");
    expect(entry.code).not.toContain("__mreactHydrateClientBoundaries");
    expect(entry.code).not.toContain(clientBoundaryRuntimeMarker);
  });

  test("routes with client references import the client boundary runtime once", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-shared-boundary-present-"));
    await writeFile(
      join(appDir, "Counter.tsx"),
      `"use client";
import { cell } from "@reckona/mreact-reactive-core";

export function Counter() {
  const count = cell(0);
  return <button type="button" onClick={() => count.set(value => value + 1)}>{count.get()}</button>;
}`,
    );
    const code = `import { Counter } from "./Counter";

export const clientNavigation = false;

export default function Page() {
  return <main><Counter /></main>;
}`;
    const filename = await writeRoute(appDir, "index", code);

    const entry = await buildClientRouteEntrySource({
      clientBoundaryImports: ["./Counter"],
      clientReferenceImports: [{ name: "Counter", source: "./Counter", exportName: "Counter" }],
      clientReferenceManifest: [
        { name: "Counter", moduleId: "./Counter.js", exportName: "Counter" },
      ],
      code,
      clientNavigation: false,
      filename,
      routePath: "/",
    });

    expect(entry.code).toContain("mreact:route-hydration-runtime/boundaries");
    expect(entry.code).toContain("__mreactCreateClientBoundaryRuntime(");
    expect(entry.code).not.toContain("function __mreactHydrateClientBoundaries(");
  });

  test("a multi-route build emits the resume runtime in exactly one shared chunk", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-shared-resume-batch-"));
    const routes = await Promise.all(
      ["/", "/about", "/settings"].map(async (routePath) => {
        const name = routePath === "/" ? "index" : routePath.slice(1);
        return {
          code: interactiveRouteCode,
          clientNavigation: false,
          filename: await writeRoute(appDir, name, interactiveRouteCode),
          minify: true,
          routePath,
        };
      }),
    );

    const output = await buildClientRouteBatchOutput({
      minify: true,
      projectRoot: appDir,
      routes,
    });
    const chunksWithResumeRuntime = output.chunks.filter((chunk) =>
      chunk.code.includes(resumeRuntimeMarker),
    );

    expect(chunksWithResumeRuntime).toHaveLength(1);
    expect(chunksWithResumeRuntime[0]?.isEntry).toBe(false);
    for (const route of output.routes) {
      expect(route.chunk.code).not.toContain(resumeRuntimeMarker);
      expect(route.chunk.imports).toContain(chunksWithResumeRuntime[0]?.fileName);
    }
  });

  test("a minimal route chunk stays smaller than the shared resume runtime it reuses", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-shared-resume-minimal-"));
    const routes = await Promise.all(
      ["/", "/about"].map(async (routePath) => {
        const name = routePath === "/" ? "index" : routePath.slice(1);
        return {
          code: interactiveRouteCode,
          clientNavigation: false,
          filename: await writeRoute(appDir, name, interactiveRouteCode),
          minify: true,
          routePath,
        };
      }),
    );

    const output = await buildClientRouteBatchOutput({
      minify: true,
      projectRoot: appDir,
      routes,
    });

    for (const route of output.routes) {
      expect(route.chunk.code.length).toBeLessThan(3_000);
    }
  });

  test("hydration through the shared runtime resumes server rendered markup", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-shared-resume-hydrate-"));
    const code = `import { cell } from "@reckona/mreact-reactive-core";

export const clientNavigation = false;

export default function Page() {
  const count = cell(0);
  return <main><h1 data-title="home">Home</h1><button type="button" onClick={() => count.set(value => value + 1)}>count: {count.get()}</button></main>;
}`;
    const filename = await writeRoute(appDir, "index", code);
    document.body.innerHTML = [
      '<div data-mreact-route-id="index"><main><h1 data-title="home">Home</h1>',
      '<button type="button">count: <!-- -->0</button></main></div>',
      '<script type="application/json" id="mreact-props-index">{}</script>',
    ].join("");

    const bundle = await buildClientRouteBundle({
      code,
      clientNavigation: false,
      filename,
      routePath: "/",
    });
    await import(
      `data:text/javascript;charset=utf-8,${encodeURIComponent(bundle)}#shared-resume-hydrate`
    );

    const heading = document.querySelector("h1");
    expect(heading?.getAttribute("data-title")).toBe("home");
    expect(document.documentElement.getAttribute("data-mreact-hydrated")).toBe("true");

    const button = document.querySelector("button");
    button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await Promise.resolve();

    expect(document.querySelector("button")?.textContent).toContain("count: 1");
  });

  test("hydration failures inside the shared runtime keep reporting through the route reporter", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-shared-resume-failure-"));
    const code = `export const clientNavigation = false;

function explode() {
  throw new Error("route component exploded");
}

export default function Page() {
  explode();
  return <main>Client HTML</main>;
}`;
    const filename = await writeRoute(appDir, "index", code);
    document.body.innerHTML = [
      '<div data-mreact-route-id="index"><main>Server HTML</main></div>',
      '<script type="application/json" id="mreact-props-index">{}</script>',
    ].join("");

    const bundle = await buildClientRouteBundle({
      code,
      clientNavigation: false,
      filename,
      routePath: "/",
    });
    const errors: unknown[] = [];
    const originalError = console.error;
    console.error = (...args: unknown[]) => {
      errors.push(args[0]);
    };

    try {
      await expect(
        import(
          `data:text/javascript;charset=utf-8,${encodeURIComponent(bundle)}#shared-resume-failure`
        ),
      ).rejects.toThrow("route component exploded");
    } finally {
      console.error = originalError;
    }

    expect(errors.some((entry) => String(entry).includes("mreact: route hydration failed"))).toBe(
      true,
    );
    expect(document.querySelector("main")?.textContent).toBe("Server HTML");
    expect(document.documentElement.hasAttribute("data-mreact-hydrated")).toBe(false);
  });
});
