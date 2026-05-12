import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import {
  importAppRouterFileModule,
  importAppRouterSourceModule,
} from "../src/module-runner.js";

describe("app-router Vite module runner adapter", () => {
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
      code: `import { cell } from "@modular-react/reactive-core";

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
});
