import { access, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { createMreactApp, upgradeMreactApp } from "../src/index.js";

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
    expect(packageJson.scripts?.typecheck).toBe("tsc --noEmit");
    expect(packageJson.scripts?.lint).toBe("oxlint . --ignore-pattern .mreact");
    expect(packageJson.scripts?.test).toBe("vitest run --passWithNoTests");
    expect(packageJson.dependencies?.["@reckona/mreact-router"]).toBeDefined();
    expect(tsconfig.compilerOptions?.types).toContain("@reckona/mreact-router/app-router-globals");
    expect(viteConfig).toContain('routesDir: "app"');
    expect(layout).not.toContain("<title>");
    expect(page).toContain("Hello from mreact");
    expect(readme).toContain("pnpm approve-builds");
    expect(readme).toContain("Ignored build scripts");
    expect(readme).toContain("pnpm.onlyBuiltDependencies");
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
    const wrangler = await readFile(join(directory, "wrangler.toml"), "utf8");
    const page = await readFile(join(directory, "app", "page.tsx"), "utf8");

    expect(packageJson.scripts?.deploy).toBe("wrangler deploy");
    expect(packageJson.scripts?.build).toBe("mreact-router build --target=cloudflare");
    expect(packageJson.devDependencies?.wrangler).toBeDefined();
    expect(page).toContain("export const prerender = true;");
    expect(wrangler).toContain('main = ".mreact/cloudflare/worker.mjs"');
    await expect(access(join(directory, "src", "worker.ts"))).rejects.toThrow();
  });

  test("generates a dashboard starter with auth, forms, query, and devtools wiring", async () => {
    const root = await mkdtemp(join(tmpdir(), "mreact-create-dashboard-"));
    const directory = join(root, "demo-dashboard");

    const result = await createMreactApp({
      directory,
      name: "demo-dashboard",
      packageManager: "pnpm",
      template: "dashboard",
    });

    const packageJson = JSON.parse(await readFile(join(directory, "package.json"), "utf8")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
      pnpm?: { onlyBuiltDependencies?: string[] };
      scripts?: Record<string, string>;
    };
    const page = await readFile(join(directory, "app", "dashboard", "page.tsx"), "utf8");
    const login = await readFile(join(directory, "app", "login", "page.tsx"), "utf8");
    const loginRoute = await readFile(join(directory, "app", "api", "login", "route.ts"), "utf8");
    const logoutRoute = await readFile(join(directory, "app", "api", "logout", "route.ts"), "utf8");
    const middleware = await readFile(join(directory, "app", "middleware.ts"), "utf8");
    const layout = await readFile(join(directory, "app", "layout.tsx"), "utf8");
    const sessions = await readFile(join(directory, "app", "session-store.ts"), "utf8");
    const devtools = await readFile(join(directory, "src", "devtools.ts"), "utf8");
    const devtoolsBoundary = await readFile(join(directory, "src", "devtools.client.tsx"), "utf8");
    const readme = await readFile(join(directory, "README.md"), "utf8");

    expect(result.files).toContain("app/dashboard/page.tsx");
    expect(result.files).toContain("app/login/page.tsx");
    expect(result.files).toContain("app/api/login/route.ts");
    expect(result.files).toContain("app/api/logout/route.ts");
    expect(result.files).toContain("app/middleware.ts");
    expect(result.files).toContain("src/devtools.client.tsx");
    expect(packageJson.dependencies?.["@reckona/mreact-auth"]).toBeDefined();
    expect(packageJson.dependencies?.["@reckona/mreact-devtools"]).toBeDefined();
    expect(packageJson.dependencies?.["@reckona/mreact-query"]).toBeDefined();
    expect(packageJson.devDependencies?.oxlint).toBeDefined();
    expect(packageJson.devDependencies?.vitest).toBeDefined();
    expect(packageJson.pnpm?.onlyBuiltDependencies).toEqual([
      "@parcel/watcher",
      "esbuild",
      "sharp",
      "workerd",
    ]);
    expect(packageJson.scripts?.["dev:router"]).toBe("mreact-router dev");
    expect(page).toContain("requireRole");
    expect(page).toContain("createQuery");
    expect(login).toContain('method="post"');
    expect(login).toContain('action="/api/login"');
    expect(loginRoute).toContain("createSession");
    expect(loginRoute).toContain('roles: ["admin"]');
    expect(logoutRoute).toContain("destroySession");
    expect(middleware).toContain('matcher: ["/dashboard/:path*"]');
    expect(layout).toContain("DashboardDevtools");
    expect(sessions).toContain("createMemorySessionStore");
    expect(devtools).toContain("@reckona/mreact-devtools/overlay");
    expect(devtools).toContain("import.meta.env.DEV");
    expect(devtoolsBoundary).toContain("mountDashboardDevtools");
    expect(readme).toContain("dashboard starter");
    expect(readme).toContain("demo@example.com");
    expect(readme).toContain("kanban1234");
    expect(readme).toContain("Adding native dependencies");
  });

  test("uses workspace ranges when scaffolding inside a pnpm workspace with mreact packages", async () => {
    const root = await mkdtemp(join(tmpdir(), "mreact-create-workspace-"));
    await writeFile(
      join(root, "pnpm-workspace.yaml"),
      ["packages:", '  - "packages/*"', '  - "examples/*"', ""].join("\n"),
    );
    await mkdir(join(root, "packages", "router"), { recursive: true });
    await writeFile(
      join(root, "packages", "router", "package.json"),
      JSON.stringify({ name: "@reckona/mreact-router", version: "0.0.0" }, null, 2),
    );
    await mkdir(join(root, "packages", "react"), { recursive: true });
    await writeFile(
      join(root, "packages", "react", "package.json"),
      JSON.stringify({ name: "@reckona/mreact", version: "0.0.0" }, null, 2),
    );
    await mkdir(join(root, "packages", "reactive-core"), { recursive: true });
    await writeFile(
      join(root, "packages", "reactive-core", "package.json"),
      JSON.stringify({ name: "@reckona/mreact-reactive-core", version: "0.0.0" }, null, 2),
    );
    const directory = join(root, "examples", "dogfood");

    await createMreactApp({
      directory,
      name: "dogfood",
      packageManager: "pnpm",
      template: "app-router",
    });

    const packageJson = JSON.parse(await readFile(join(directory, "package.json"), "utf8")) as {
      dependencies?: Record<string, string>;
    };

    expect(packageJson.dependencies?.["@reckona/mreact"]).toBe("workspace:*");
    expect(packageJson.dependencies?.["@reckona/mreact-router"]).toBe("workspace:*");
    expect(packageJson.dependencies?.["@reckona/mreact-reactive-core"]).toBe("workspace:*");
  });

  test("scaffolds workspace examples with scoped names and useful app-router deps", async () => {
    const root = await mkdtemp(join(tmpdir(), "mreact-create-example-workspace-"));
    await writeFile(
      join(root, "pnpm-workspace.yaml"),
      ["packages:", '  - "packages/*"', '  - "examples/*"', ""].join("\n"),
    );
    for (const [directory, name] of [
      ["react", "@reckona/mreact"],
      ["router", "@reckona/mreact-router"],
      ["query", "@reckona/mreact-query"],
      ["reactive-core", "@reckona/mreact-reactive-core"],
      ["reactive-dom", "@reckona/mreact-reactive-dom"],
      ["test-utils", "@reckona/mreact-test-utils"],
    ] as const) {
      await mkdir(join(root, "packages", directory), { recursive: true });
      await writeFile(
        join(root, "packages", directory, "package.json"),
        JSON.stringify({ name, version: "0.0.0" }, null, 2),
      );
    }
    const directory = join(root, "examples", "ai-chat");

    await createMreactApp({
      directory,
      packageManager: "pnpm",
      srcDir: true,
      template: "app-router-tailwind",
    });

    const packageJson = JSON.parse(await readFile(join(directory, "package.json"), "utf8")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
      name?: string;
    };

    expect(packageJson.name).toBe("@reckona/example-ai-chat");
    expect(packageJson.dependencies?.["@reckona/mreact-query"]).toBe("workspace:*");
    expect(packageJson.dependencies?.["@reckona/mreact-reactive-dom"]).toBe("workspace:*");
    expect(packageJson.dependencies?.["@reckona/mreact-test-utils"]).toBe("workspace:*");
    expect(packageJson.devDependencies?.["@playwright/test"]).toBeDefined();
    expect(packageJson.devDependencies?.tsx).toBeDefined();
  });

  test("upgrades mreact dependency ranges and reports registered codemods", async () => {
    const root = await mkdtemp(join(tmpdir(), "mreact-upgrade-"));
    const directory = join(root, "demo-upgrade");
    await mkdir(directory, { recursive: true });
    await writeFile(
      join(directory, "package.json"),
      JSON.stringify(
        {
          dependencies: {
            "@reckona/mreact": "^0.0.10",
            "@reckona/mreact-router": "^0.0.10",
            other: "^1.0.0",
          },
          devDependencies: {
            "@reckona/mreact-devtools": "^0.0.10",
          },
        },
        null,
        2,
      ),
    );

    const dryRun = await upgradeMreactApp({ directory, dryRun: true, fromVersion: "0.0.10" });
    const dryRunPackage = await readFile(join(directory, "package.json"), "utf8");
    expect(dryRun.changed).toBe(true);
    expect(dryRun.updatedDependencies.map((item) => item.name).sort()).toEqual([
      "@reckona/mreact",
      "@reckona/mreact-devtools",
      "@reckona/mreact-router",
    ]);
    expect(dryRun.codemods.map((item) => item.id)).toContain("0.0.16-import-policy-normalize");
    expect(dryRunPackage).toContain('"@reckona/mreact": "^0.0.10"');

    const result = await upgradeMreactApp({ directory, fromVersion: "0.0.10" });
    const packageJson = JSON.parse(await readFile(join(directory, "package.json"), "utf8")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };

    expect(result.changed).toBe(true);
    expect(packageJson.dependencies?.["@reckona/mreact"]).toBe("^0.0.50");
    expect(packageJson.dependencies?.["@reckona/mreact-router"]).toBe("^0.0.50");
    expect(packageJson.dependencies?.other).toBe("^1.0.0");
    expect(packageJson.devDependencies?.["@reckona/mreact-devtools"]).toBe("^0.0.50");
  });

  test("adds app-router global types when upgrading an existing router app", async () => {
    const root = await mkdtemp(join(tmpdir(), "mreact-upgrade-router-types-"));
    const directory = join(root, "demo-upgrade-router-types");
    await mkdir(directory, { recursive: true });
    await writeFile(
      join(directory, "package.json"),
      JSON.stringify(
        {
          dependencies: {
            "@reckona/mreact": "^0.0.34",
            "@reckona/mreact-router": "^0.0.34",
          },
        },
        null,
        2,
      ),
    );
    await writeFile(
      join(directory, "tsconfig.json"),
      JSON.stringify(
        {
          compilerOptions: {
            jsx: "react-jsx",
            types: ["node"],
          },
          include: ["src", "vite.config.ts"],
        },
        null,
        2,
      ),
    );

    const dryRun = await upgradeMreactApp({ directory, dryRun: true, fromVersion: "0.0.34" });
    const dryRunTsconfig = JSON.parse(await readFile(join(directory, "tsconfig.json"), "utf8")) as {
      compilerOptions?: { types?: string[] };
    };
    expect(dryRun.changed).toBe(true);
    expect(dryRunTsconfig.compilerOptions?.types).toEqual(["node"]);

    const result = await upgradeMreactApp({ directory, fromVersion: "0.0.34" });
    const tsconfig = JSON.parse(await readFile(join(directory, "tsconfig.json"), "utf8")) as {
      compilerOptions?: { types?: string[] };
    };

    expect(result.changed).toBe(true);
    expect(tsconfig.compilerOptions?.types).toEqual([
      "node",
      "@reckona/mreact-router/app-router-globals",
    ]);
  });

  test("adds app-router global types without rewriting already current package metadata", async () => {
    const root = await mkdtemp(join(tmpdir(), "mreact-upgrade-router-types-current-"));
    const directory = join(root, "demo-upgrade-router-types-current");
    const packageJsonSource = JSON.stringify(
      {
        dependencies: {
          "@reckona/mreact": "^0.0.50",
          "@reckona/mreact-router": "^0.0.50",
        },
      },
      null,
      4,
    );
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, "package.json"), packageJsonSource);
    await writeFile(
      join(directory, "tsconfig.json"),
      JSON.stringify({ compilerOptions: { jsx: "react-jsx" } }, null, 2),
    );

    const result = await upgradeMreactApp({ directory, fromVersion: "0.0.50" });
    const packageJson = await readFile(join(directory, "package.json"), "utf8");
    const tsconfig = JSON.parse(await readFile(join(directory, "tsconfig.json"), "utf8")) as {
      compilerOptions?: { types?: string[] };
    };

    expect(result.changed).toBe(true);
    expect(packageJson).toBe(packageJsonSource);
    expect(tsconfig.compilerOptions?.types).toEqual(["@reckona/mreact-router/app-router-globals"]);
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
    expect(handler).toContain("createPreloadedAwsLambdaRequestHandler");
    expect(handler).toContain('outDir: new URL("../.mreact", import.meta.url).pathname');
    expect(handler).toContain('importPolicy: "generated"');
    expect(handler).toContain("@reckona/mreact-router/adapters/aws-lambda");
    expect(deployDocs).toContain("API Gateway HTTP API v2");
    expect(deployDocs).toContain('importPolicy: "generated"');
    expect(deployDocs).toContain("Lambda Function URL");
    expect(deployDocs).toContain("250 MB unzipped deployment package limit");
    expect(deployDocs).toContain("outDir` as read-only");
    expect(deployDocs).toContain("/tmp/mreact-router/<hash>/runtime");
    expect(deployDocs).toContain("node_modules` symlink");
    expect(deployDocs).toContain("mreact-router build --target=aws-lambda");
    expect(deployDocs).toContain('buildTargets: ["aws-lambda"]');
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
      devDependencies?: Record<string, string>;
      scripts?: Record<string, string>;
    };
    expect(packageJson.scripts?.build).toBe("mreact-router build --target=aws-lambda");
    expect(packageJson.scripts?.["package:lambda"]).toBe(
      "mreact-router package aws-lambda --from .mreact --out .lambda",
    );
    expect(packageJson.scripts?.["build:lambda"]).toBeUndefined();
    expect(packageJson.devDependencies?.esbuild).toBeUndefined();
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
