import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { bundleRouteLoaderModuleCode } from "../src/render.js";
import {
  importAppRouterFileModule,
  importAppRouterSourceModule,
} from "../src/module-runner.js";

describe("router Vite module runner adapter", () => {
  test("imports TypeScript files and bypasses stale module cache", async () => {
    const appDir = await mkdtemp(join(tmpdir(), "mreact-module-runner-file-"));
    const file = join(appDir, "route.ts");
    await writeFile(
      file,
      "export function GET(request: Request): Response { return Response.json({ value: 1, method: request.method }); }",
    );

    const first = await importAppRouterFileModule<{
      GET: (request: Request) => Response;
    }>(file);
    await writeFile(
      file,
      "export function GET(request: Request): Response { return Response.json({ value: 2, method: request.method }); }",
    );
    const second = await importAppRouterFileModule<{
      GET: (request: Request) => Response;
    }>(file);

    await expect(first.GET(new Request("http://local.test")).json()).resolves.toEqual({
      method: "GET",
      value: 1,
    });
    await expect(second.GET(new Request("http://local.test")).json()).resolves.toEqual({
      method: "GET",
      value: 2,
    });
  });

  test("bundles source modules with mreact workspace imports before Vite runner import", async () => {
    const module = await importAppRouterSourceModule<{
      render: () => string;
    }>({
      code: `import { cell } from "@reckona/mreact-reactive-core";

export function render() {
  const value = cell("runner");
  return value.get();
}`,
      label: "module-runner-workspace-import",
      resolveDir: process.cwd(),
      sourcefile: join(process.cwd(), "module-runner-workspace-import.js"),
    });

    expect(module.render()).toBe("runner");
  });

  test("bundles TypeScript source modules with type annotations", async () => {
    const module = await importAppRouterSourceModule<{
      GET: () => Response;
    }>({
      code: `export function GET(): Response {
  return Response.json({ ok: true });
}`,
      label: "module-runner-typescript-source",
      resolveDir: process.cwd(),
      sourcefile: join(process.cwd(), "app/healthz/route.ts"),
    });

    await expect(module.GET().json()).resolves.toEqual({ ok: true });
  });

  test("does not expose bundled source as a base64 data URL through import.meta.url", async () => {
    const writes: string[] = [];
    const write = process.stdout.write.bind(process.stdout);
    process.stdout.write = ((chunk: string | Uint8Array) => {
      writes.push(String(chunk));
      return true;
    }) as typeof process.stdout.write;

    try {
      await importAppRouterSourceModule({
        code: `process.stdout.write(import.meta.url);`,
        label: "module-runner-import-meta-url",
        resolveDir: process.cwd(),
        sourcefile: join(process.cwd(), "module-runner-import-meta-url.js"),
      });
    } finally {
      process.stdout.write = write;
    }

    expect(writes.join("")).not.toContain("data:text/javascript;base64,");
  });

  test("does not expose bundled source as a base64 data URL through module stack frames", async () => {
    const module = await importAppRouterSourceModule<{
      stack: () => string | undefined;
    }>({
      code: `export function stack() {
  return new Error("module-runner-stack").stack;
}`,
      label: "module-runner-stack-frame-url",
      resolveDir: process.cwd(),
      sourcefile: join(process.cwd(), "module-runner-stack-frame-url.js"),
    });

    expect(module.stack()).not.toContain("data:text/javascript;base64,");
  });

  test("selects loaders for TypeScript and JSX source module suffixes", async () => {
    for (const [suffix, code] of [
      [
        "route.mts",
        `export function value(input: string): string {
  return input.toUpperCase();
}`,
      ],
      [
        "route.cts",
        `export function value(input: string): string {
  return input.toUpperCase();
}`,
      ],
      [
        "middleware.mreact.ts",
        `export function value(input: string): string {
  return input.toUpperCase();
}`,
      ],
      [
        "component.jsx",
	        `const React = { createElement(type) { return { type }; } };
	export function value() {
	  return (<span>jsx</span>).type;
	}`,
      ],
    ] as const) {
      const module = await importAppRouterSourceModule<{
        value: (input: string) => string;
      }>({
        code,
        label: `module-runner-${suffix}`,
        resolveDir: process.cwd(),
        sourcefile: join(process.cwd(), "app", suffix),
      });

      expect(module.value("ok")).toBe(suffix.endsWith(".jsx") ? "span" : "OK");
    }
  });

  test("uses native escape JS fallback from bundled source modules", async () => {
    const module = await importAppRouterSourceModule<{
      render: () => string;
    }>({
      code: `import { escapeHtmlBatch } from "@reckona/mreact-router/native-escape";

export function render() {
  return escapeHtmlBatch(["<Ada>", "& Grace"]).join("");
}`,
      label: "module-runner-native-escape",
      resolveDir: process.cwd(),
      sourcefile: join(process.cwd(), "module-runner-native-escape.js"),
    });

    expect(module.render()).toBe("&lt;Ada&gt;&amp; Grace");
  });

  test("bundles public router subpath workspace imports", async () => {
    const module = await importAppRouterSourceModule<{
      render: () => string;
    }>({
      code: `import { Link } from "@reckona/mreact-router/link";
import { getNavigationState } from "@reckona/mreact-router/navigation-state";
import "@reckona/mreact-router/app-router-globals";

export function render() {
  const element = Link({ href: "/newest", children: "New" });
  return [element.type, element.props.href, getNavigationState().pending].join(":");
}`,
      label: "module-runner-router-subpaths",
      resolveDir: process.cwd(),
      sourcefile: join(process.cwd(), "module-runner-router-subpaths.js"),
    });

    expect(module.render()).toBe("a:/newest:false");
  });

  test("runs bundled loader modules that import allowed CommonJS packages", async () => {
    const projectDir = await mkdtemp(join(tmpdir(), "mreact-module-runner-cjs-"));
    const appDir = join(projectDir, "app");
    const packageDir = join(projectDir, "node_modules", "cjs-package");
    await mkdir(packageDir, { recursive: true });
    await writeFile(
      join(packageDir, "package.json"),
      JSON.stringify({ main: "index.js", name: "cjs-package" }),
    );
    await writeFile(
      join(packageDir, "index.js"),
      "exports.value = 41; module.exports.next = () => exports.value + 1;\n",
    );
    const bundled = await bundleRouteLoaderModuleCode({
      appDir,
      code: `import cjsPackage from "cjs-package";

export async function loader() {
  return cjsPackage.next();
}`,
      filename: join(appDir, "page.tsx"),
      importPolicy: {
        allowedPackages: ["cjs-package"],
        projectRoot: projectDir,
      },
    });
    const module = await importAppRouterSourceModule<{
      loader: () => Promise<number>;
    }>({
      code: bundled,
      label: "module-runner-cjs-loader",
    });

    await expect(module.loader()).resolves.toBe(42);
  });

  test("reuses cached source modules for stable SSR code", async () => {
    const state = globalThis as { __mreactModuleRunnerCacheCalls?: number };
    state.__mreactModuleRunnerCacheCalls = 0;
    const code = `const state = globalThis;
state.__mreactModuleRunnerCacheCalls = (state.__mreactModuleRunnerCacheCalls ?? 0) + 1;
export const calls = state.__mreactModuleRunnerCacheCalls;`;

    const first = await importAppRouterSourceModule<{ calls: number }>({
      cacheKey: "module-runner-cache-test",
      code,
      label: "module-runner-cache-test",
    });
    const second = await importAppRouterSourceModule<{ calls: number }>({
      cacheKey: "module-runner-cache-test",
      code,
      label: "module-runner-cache-test",
    });
    const uncached = await importAppRouterSourceModule<{ calls: number }>({
      code,
      label: "module-runner-cache-test",
    });

    expect(first.calls).toBe(1);
    expect(second.calls).toBe(1);
    expect(uncached.calls).toBe(2);
  });
});
