import { mkdir, readdir, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

export type CreateMreactAppTemplate = "basic" | "app-router" | "app-router-tailwind" | "cloudflare";

export type CreateMreactAppPackageManager = "pnpm" | "npm" | "bun";
export type CreateMreactAppDeployTarget = "aws-lambda" | "container";

export interface CreateMreactAppOptions {
  deploy?: CreateMreactAppDeployTarget | undefined;
  directory: string;
  name?: string | undefined;
  packageManager?: CreateMreactAppPackageManager | undefined;
  srcDir?: boolean | undefined;
  template?: CreateMreactAppTemplate | undefined;
}

export interface CreateMreactAppResult {
  deploy?: CreateMreactAppDeployTarget | undefined;
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

const internalPackageVersions = {
  "@reckona/mreact": "^0.0.8",
  "@reckona/mreact-reactive-core": "^0.0.8",
  "@reckona/mreact-router": "^0.0.8",
} as const satisfies Record<string, string>;
const typescriptVersion = "^6.0.3";
const tailwindVersion = "^4.3.0";
const tailwindCliVersion = "^4.3.0";
const concurrentlyVersion = "^9.2.0";
const esbuildVersion = "^0.28.0";
const viteVersion = "^8.0.11";
const wranglerVersion = "^4.15.2";

export async function createMreactApp(
  options: CreateMreactAppOptions,
): Promise<CreateMreactAppResult> {
  const template = options.template ?? "app-router";
  const packageManager = options.packageManager ?? "pnpm";
  const name = sanitizePackageName(options.name ?? basename(options.directory) ?? "mreact-app");
  const definition = templateDefinition(
    template,
    name,
    packageManager,
    options.srcDir === true,
    options.deploy,
  );

  await assertDirectoryWritable(options.directory);

  const files: string[] = [];
  for (const file of definition.files) {
    await writeProjectFile(options.directory, file);
    files.push(file.path);
  }

  return {
    directory: options.directory,
    ...(options.deploy === undefined ? {} : { deploy: options.deploy }),
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
  srcDir: boolean,
  deploy: CreateMreactAppDeployTarget | undefined,
): TemplateDefinition {
  if (template === "basic" || template === "app-router") {
    return appRouterTemplate(name, packageManager, {
      cloudflare: false,
      deploy,
      srcDir,
      tailwind: false,
    });
  }

  if (template === "app-router-tailwind") {
    return appRouterTemplate(name, packageManager, {
      cloudflare: false,
      deploy,
      srcDir,
      tailwind: true,
    });
  }

  return appRouterTemplate(name, packageManager, {
    cloudflare: true,
    deploy,
    srcDir,
    tailwind: false,
  });
}

function appRouterTemplate(
  name: string,
  packageManager: CreateMreactAppPackageManager,
  options: {
    cloudflare: boolean;
    deploy: CreateMreactAppDeployTarget | undefined;
    srcDir: boolean;
    tailwind: boolean;
  },
): TemplateDefinition {
  const paths = templatePaths(options.srcDir);
  const files: TemplateFile[] = [
    {
      path: "package.json",
      content: json({
        name,
        private: true,
        type: "module",
        scripts: packageScripts(packageManager, options),
        dependencies: {
          "@reckona/mreact": internalPackageVersions["@reckona/mreact"],
          "@reckona/mreact-reactive-core": internalPackageVersions["@reckona/mreact-reactive-core"],
          "@reckona/mreact-router": internalPackageVersions["@reckona/mreact-router"],
        },
        devDependencies: {
          typescript: typescriptVersion,
          vite: viteVersion,
          ...(options.tailwind
            ? {
                "@tailwindcss/cli": tailwindCliVersion,
                concurrently: concurrentlyVersion,
                tailwindcss: tailwindVersion,
              }
            : {}),
          ...(options.deploy === "aws-lambda" ? { esbuild: esbuildVersion } : {}),
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
          types: ["@reckona/mreact-router/app-router-globals"],
          skipLibCheck: true,
        },
        include: options.srcDir ? ["src", "vite.config.ts"] : ["app", "src", "vite.config.ts"],
      }),
    },
    {
      path: "vite.config.ts",
      content: viteConfigSource(paths),
    },
    {
      path: `${paths.routesDir}/layout.tsx`,
      content: options.tailwind ? tailwindLayoutSource : layoutSource,
    },
    {
      path: `${paths.routesDir}/page.tsx`,
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
    files.push({
      path: `${paths.routesDir}/globals.css`,
      content: tailwindCssSource,
    });
  }

  if (options.srcDir) {
    files.push({
      path: "src/lib/app-info.ts",
      content: appInfoSource,
    });
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

  if (options.deploy === "container") {
    files.push(
      {
        path: "Dockerfile",
        content: dockerfileSource(packageManager),
      },
      {
        path: ".dockerignore",
        content: dockerignoreSource,
      },
      {
        path: "docs/deploy/container.md",
        content: containerDeployReadmeSource(packageManager),
      },
    );
  }

  if (options.deploy === "aws-lambda") {
    files.push(
      {
        path: "src/lambda.ts",
        content: awsLambdaHandlerSource,
      },
      {
        path: "docs/deploy/aws-lambda.md",
        content: awsLambdaDeployReadmeSource(packageManager),
      },
    );
  }

  return { files };
}

function pageSourceForTemplate(options: {
  cloudflare: boolean;
  srcDir?: boolean | undefined;
  tailwind: boolean;
}): string {
  if (options.cloudflare) return cloudflarePageSource;
  if (options.srcDir) return srcDirPageSource;
  if (options.tailwind) return tailwindPageSource;

  return pageSource;
}

function templatePaths(srcDir: boolean): { routesDir: string; sourceDir: string } {
  return srcDir
    ? { routesDir: "src/app", sourceDir: "src" }
    : { routesDir: "app", sourceDir: "app" };
}

function viteConfigSource(paths: { routesDir: string; sourceDir: string }): string {
  return `import { defineConfig } from "vite";
import { mreactRouter } from "@reckona/mreact-router/vite";

export default defineConfig({
  plugins: [
    mreactRouter({
      routesDir: "${paths.routesDir}",
      publicDir: "public",
      allowedSourceDirs: ["${paths.sourceDir}"],
    }),
  ],
});
`;
}

function packageScripts(
  packageManager: CreateMreactAppPackageManager,
  options: {
    cloudflare: boolean;
    deploy?: CreateMreactAppDeployTarget | undefined;
    srcDir: boolean;
    tailwind: boolean;
  },
): Record<string, string> {
  const run = packageManager === "npm" ? "npm run" : `${packageManager} run`;
  const paths = templatePaths(options.srcDir);
  const scripts: Record<string, string> = {
    dev: "mreact-router dev",
    build: "mreact-router build",
    start: "mreact-router start .mreact",
  };

  if (options.tailwind) {
    scripts["prepare:css"] = "node -e \"require('node:fs').mkdirSync('public',{recursive:true})\"";
    scripts["dev:css"] =
      `tailwindcss -i ./${paths.routesDir}/globals.css -o ./public/styles.css --watch`;
    scripts["build:css"] =
      `tailwindcss -i ./${paths.routesDir}/globals.css -o ./public/styles.css --minify`;
    scripts.dev = `${run} prepare:css && concurrently "${run} dev:css" "${run} dev:router"`;
    scripts["dev:router"] = "mreact-router dev";
    scripts.build = `${run} prepare:css && ${run} build:css && mreact-router build`;
  }

  if (options.cloudflare) {
    scripts.deploy = "wrangler deploy";
    scripts.dev = "wrangler dev";
    scripts.preview = "wrangler dev";
    scripts.build = "mreact-router build";
  }

  if (options.deploy === "aws-lambda") {
    scripts["build:lambda"] =
      "esbuild src/lambda.ts --bundle --platform=node --target=node24 --format=esm --packages=external --outfile=dist/lambda.mjs";
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
  return (
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "") || "mreact-app"
  );
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

const srcDirPageSource = `import { appTitle } from "../lib/app-info.js";

export const metadata = {
  title: "Home",
};

export default function Page() {
  return <main>{appTitle}</main>;
}
`;

const appInfoSource = `export const appTitle = "Hello from mreact";
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

const tailwindCssSource = `@import "tailwindcss";
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

const awsLambdaHandlerSource = `import { createAwsLambdaRequestHandler } from "@reckona/mreact-router/adapters/aws-lambda";

export const handler = createAwsLambdaRequestHandler({
  outDir: new URL("../.mreact", import.meta.url).pathname,
});
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

function dockerfileSource(packageManager: CreateMreactAppPackageManager): string {
  const installCommand =
    packageManager === "pnpm"
      ? "pnpm install --frozen-lockfile || pnpm install"
      : packageManager === "npm"
        ? "npm install"
        : "bun install";
  const buildCommand = packageManager === "npm" ? "npm run build" : `${packageManager} run build`;
  const startCommand =
    packageManager === "npm"
      ? `CMD ["npm", "start"]`
      : packageManager === "bun"
        ? `CMD ["bun", "run", "start"]`
        : `CMD ["pnpm", "start"]`;
  const enablePackageManager =
    packageManager === "pnpm"
      ? "RUN corepack enable\n"
      : packageManager === "bun"
        ? "RUN npm install -g bun\n"
        : "";

  return `FROM node:24-bookworm-slim AS deps
WORKDIR /app
${enablePackageManager}COPY . .
RUN ${installCommand}

FROM node:24-bookworm-slim AS build
WORKDIR /app
${enablePackageManager}COPY --from=deps /app ./
RUN ${buildCommand}

FROM node:24-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080
${enablePackageManager}COPY --from=build /app/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.mreact ./.mreact
EXPOSE 8080
${startCommand}
`;
}

const dockerignoreSource = `node_modules
.mreact
dist
.git
.gitignore
.env
.env.*
npm-debug.log*
pnpm-debug.log*
yarn-debug.log*
yarn-error.log*
`;

function containerDeployReadmeSource(packageManager: CreateMreactAppPackageManager): string {
  const run = packageManager === "npm" ? "npm run" : `${packageManager} run`;

  return `# Container deployment

This project includes a generic container image for platforms such as Cloud Run,
AWS App Runner, Fly.io, Render, and other services that run an HTTP server from
a container.

## Local build

\`\`\`bash
${run} build
docker build -t mreact-app .
docker run --rm -p 8080:8080 -e PORT=8080 mreact-app
\`\`\`

The server reads \`PORT\` and defaults to the value provided by the platform.
The Dockerfile uses Node 24 LTS and runs \`${run} start\`.

## Cloud Run

Cloud Run injects \`PORT\` automatically. The Dockerfile sets \`PORT=8080\` for
local runs, which matches Cloud Run's common default. Build and deploy the image
with your preferred Google Cloud workflow, then route HTTP traffic to the
container.

## AWS App Runner

AWS App Runner can use the same image. Configure the service port as \`8080\`
or set \`PORT\` to the value you choose for the service. Use a simple HTTP
health check path such as \`/\`.

## CDN assets

\`.mreact/client\` contains both hashed client route assets and copied public
assets under \`.mreact/client/public\`. To serve them from a CDN, upload that
directory to your static origin and configure the router:

\`\`\`ts
mreactRouter({
  routesDir: "src/app",
  publicDir: "public",
  allowedSourceDirs: ["src"],
  assetBaseUrl: "https://cdn.example.com/_mreact/client/",
  publicAssetBaseUrl: "https://cdn.example.com/",
});
\`\`\`

Hashed route assets can use a long immutable cache. \`manifest.json\` and
non-fingerprinted public assets should use a shorter cache or revalidation.
`;
}

function awsLambdaDeployReadmeSource(packageManager: CreateMreactAppPackageManager): string {
  const run = packageManager === "npm" ? "npm run" : `${packageManager} run`;

  return `# AWS Lambda deployment

This project includes a Lambda handler at \`src/lambda.ts\` for API Gateway
HTTP API v2 and Lambda Function URL events.

## Build

\`\`\`bash
${run} build
${run} build:lambda
\`\`\`

\`dist/lambda.mjs\` exports \`handler\`. Package that file together with
\`.mreact\`, \`package.json\`, and production \`node_modules\`.

## Runtime shape

- Use API Gateway HTTP API v2 or Lambda Function URL payload format 2.0.
- Use a Node.js Lambda runtime that supports Web \`Request\` and \`Response\`.
- The adapter returns the Lambda proxy response shape with \`cookies\`,
  \`headers\`, \`statusCode\`, \`body\`, and \`isBase64Encoded\`.
- Binary responses are base64 encoded automatically.

## Streaming SSR

API Gateway and Lambda Function URL proxy responses are buffered. mreact still
renders through the same server pipeline, but Streaming SSR is materialized into
one Lambda response body.

For Lambda Function URL response streaming, switch \`src/lambda.ts\` to the
explicit streaming handler:

\`\`\`ts
import { createAwsLambdaStreamingRequestHandler } from "@reckona/mreact-router/adapters/aws-lambda";

export const handler = createAwsLambdaStreamingRequestHandler({
  outDir: new URL("../.mreact", import.meta.url).pathname,
});
\`\`\`

The streaming handler requires an AWS integration configured for payload
response streaming and the Node.js Lambda runtime \`awslambda.streamifyResponse()\`
plus \`awslambda.HttpResponseStream.from()\` APIs.

## Static assets

Lambda can serve \`.mreact/client\`, but it is usually better to move static
assets to S3 + CloudFront. Upload \`.mreact/client\` to your static origin and
configure the router:

\`\`\`ts
mreactRouter({
  routesDir: "src/app",
  publicDir: "public",
  allowedSourceDirs: ["src"],
  assetBaseUrl: "https://cdn.example.com/_mreact/client/",
  publicAssetBaseUrl: "https://cdn.example.com/",
});
\`\`\`

Hashed route assets can use a long immutable cache. \`manifest.json\` and
non-fingerprinted public assets should use a shorter cache or revalidation.
`;
}

function readmeSource(
  name: string,
  packageManager: CreateMreactAppPackageManager,
  options: {
    cloudflare: boolean;
    deploy?: CreateMreactAppDeployTarget | undefined;
    tailwind: boolean;
  },
): string {
  const run = packageManager === "npm" ? "npm run" : `${packageManager} run`;
  const tailwindNote = options.tailwind
    ? "\nTailwind CSS v4 is configured in `app/globals.css`.\n"
    : "";
  const cloudflareNote = options.cloudflare
    ? "\nCloudflare Workers entrypoint lives in `src/worker.ts`. Run `pnpm build` before `wrangler deploy`.\n"
    : "";
  const deployNote =
    options.deploy === "container"
      ? "\nContainer deploy files are included. See `docs/deploy/container.md`.\n"
      : options.deploy === "aws-lambda"
        ? "\nAWS Lambda deploy files are included. See `docs/deploy/aws-lambda.md`.\n"
        : "";
  const pnpmTroubleshooting =
    packageManager === "pnpm"
      ? `
## Troubleshooting

### pnpm approve-builds warning

pnpm 10 may print an \`Ignored build scripts\` warning for transitive tooling packages such as \`esbuild\`, \`@parcel/watcher\`, \`sharp\`, or \`workerd\`. The starter project is safe to continue installing and building when this warning appears. If local development, Tailwind watch mode, or Cloudflare preview later reports a missing native binary, run \`pnpm approve-builds\` and approve the listed tooling packages for this project.
`
      : "";

  return `# ${name}

mreact app-router project generated by \`@reckona/create-mreact-app\`.

## Scripts

- \`${run} dev\`
- \`${run} build\`
- \`${run} start\`
${tailwindNote}${cloudflareNote}${deployNote}${pnpmTroubleshooting}`;
}
