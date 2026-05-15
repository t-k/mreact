import { access, mkdtemp, readFile } from "node:fs/promises";
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
    const viteConfig = await readFile(join(directory, "vite.config.ts"), "utf8");
    const page = await readFile(join(directory, "app", "page.tsx"), "utf8");

    expect(packageJson.scripts?.dev).toBe("vite");
    expect(packageJson.scripts?.build).toBe("mreact-router build");
    expect(packageJson.dependencies?.["@reckona/mreact-router"]).toBeDefined();
    expect(viteConfig).toContain('routesDir: "app"');
    expect(page).toContain("Hello from mreact");
  });

  test("generates an explicit Vite app with src/app routes when srcDir is enabled", async () => {
    const root = await mkdtemp(join(tmpdir(), "mreact-create-src-dir-"));
    const directory = join(root, "demo-src");

    await createMreactApp({
      directory,
      name: "demo-src",
      packageManager: "pnpm",
      srcDir: true,
      template: "app-router",
    });

    const packageJson = JSON.parse(await readFile(join(directory, "package.json"), "utf8")) as {
      scripts?: Record<string, string>;
      dependencies?: Record<string, string>;
    };
    const viteConfig = await readFile(join(directory, "vite.config.ts"), "utf8");
    const page = await readFile(join(directory, "src", "app", "page.tsx"), "utf8");
    const appInfo = await readFile(join(directory, "src", "lib", "app-info.ts"), "utf8");

    expect(packageJson.scripts?.dev).toBe("vite");
    expect(packageJson.scripts?.build).toBe("mreact-router build");
    expect(packageJson.dependencies?.["@reckona/mreact-router"]).toBeDefined();
    expect(viteConfig).toContain('mreactRouter({');
    expect(viteConfig).toContain('routesDir: "src/app"');
    expect(viteConfig).toContain('publicDir: "public"');
    expect(viteConfig).toContain('allowedSourceDirs: ["src"]');
    expect(page).toContain('from "../lib/app-info"');
    expect(appInfo).toContain("Hello from mreact");
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
    expect(packageJson.devDependencies?.tailwindcss).toMatch(/^\^4\./);
    expect(packageJson.devDependencies?.["@tailwindcss/cli"]).toMatch(/^\^4\./);
    expect(packageJson.devDependencies?.postcss).toBeUndefined();
    expect(packageJson.devDependencies?.autoprefixer).toBeUndefined();
    expect(packageJson.scripts?.["dev:router"]).toBe("vite");
    expect(packageJson.scripts?.["build:css"]).toContain("./public/styles.css");
    expect(layout).toContain('href="/styles.css"');
    expect(css).toContain('@import "tailwindcss";');
    await expect(access(join(directory, "tailwind.config.ts"))).rejects.toThrow();
    await expect(access(join(directory, "postcss.config.cjs"))).rejects.toThrow();
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
