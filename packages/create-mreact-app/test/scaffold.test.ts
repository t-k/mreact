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
    const tsconfig = JSON.parse(await readFile(join(directory, "tsconfig.json"), "utf8")) as {
      compilerOptions?: { types?: string[] };
    };
    const viteConfig = await readFile(join(directory, "vite.config.ts"), "utf8");
    const layout = await readFile(join(directory, "app", "layout.tsx"), "utf8");
    const page = await readFile(join(directory, "app", "page.tsx"), "utf8");
    const readme = await readFile(join(directory, "README.md"), "utf8");

    expect(packageJson.scripts?.dev).toBe("mreact-router dev");
    expect(packageJson.scripts?.build).toBe("mreact-router build --target=node");
    expect(packageJson.dependencies?.["@reckona/mreact-router"]).toBeDefined();
    expect(tsconfig.compilerOptions?.types).toContain("@reckona/mreact-router/app-router-globals");
    expect(viteConfig).toContain('routesDir: "app"');
    expect(layout).not.toContain("<title>");
    expect(page).toContain("Hello from mreact");
    expect(readme).toContain("pnpm approve-builds");
    expect(readme).toContain("Ignored build scripts");
    expect(readme).toContain("safe to continue");
  });

  test("does not include pnpm approve-builds guidance for npm projects", async () => {
    const root = await mkdtemp(join(tmpdir(), "mreact-create-npm-readme-"));
    const directory = join(root, "demo-npm");

    await createMreactApp({
      directory,
      name: "demo-npm",
      packageManager: "npm",
      template: "app-router",
    });

    const readme = await readFile(join(directory, "README.md"), "utf8");

    expect(readme).not.toContain("pnpm approve-builds");
  });

  test("generates internal dependency ranges from workspace package versions", async () => {
    const root = await mkdtemp(join(tmpdir(), "mreact-create-versions-"));
    const directory = join(root, "demo-versions");

    await createMreactApp({
      directory,
      name: "demo-versions",
      packageManager: "pnpm",
      template: "app-router",
    });

    const packageJson = JSON.parse(await readFile(join(directory, "package.json"), "utf8")) as {
      dependencies?: Record<string, string>;
    };

    await expectInternalDependencyRange(packageJson, "@reckona/mreact", "packages/react");
    await expectInternalDependencyRange(packageJson, "@reckona/mreact-router", "packages/router");
    await expectInternalDependencyRange(
      packageJson,
      "@reckona/mreact-reactive-core",
      "packages/reactive-core",
    );
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
    const tsconfig = JSON.parse(await readFile(join(directory, "tsconfig.json"), "utf8")) as {
      compilerOptions?: { types?: string[] };
    };
    const viteConfig = await readFile(join(directory, "vite.config.ts"), "utf8");
    const layout = await readFile(join(directory, "src", "app", "layout.tsx"), "utf8");
    const page = await readFile(join(directory, "src", "app", "page.tsx"), "utf8");
    const appInfo = await readFile(join(directory, "src", "lib", "app-info.ts"), "utf8");

    expect(packageJson.scripts?.dev).toBe("mreact-router dev");
    expect(packageJson.scripts?.build).toBe("mreact-router build --target=node");
    expect(packageJson.dependencies?.["@reckona/mreact-router"]).toBeDefined();
    expect(tsconfig.compilerOptions?.types).toContain("@reckona/mreact-router/app-router-globals");
    expect(viteConfig).toContain("mreactRouter({");
    expect(viteConfig).toContain("projectRoot: __dirname");
    expect(viteConfig).toContain('routesDir: "src/app"');
    expect(viteConfig).toContain('publicDir: "public"');
    expect(viteConfig).toContain('allowedSourceDirs: ["src"]');
    expect(layout).not.toContain("<title>");
    expect(page).toContain('from "../lib/app-info.js"');
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
    expect(packageJson.scripts?.["dev:router"]).toBe("mreact-router dev");
    expect(packageJson.scripts?.["build:css"]).toContain("./public/styles.css");
    expect(layout).toContain('href="/styles.css"');
    expect(layout).not.toContain("<title>");
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
    expect(packageJson.scripts?.build).toBe("mreact-router build --target=cloudflare");
    expect(packageJson.devDependencies?.wrangler).toBeDefined();
    expect(page).toContain("export const prerender = true;");
    expect(worker).toContain("createCloudflareBuiltRequestHandler");
    expect(worker).toContain("createCloudflareRouteModuleRenderer");
    expect(worker).toContain("../.mreact/cloudflare/route-modules.mjs");
    expect(worker).not.toContain("Register dynamic route modules");
    expect(worker).toContain("renderRoute(request, context)");
  });

  test("generates generic container deploy files", async () => {
    const root = await mkdtemp(join(tmpdir(), "mreact-create-container-"));
    const directory = join(root, "demo-container");

    const result = await createMreactApp({
      deploy: "container",
      directory,
      name: "demo-container",
      packageManager: "pnpm",
      srcDir: true,
      template: "app-router-tailwind",
    });

    const dockerfile = await readFile(join(directory, "Dockerfile"), "utf8");
    const dockerignore = await readFile(join(directory, ".dockerignore"), "utf8");
    const deployDocs = await readFile(join(directory, "docs", "deploy", "container.md"), "utf8");

    expect(result.files).toContain("Dockerfile");
    expect(result.files).toContain(".dockerignore");
    expect(result.files).toContain("docs/deploy/container.md");
    expect(dockerfile).toContain("FROM node:24-bookworm-slim");
    expect(dockerfile).toContain("ENV PORT=8080");
    expect(dockerfile).toContain('CMD ["pnpm", "start"]');
    expect(dockerignore).toContain("node_modules");
    expect(dockerignore).toContain(".mreact");
    expect(deployDocs).toContain("Cloud Run");
    expect(deployDocs).toContain("AWS App Runner");
    expect(deployDocs).toContain("projectRoot: __dirname");
    expect(deployDocs).toContain("assetBaseUrl");
  });

  test("generates AWS Lambda deploy files", async () => {
    const root = await mkdtemp(join(tmpdir(), "mreact-create-lambda-"));
    const directory = join(root, "demo-lambda");

    const result = await createMreactApp({
      deploy: "aws-lambda",
      directory,
      name: "demo-lambda",
      packageManager: "pnpm",
      srcDir: true,
      template: "app-router",
    });

    const handler = await readFile(join(directory, "src", "lambda.ts"), "utf8");
    const deployDocs = await readFile(join(directory, "docs", "deploy", "aws-lambda.md"), "utf8");
    const readme = await readFile(join(directory, "README.md"), "utf8");

    expect(result.files).toContain("src/lambda.ts");
    expect(result.files).toContain("docs/deploy/aws-lambda.md");
    expect(handler).toContain("createAwsLambdaRequestHandler");
    expect(handler).toContain('outDir: new URL("../.mreact", import.meta.url).pathname');
    expect(handler).toContain("importPolicy");
    expect(handler).toContain("allowedPackages");
    expect(handler).toContain("@reckona/mreact-router/adapters/aws-lambda");
    expect(deployDocs).toContain("API Gateway HTTP API v2");
    expect(deployDocs).toContain("importPolicy.allowedPackages");
    expect(deployDocs).toContain("Lambda Function URL");
    expect(deployDocs).toContain("250 MB unzipped deployment package limit");
    expect(deployDocs).toContain("outDir` as read-only");
    expect(deployDocs).toContain("/tmp/mreact-router/<hash>/runtime");
    expect(deployDocs).toContain("node_modules` symlink");
    expect(deployDocs).toContain("mreact-router build --target=node");
    expect(deployDocs).toContain("buildTargets: [\"node\"]");
    expect(deployDocs).toContain("prepare-lambda-asset.sh");
    expect(deployDocs).toContain("--prod --frozen-lockfile --ignore-scripts");
    expect(deployDocs).toContain("--config.node-linker=hoisted");
    expect(deployDocs).toContain("find .lambda -type l");
    expect(deployDocs).toContain("actual file bytes");
    expect(deployDocs).toContain("`src/` is not required at runtime");
    expect(deployDocs).toContain("Streaming SSR");
    expect(deployDocs).toContain("S3 + CloudFront");
    expect(deployDocs).toContain("projectRoot: __dirname");
    expect(deployDocs).toContain("assetBaseUrl");
    expect(readme).toContain("AWS Lambda deploy files are included.");
    const packageJson = JSON.parse(await readFile(join(directory, "package.json"), "utf8")) as {
      scripts?: Record<string, string>;
    };
    expect(packageJson.scripts?.build).toBe("mreact-router build --target=node");
  });

  test("does not generate deploy files unless a deploy target is selected", async () => {
    const root = await mkdtemp(join(tmpdir(), "mreact-create-no-deploy-"));
    const directory = join(root, "demo-no-deploy");

    await createMreactApp({
      directory,
      name: "demo-no-deploy",
      packageManager: "pnpm",
      template: "app-router",
    });

    await expect(access(join(directory, "Dockerfile"))).rejects.toThrow();
    await expect(access(join(directory, ".dockerignore"))).rejects.toThrow();
    await expect(access(join(directory, "docs", "deploy", "container.md"))).rejects.toThrow();
    await expect(access(join(directory, "src", "lambda.ts"))).rejects.toThrow();
    await expect(access(join(directory, "docs", "deploy", "aws-lambda.md"))).rejects.toThrow();
  });
});

async function expectInternalDependencyRange(
  generatedPackage: { dependencies?: Record<string, string> },
  packageName: string,
  workspacePackagePath: string,
): Promise<void> {
  const workspacePackage = JSON.parse(
    await readFile(join(process.cwd(), workspacePackagePath, "package.json"), "utf8"),
  ) as { version: string };

  expect(generatedPackage.dependencies?.[packageName]).toBe(`^${workspacePackage.version}`);
}
