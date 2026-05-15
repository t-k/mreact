import { mkdir, readdir, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

export type CreateMreactAppTemplate =
  | "basic"
  | "app-router"
  | "app-router-tailwind"
  | "cloudflare";

export type CreateMreactAppPackageManager = "pnpm" | "npm" | "bun";

export interface CreateMreactAppOptions {
  directory: string;
  name?: string | undefined;
  packageManager?: CreateMreactAppPackageManager | undefined;
  template?: CreateMreactAppTemplate | undefined;
}

export interface CreateMreactAppResult {
  directory: string;
  files: string[];
  packageManager: CreateMreactAppPackageManager;
  template: CreateMreactAppTemplate;
}

interface TemplateFile {
  path: string;
  content: string;
}

interface TemplateDefinition {
  files: TemplateFile[];
}

const mreactVersion = "^0.0.0";
const routerVersion = "^0.0.0";
const reactiveCoreVersion = "^0.0.0";
const typescriptVersion = "^6.0.3";
const tailwindVersion = "^3.4.17";
const postcssVersion = "^8.5.6";
const autoprefixerVersion = "^10.4.20";
const concurrentlyVersion = "^9.2.0";
const wranglerVersion = "^4.15.2";

export async function createMreactApp(
  options: CreateMreactAppOptions,
): Promise<CreateMreactAppResult> {
  const template = options.template ?? "app-router";
  const packageManager = options.packageManager ?? "pnpm";
  const name = sanitizePackageName(options.name ?? basename(options.directory) ?? "mreact-app");
  const definition = templateDefinition(template, name, packageManager);

  await assertDirectoryWritable(options.directory);

  const files: string[] = [];
  for (const file of definition.files) {
    await writeProjectFile(options.directory, file);
    files.push(file.path);
  }

  return {
    directory: options.directory,
    files,
    packageManager,
    template,
  };
}

export const createMreactAppTemplates = [
  "basic",
  "app-router",
  "app-router-tailwind",
  "cloudflare",
] as const satisfies readonly CreateMreactAppTemplate[];

function templateDefinition(
  template: CreateMreactAppTemplate,
  name: string,
  packageManager: CreateMreactAppPackageManager,
): TemplateDefinition {
  if (template === "basic" || template === "app-router") {
    return appRouterTemplate(name, packageManager, { tailwind: false, cloudflare: false });
  }

  if (template === "app-router-tailwind") {
    return appRouterTemplate(name, packageManager, { tailwind: true, cloudflare: false });
  }

  return appRouterTemplate(name, packageManager, { tailwind: false, cloudflare: true });
}

function appRouterTemplate(
  name: string,
  packageManager: CreateMreactAppPackageManager,
  options: { cloudflare: boolean; tailwind: boolean },
): TemplateDefinition {
  const files: TemplateFile[] = [
    {
      path: "package.json",
      content: json({
        name,
        private: true,
        type: "module",
        scripts: packageScripts(packageManager, options),
        dependencies: {
          "@reckona/mreact": mreactVersion,
          "@reckona/mreact-reactive-core": reactiveCoreVersion,
          "@reckona/mreact-router": routerVersion,
        },
        devDependencies: {
          typescript: typescriptVersion,
          ...(options.tailwind
            ? {
                autoprefixer: autoprefixerVersion,
                concurrently: concurrentlyVersion,
                postcss: postcssVersion,
                tailwindcss: tailwindVersion,
              }
            : {}),
          ...(options.cloudflare ? { wrangler: wranglerVersion } : {}),
        },
      }),
    },
    {
      path: "tsconfig.json",
      content: json({
        compilerOptions: {
          target: "ES2022",
          lib: ["ES2022", "DOM"],
          module: "NodeNext",
          moduleResolution: "NodeNext",
          strict: true,
          jsx: "react-jsx",
          jsxImportSource: "@reckona/mreact",
          skipLibCheck: true,
        },
        include: ["app", "src"],
      }),
    },
    {
      path: "app/layout.tsx",
      content: options.tailwind ? tailwindLayoutSource : layoutSource,
    },
    {
      path: "app/page.tsx",
      content: pageSourceForTemplate(options),
    },
    {
      path: ".gitignore",
      content: "node_modules\n.mreact\ndist\n.env\n",
    },
    {
      path: "README.md",
      content: readmeSource(name, packageManager, options),
    },
  ];

  if (options.tailwind) {
    files.push(
      {
        path: "app/globals.css",
        content: tailwindCssSource,
      },
      {
        path: "tailwind.config.ts",
        content: tailwindConfigSource,
      },
      {
        path: "postcss.config.cjs",
        content: postcssConfigSource,
      },
    );
  }

  if (options.cloudflare) {
    files.push(
      {
        path: "src/worker.ts",
        content: cloudflareWorkerSource,
      },
      {
        path: "wrangler.toml",
        content: wranglerSource(name),
      },
    );
  }

  return { files };
}

function pageSourceForTemplate(options: { cloudflare: boolean; tailwind: boolean }): string {
  if (options.cloudflare) return cloudflarePageSource;
  if (options.tailwind) return tailwindPageSource;

  return pageSource;
}

function packageScripts(
  packageManager: CreateMreactAppPackageManager,
  options: { cloudflare: boolean; tailwind: boolean },
): Record<string, string> {
  const run = packageManager === "npm" ? "npm run" : `${packageManager} run`;
  const scripts: Record<string, string> = {
    dev: "mreact-router dev app",
    build: "mreact-router build app",
    start: "mreact-router start .mreact",
  };

  if (options.tailwind) {
    scripts["prepare:css"] =
      "node -e \"require('node:fs').mkdirSync('app/public',{recursive:true})\"";
    scripts["dev:css"] =
      "tailwindcss -i ./app/globals.css -o ./app/public/styles.css --watch";
    scripts["build:css"] =
      "tailwindcss -i ./app/globals.css -o ./app/public/styles.css --minify";
    scripts.dev = `${run} prepare:css && concurrently "${run} dev:css" "${run} dev:router"`;
    scripts["dev:router"] = "mreact-router dev app";
    scripts.build = `${run} prepare:css && ${run} build:css && mreact-router build app`;
  }

  if (options.cloudflare) {
    scripts.deploy = "wrangler deploy";
    scripts.dev = "wrangler dev";
    scripts.preview = "wrangler dev";
    scripts.build = "mreact-router build app";
  }

  return scripts;
}

async function assertDirectoryWritable(directory: string): Promise<void> {
  await mkdir(directory, { recursive: true });
  const entries = await readdir(directory);

  if (entries.length > 0) {
    throw new Error(`Target directory is not empty: ${directory}`);
  }
}

async function writeProjectFile(root: string, file: TemplateFile): Promise<void> {
  const path = join(root, file.path);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, file.content);
}

function sanitizePackageName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "mreact-app";
}

function json(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

const layoutSource = `export default function Layout() {
  return (
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>mreact app</title>
      </head>
      <body>
        <Slot />
      </body>
    </html>
  );
}
`;

const tailwindLayoutSource = `export default function Layout() {
  return (
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="stylesheet" href="/styles.css" />
        <title>mreact app</title>
      </head>
      <body class="bg-slate-950 text-slate-100">
        <Slot />
      </body>
    </html>
  );
}
`;

const pageSource = `export const metadata = {
  title: "Home",
};

export default function Page() {
  return <main>Hello from mreact</main>;
}
`;

const cloudflarePageSource = `export const metadata = {
  title: "Home",
};

export const prerender = true;

export default function Page() {
  return <main>Hello from mreact on Cloudflare</main>;
}
`;

const tailwindPageSource = `export const metadata = {
  title: "Home",
};

export default function Page() {
  return (
    <main class="mx-auto flex min-h-screen max-w-3xl flex-col justify-center gap-4 px-6">
      <p class="text-sm uppercase tracking-wide text-cyan-300">mreact</p>
      <h1 class="text-4xl font-semibold">Hello from mreact</h1>
      <p class="text-slate-300">
        This page is rendered by the app router and styled with Tailwind.
      </p>
    </main>
  );
}
`;

const tailwindCssSource = `@tailwind base;
@tailwind components;
@tailwind utilities;
`;

const tailwindConfigSource = `import type { Config } from "tailwindcss";

export default {
  content: ["./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {},
  },
  plugins: [],
} satisfies Config;
`;

const postcssConfigSource = `module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
`;

const cloudflareWorkerSource = `import {
  createCloudflareBuiltRequestHandler,
  createCloudflareRouteModuleRenderer,
  createCloudflareStaticAssetLoader,
} from "@reckona/mreact-router/adapters/cloudflare";
import clientManifest from "../.mreact/client/manifest.json" with { type: "json" };
import serverManifest from "../.mreact/server/manifest.json" with { type: "json" };

interface Env {
  ASSETS: {
    fetch(request: Request): Response | Promise<Response>;
  };
}

const routeModules = {
  // Register dynamic route modules by built manifest file key.
  // Example:
  // "users/$id/page.tsx": () => import("./routes/users-id.js"),
};

const renderRouteModule = createCloudflareRouteModuleRenderer<Env>({
  modules: routeModules,
});

const handler = createCloudflareBuiltRequestHandler<Env>({
  assets: createCloudflareStaticAssetLoader({
    binding: (env) => env.ASSETS,
    clientManifest,
  }),
  clientManifest,
  renderRoute(request, context) {
    return renderRouteModule(request, context);
  },
  serverManifest,
});

export default {
  fetch(request: Request, env: Env, context: ExecutionContext): Promise<Response> {
    return handler.fetch(request, env, context);
  },
};
`;

function wranglerSource(name: string): string {
  return `name = "${name}"
main = "src/worker.ts"
compatibility_date = "2026-05-15"

[assets]
directory = ".mreact/client"
binding = "ASSETS"
`;
}

function readmeSource(
  name: string,
  packageManager: CreateMreactAppPackageManager,
  options: { cloudflare: boolean; tailwind: boolean },
): string {
  const run = packageManager === "npm" ? "npm run" : `${packageManager} run`;
  const tailwindNote = options.tailwind
    ? "\nTailwind CSS is configured in `tailwind.config.ts` and `app/globals.css`.\n"
    : "";
  const cloudflareNote = options.cloudflare
    ? "\nCloudflare Workers entrypoint lives in `src/worker.ts`. Run `pnpm build` before `wrangler deploy`.\n"
    : "";

  return `# ${name}

mreact app-router project generated by \`@reckona/create-mreact-app\`.

## Scripts

- \`${run} dev\`
- \`${run} build\`
- \`${run} start\`
${tailwindNote}${cloudflareNote}`;
}
