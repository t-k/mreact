import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { createMreactApp } from "../src/index.js";

describe("create-mreact-app scaffolder", () => {
  test("generates an app-router project with mreact scripts", async () => {
    const root = await mkdtemp(join(tmpdir(), "mreact-create-app-router-"));
    const directory = join(root, "demo");

    await createMreactApp({
      directory,
      name: "demo",
      packageManager: "pnpm",
      template: "app-router",
    });

    const packageJson = JSON.parse(await readFile(join(directory, "package.json"), "utf8")) as {
      scripts?: Record<string, string>;
      dependencies?: Record<string, string>;
    };
    const page = await readFile(join(directory, "app", "page.tsx"), "utf8");

    expect(packageJson.scripts?.dev).toBe("mreact-router dev app");
    expect(packageJson.scripts?.build).toBe("mreact-router build app");
    expect(packageJson.dependencies?.["@reckona/mreact-router"]).toBeDefined();
    expect(page).toContain("Hello from mreact");
  });

  test("generates Tailwind files only for the Tailwind template", async () => {
    const root = await mkdtemp(join(tmpdir(), "mreact-create-tailwind-"));
    const directory = join(root, "demo-tailwind");

    await createMreactApp({
      directory,
      name: "demo-tailwind",
      packageManager: "pnpm",
      template: "app-router-tailwind",
    });

    const packageJson = JSON.parse(await readFile(join(directory, "package.json"), "utf8")) as {
      devDependencies?: Record<string, string>;
      scripts?: Record<string, string>;
    };
    const layout = await readFile(join(directory, "app", "layout.tsx"), "utf8");
    const css = await readFile(join(directory, "app", "globals.css"), "utf8");
    const tailwindConfig = await readFile(join(directory, "tailwind.config.ts"), "utf8");

    expect(packageJson.devDependencies?.tailwindcss).toBeDefined();
    expect(packageJson.devDependencies?.postcss).toBeDefined();
    expect(packageJson.scripts?.["build:css"]).toContain("./app/public/styles.css");
    expect(layout).toContain('href="/styles.css"');
    expect(css).toContain("@tailwind utilities;");
    expect(tailwindConfig).toContain("./app/**/*.{ts,tsx}");
  });

  test("generates a Cloudflare worker template", async () => {
    const root = await mkdtemp(join(tmpdir(), "mreact-create-cloudflare-"));
    const directory = join(root, "demo-cloudflare");

    await createMreactApp({
      directory,
      name: "demo-cloudflare",
      packageManager: "pnpm",
      template: "cloudflare",
    });

    const packageJson = JSON.parse(await readFile(join(directory, "package.json"), "utf8")) as {
      scripts?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const worker = await readFile(join(directory, "src", "worker.ts"), "utf8");
    const page = await readFile(join(directory, "app", "page.tsx"), "utf8");

    expect(packageJson.scripts?.deploy).toBe("wrangler deploy");
    expect(packageJson.devDependencies?.wrangler).toBeDefined();
    expect(page).toContain("export const prerender = true;");
    expect(worker).toContain("createCloudflareBuiltRequestHandler");
    expect(worker).toContain("createCloudflareRouteModuleRenderer");
    expect(worker).toContain("renderRoute(request, context)");
  });
});
