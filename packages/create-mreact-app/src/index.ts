import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

export type CreateMreactAppTemplate =
  | "basic"
  | "app-router"
  | "app-router-tailwind"
  | "cloudflare"
  | "dashboard";

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

export interface UpgradeMreactAppOptions {
  directory: string;
  dryRun?: boolean | undefined;
  fromVersion?: string | undefined;
  targetVersion?: string | undefined;
}

export interface UpgradeMreactAppDependencyUpdate {
  field: PackageDependencyField;
  from: string;
  name: string;
  to: string;
}

export interface UpgradeMreactAppCodemodResult {
  applied: boolean;
  description: string;
  id: string;
}

export interface UpgradeMreactAppResult {
  changed: boolean;
  codemods: UpgradeMreactAppCodemodResult[];
  packageJsonPath: string;
  updatedDependencies: UpgradeMreactAppDependencyUpdate[];
}

interface TemplateFile {
  path: string;
  content: string;
}

interface TemplateDefinition {
  files: TemplateFile[];
}

const internalPackageVersions = {
  "@reckona/mreact-auth": "^0.0.22",
  "@reckona/mreact-devtools": "^0.0.22",
  "@reckona/mreact-forms": "^0.0.22",
  "@reckona/mreact": "^0.0.22",
  "@reckona/mreact-query": "^0.0.22",
  "@reckona/mreact-reactive-core": "^0.0.22",
  "@reckona/mreact-router": "^0.0.22",
} as const satisfies Record<string, string>;
const currentMreactVersion = internalPackageVersions["@reckona/mreact"].replace(/^\^/, "");
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

export async function upgradeMreactApp(
  options: UpgradeMreactAppOptions,
): Promise<UpgradeMreactAppResult> {
  const packageJsonPath = join(options.directory, "package.json");
  const source = await readFile(packageJsonPath, "utf8");
  const packageJson = JSON.parse(source) as Record<string, unknown>;
  const targetVersion = options.targetVersion ?? currentMreactVersion;
  const targetRange = `^${targetVersion}`;
  const updatedDependencies: UpgradeMreactAppDependencyUpdate[] = [];

  for (const field of packageDependencyFields) {
    const dependencies = packageJson[field];

    if (!isDependencyRecord(dependencies)) {
      continue;
    }

    for (const [name, from] of Object.entries(dependencies)) {
      if (!isMreactWorkspacePackage(name) || from === targetRange) {
        continue;
      }

      dependencies[name] = targetRange;
      updatedDependencies.push({
        field,
        from,
        name,
        to: targetRange,
      });
    }
  }

  const codemods = createMreactAppCodemods
    .filter((codemod) => shouldRunCodemod(options.fromVersion, codemod.version, targetVersion))
    .map((codemod) => ({
      applied: options.dryRun !== true,
      description: codemod.description,
      id: codemod.id,
    }));
  const changed = updatedDependencies.length > 0 || codemods.length > 0;

  if (changed && options.dryRun !== true) {
    await writeFile(packageJsonPath, json(packageJson));
  }

  return {
    changed,
    codemods,
    packageJsonPath,
    updatedDependencies,
  };
}

export const createMreactAppTemplates = [
  "basic",
  "app-router",
  "app-router-tailwind",
  "cloudflare",
  "dashboard",
] as const satisfies readonly CreateMreactAppTemplate[];

export const createMreactAppCodemods = [
  {
    description:
      "Normalize app-router import policy examples after the 0.0.16 adapter template changes.",
    id: "0.0.16-import-policy-normalize",
    version: "0.0.16",
  },
  {
    description:
      "Check AWS Lambda template ESM entrypoints and package-manager production install guidance.",
    id: "0.0.16-aws-lambda-esm-template",
    version: "0.0.16",
  },
] as const;

export type PackageDependencyField =
  | "dependencies"
  | "devDependencies"
  | "peerDependencies"
  | "optionalDependencies";

const packageDependencyFields = [
  "dependencies",
  "devDependencies",
  "peerDependencies",
  "optionalDependencies",
] as const satisfies readonly PackageDependencyField[];

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
      dashboard: false,
      deploy,
      srcDir,
      tailwind: false,
    });
  }

  if (template === "app-router-tailwind") {
    return appRouterTemplate(name, packageManager, {
      cloudflare: false,
      dashboard: false,
      deploy,
      srcDir,
      tailwind: true,
    });
  }

  if (template === "dashboard") {
    return appRouterTemplate(name, packageManager, {
      cloudflare: false,
      dashboard: true,
      deploy,
      srcDir,
      tailwind: true,
    });
  }

  return appRouterTemplate(name, packageManager, {
    cloudflare: true,
    dashboard: false,
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
    dashboard: boolean;
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
          ...(options.dashboard
            ? {
                "@reckona/mreact-auth": internalPackageVersions["@reckona/mreact-auth"],
                "@reckona/mreact-devtools": internalPackageVersions["@reckona/mreact-devtools"],
                "@reckona/mreact-forms": internalPackageVersions["@reckona/mreact-forms"],
                "@reckona/mreact-query": internalPackageVersions["@reckona/mreact-query"],
              }
            : {}),
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

  if (options.dashboard) {
    files.push(
      {
        path: `${paths.routesDir}/dashboard/page.tsx`,
        content: dashboardPageSource,
      },
      {
        path: `${paths.routesDir}/login/page.tsx`,
        content: dashboardLoginPageSource,
      },
      {
        path: `${paths.routesDir}/session-store.ts`,
        content: dashboardSessionStoreSource,
      },
      {
        path: "src/devtools.ts",
        content: dashboardDevtoolsSource,
      },
    );
  }

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
  dashboard?: boolean | undefined;
  srcDir?: boolean | undefined;
  tailwind: boolean;
}): string {
  if (options.cloudflare) return cloudflarePageSource;
  if (options.dashboard) return dashboardHomePageSource;
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
      projectRoot: __dirname,
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
    build: "mreact-router build --target=node",
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
    scripts.build = `${run} prepare:css && ${run} build:css && mreact-router build --target=node`;
  }

  if (options.cloudflare) {
    scripts.deploy = "wrangler deploy";
    scripts.dev = "wrangler dev";
    scripts.preview = "wrangler dev";
    scripts.build = "mreact-router build --target=cloudflare";
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

function isDependencyRecord(value: unknown): value is Record<string, string> {
  return (
    typeof value === "object" &&
    value !== null &&
    Object.values(value).every((entry) => typeof entry === "string")
  );
}

function isMreactWorkspacePackage(name: string): boolean {
  return name.startsWith("@reckona/mreact") || name === "@reckona/create-mreact-app";
}

function shouldRunCodemod(
  fromVersion: string | undefined,
  codemodVersion: string,
  targetVersion: string,
): boolean {
  if (fromVersion === undefined) {
    return true;
  }

  return (
    compareVersions(fromVersion, codemodVersion) < 0 &&
    compareVersions(codemodVersion, targetVersion) <= 0
  );
}

function compareVersions(left: string, right: string): number {
  const leftParts = parseVersion(left);
  const rightParts = parseVersion(right);

  for (let index = 0; index < 3; index += 1) {
    const difference = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
    if (difference !== 0) {
      return difference;
    }
  }

  return 0;
}

function parseVersion(value: string): [number, number, number] {
  const [major = "0", minor = "0", patch = "0"] = value.replace(/^[^\d]*/, "").split(".");

  return [Number(major) || 0, Number(minor) || 0, Number(patch) || 0];
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

const dashboardHomePageSource = `export const metadata = {
  title: "Dashboard starter",
};

export default function Page() {
  return (
    <main class="mx-auto grid min-h-screen max-w-5xl content-center gap-6 px-6 py-12">
      <section class="grid gap-3">
        <p class="text-sm font-medium text-cyan-300">mreact dashboard starter</p>
        <h1 class="text-4xl font-semibold text-white">Operations dashboard baseline</h1>
        <p class="max-w-2xl text-slate-300">
          Auth guards, form state, query cache hydration, Tailwind, and the devtools overlay are
          wired into one starter.
        </p>
      </section>
      <nav class="flex flex-wrap gap-3">
        <a class="rounded-md bg-cyan-300 px-4 py-2 font-medium text-slate-950" href="/dashboard">
          Open dashboard
        </a>
        <a class="rounded-md border border-slate-700 px-4 py-2 text-slate-100" href="/login">
          Login form
        </a>
      </nav>
    </main>
  );
}
`;

const dashboardPageSource = `import { requireRole } from "@reckona/mreact-auth";
import {
  createQuery,
  getQueryClient,
  type QueryClient,
  type QueryKey,
} from "@reckona/mreact-query";
import { sessions, type DashboardSessionData } from "../session-store.js";

export const metadata = {
  title: "Dashboard",
};

interface LoaderContext {
  queryClient: QueryClient;
  request: Request;
}

interface DashboardMetric {
  label: string;
  value: string;
}

interface DashboardData {
  actor: string;
  metrics: readonly DashboardMetric[];
}

const DASHBOARD_KEY: QueryKey = ["dashboard", "metrics"];

async function fetchDashboardMetrics(): Promise<readonly DashboardMetric[]> {
  return [
    { label: "Active users", value: "1,248" },
    { label: "Conversion", value: "7.4%" },
    { label: "Queue depth", value: "18" },
  ];
}

export async function loader(context: LoaderContext): Promise<DashboardData> {
  const session = await requireRole<DashboardSessionData>(context.request, sessions, "admin");
  const metrics = await context.queryClient.fetchQuery({
    queryKey: DASHBOARD_KEY,
    queryFn: fetchDashboardMetrics,
  });

  return {
    actor: session.data.userId,
    metrics,
  };
}

export default function Page(props: { data: DashboardData }) {
  const observer = createQuery(getQueryClient(), {
    queryKey: DASHBOARD_KEY,
    queryFn: fetchDashboardMetrics,
  });
  const live = observer.result.get();
  const metrics = live.data ?? props.data.metrics;

  return (
    <main class="mx-auto grid max-w-6xl gap-6 px-6 py-10">
      <header class="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p class="text-sm text-cyan-300">Signed in as {props.data.actor}</p>
          <h1 class="text-3xl font-semibold text-white">Dashboard</h1>
        </div>
        <a class="rounded-md border border-slate-700 px-3 py-2 text-sm text-slate-200" href="/login">
          Login form
        </a>
      </header>
      <section class="grid gap-4 md:grid-cols-3">
        {metrics.map((metric) => (
          <article class="rounded-lg border border-slate-800 bg-slate-900 p-4" key={metric.label}>
            <p class="text-sm text-slate-400">{metric.label}</p>
            <strong class="mt-2 block text-3xl text-white">{metric.value}</strong>
          </article>
        ))}
      </section>
      <section class="rounded-lg border border-slate-800 bg-slate-900">
        <table class="w-full border-collapse text-left text-sm">
          <thead class="text-slate-400">
            <tr>
              <th class="border-b border-slate-800 p-3">Segment</th>
              <th class="border-b border-slate-800 p-3">Status</th>
              <th class="border-b border-slate-800 p-3">Owner</th>
            </tr>
          </thead>
          <tbody>
            {["Acquisition", "Activation", "Retention"].map((segment) => (
              <tr key={segment}>
                <td class="border-b border-slate-800 p-3">{segment}</td>
                <td class="border-b border-slate-800 p-3 text-emerald-300">On track</td>
                <td class="border-b border-slate-800 p-3">Admin</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}
`;

const dashboardLoginPageSource = `import { createForm } from "@reckona/mreact-forms";

export const metadata = {
  title: "Login",
};

interface LoginValues {
  email: string;
  password: string;
}

const loginForm = createForm<LoginValues>({
  initialValues: { email: "", password: "" },
  validate: {
    email: (value) => (/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(value) ? undefined : "Enter an email."),
    password: (value) => (value.length >= 8 ? undefined : "Use at least 8 characters."),
  },
  validateOn: ["blur", "submit"],
});

function syncLoginTarget(target: EventTarget | null): void {
  if (target instanceof HTMLInputElement) {
    if (target.name === "email") void loginForm.setValue("email", target.value);
    if (target.name === "password") void loginForm.setValue("password", target.value);
  }
}

export default function Page() {
  const state = loginForm.state.get();

  return (
    <main class="mx-auto grid min-h-screen max-w-md content-center px-6">
      <form
        class="grid gap-4 rounded-lg border border-slate-800 bg-slate-900 p-6"
        noValidate
        onInput={(event) => syncLoginTarget(event.target)}
        onSubmit={(event) => {
          event.preventDefault();
          void loginForm.validate();
        }}
      >
        <h1 class="text-2xl font-semibold text-white">Login</h1>
        <label class="grid gap-1 text-sm text-slate-300">
          Email
          <input class="rounded-md border border-slate-700 bg-slate-950 px-3 py-2" name="email" type="email" />
        </label>
        <label class="grid gap-1 text-sm text-slate-300">
          Password
          <input class="rounded-md border border-slate-700 bg-slate-950 px-3 py-2" name="password" type="password" />
        </label>
        <p class="text-sm text-rose-300">{state.errors.email?.[0] ?? state.errors.password?.[0] ?? ""}</p>
        <button class="rounded-md bg-cyan-300 px-4 py-2 font-medium text-slate-950" type="submit">
          Continue
        </button>
      </form>
    </main>
  );
}
`;

const dashboardSessionStoreSource = `import { createMemorySessionStore, type AuthSessionClaims } from "@reckona/mreact-auth";

export interface DashboardSessionData extends AuthSessionClaims {
  roles: readonly string[];
  userId: string;
}

const globalKey = "__mreactDashboardSessions";
const globalStore = globalThis as typeof globalThis & {
  [globalKey]?: ReturnType<typeof createMemorySessionStore<DashboardSessionData>>;
};

export const sessions =
  globalStore[globalKey] ??= createMemorySessionStore<DashboardSessionData>();
`;

const dashboardDevtoolsSource = `export async function mountDashboardDevtools(): Promise<void> {
  if (!import.meta.env.DEV || typeof document === "undefined") {
    return;
  }

  const { mountDevtoolsOverlay } = await import("@reckona/mreact-devtools/overlay");
  mountDevtoolsOverlay();
}
`;

const tailwindCssSource = `@import "tailwindcss";
`;

const cloudflareWorkerSource = `import {
  createCloudflareBuiltRequestHandler,
  createCloudflareRouteModuleRenderer,
  createCloudflareStaticAssetLoader,
} from "@reckona/mreact-router/adapters/cloudflare";
import { routeModules } from "../.mreact/cloudflare/route-modules.mjs";
import clientManifest from "../.mreact/client/manifest.json" with { type: "json" };
import serverManifest from "../.mreact/server/manifest.json" with { type: "json" };

interface Env {
  ASSETS: {
    fetch(request: Request): Response | Promise<Response>;
  };
}

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

const awsLambdaHandlerSource = `import { createPreloadedAwsLambdaRequestHandler } from "@reckona/mreact-router/adapters/aws-lambda";

export const handler = await createPreloadedAwsLambdaRequestHandler({
  outDir: new URL("../.mreact", import.meta.url).pathname,
  importPolicy: {
    // Add packages imported by loaders, middleware, route handlers, or server actions.
    allowedPackages: [
      "@reckona/mreact",
      // "cookie",
      // "zod",
    ],
  },
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
  projectRoot: __dirname,
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
  const installProd =
    packageManager === "pnpm"
      ? "pnpm --dir .lambda install --prod --frozen-lockfile --ignore-scripts --config.node-linker=hoisted"
      : packageManager === "npm"
        ? "(cd .lambda && npm ci --omit=dev --ignore-scripts)"
        : "(cd .lambda && bun install --production)";
  const lockfiles =
    packageManager === "pnpm"
      ? "pnpm-lock.yaml pnpm-workspace.yaml"
      : packageManager === "npm"
        ? "package-lock.json npm-shrinkwrap.json"
        : "bun.lock";

  return `# AWS Lambda deployment

This project includes a Lambda handler at \`src/lambda.ts\` for API Gateway
HTTP API v2 and Lambda Function URL events.

## Build

\`\`\`bash
${run} build
${run} build:lambda
\`\`\`

The generated \`build\` script runs \`mreact-router build --target=node\`.
Keep that Node-only target for Lambda apps, especially when loaders or server
helpers import Node-only packages such as database drivers. If you replace the
script, use the same target explicitly:

\`\`\`bash
mreact-router build --target=node
${run} build:lambda
\`\`\`

You can also make the target a project default in \`vite.config.ts\`:

\`\`\`ts
mreactRouter({
  buildTargets: ["node"],
});
\`\`\`

\`dist/lambda.mjs\` exports \`handler\`. Package that file together with
\`.mreact\`, \`package.json\`, and production \`node_modules\`.

## Minimal deployment artifact

AWS Lambda has a 250 MB unzipped deployment package limit. Do not point CDK, SAM, Serverless Framework, or Terraform at the full project root after a CI install, because that can include source files, tests, dev dependencies, Vite/Vitest/Playwright tooling, and package-manager caches. The mreact runtime only needs the built app output, the Lambda handler bundle, and production runtime dependencies.

The Lambda adapter treats \`outDir\` as read-only. On cold start it materializes generated runtime files under \`/tmp/mreact-router/<hash>/runtime\` and creates a \`node_modules\` symlink back to the deployed package root so server-side imports resolve from the production dependencies. Static middleware \`config.matcher\` / \`config.id\` checks run before middleware module import, and loader redirects settle before page component server transforms for non-stream routes and stream routes without a loading boundary. Pass \`runtimeDir\` to \`createAwsLambdaRequestHandler()\` only if you need a custom writable cache directory.

pnpm's default isolated linker creates a symlink-heavy \`node_modules\` tree. Some Lambda packaging tools dereference those links or count their targets differently, which can make an artifact look small locally but exceed the unzipped limit after packaging. For pnpm Lambda artifacts, install production dependencies into \`.lambda/\` with \`--config.node-linker=hoisted\`, then verify both symlink count and actual file bytes before upload.

\`src/\` is not required at runtime when \`.mreact/server/manifest.json\` is present. Server source needed by the runtime is materialized into the build manifest and server module artifacts during \`${run} build\`.

Recommended artifact layout:

\`\`\`text
.lambda/
  .mreact/
  dist/lambda.mjs
  package.json
  lockfile
  node_modules/
\`\`\`

Create a dedicated asset directory before handing it to CDK/SAM/serverless. Save this as \`scripts/prepare-lambda-asset.sh\` if you want a repeatable deploy step:

\`\`\`bash
#!/usr/bin/env bash
set -euo pipefail

rm -rf .lambda
mkdir -p .lambda/dist

${run} build
${run} build:lambda

cp -R .mreact .lambda/.mreact
cp dist/lambda.mjs .lambda/dist/lambda.mjs
cp package.json .lambda/
for file in ${lockfiles}; do
  if [ -f "$file" ]; then
    cp "$file" .lambda/
  fi
done

${installProd}
find .lambda -name '*.tsbuildinfo' -delete
du -sh .lambda
find .lambda -type l | wc -l
find .lambda -type f -printf '%s\\n' | awk '{ total += $1 } END { printf "actual file bytes: %d\\n", total }'
\`\`\`

## Runtime shape

- Use API Gateway HTTP API v2 or Lambda Function URL payload format 2.0.
- Use a Node.js Lambda runtime that supports Web \`Request\` and \`Response\`.
- The adapter returns the Lambda proxy response shape with \`cookies\`,
  \`headers\`, \`statusCode\`, \`body\`, and \`isBase64Encoded\`.
- Binary responses are base64 encoded automatically.

## Server dependencies

Production adapters enforce the app-router import policy when bundling loaders, middleware, route handlers, metadata, and server actions. Add every npm package imported by server-side application code to \`importPolicy.allowedPackages\` in \`src/lambda.ts\`, including packages used through app-local helper modules. Those same packages must be present in the production \`node_modules\` copied into the Lambda artifact; \`importPolicy.allowedPackages\` permits imports, but it does not vendor missing dependencies.

\`\`\`ts
export const handler = await createPreloadedAwsLambdaRequestHandler({
  outDir: new URL("../.mreact", import.meta.url).pathname,
  importPolicy: {
    allowedPackages: [
      "@reckona/mreact",
      "cookie",
      "jose",
      "zod",
    ],
  },
});
\`\`\`

The generated handler uses top-level \`await\` with \`createPreloadedAwsLambdaRequestHandler()\` so the built runtime, middleware, route modules, layouts, and metadata are imported during the Lambda initialization phase instead of racing the first user request. Static middleware matchers, loader redirects, request artifacts without page render exports, and split loader/metadata artifacts avoid unnecessary dependency evaluation on unmatched health checks and simple redirects. Add \`timings: true\` while diagnosing production latency to emit \`router:request:timing\` and \`router:render:timing\` debug events for request conversion, render phases, loader wait, source analysis, page render, layout render, response construction, and Lambda response conversion. Loader timing splits module load/evaluation from user loader execution with \`loaderModuleLoadMs\` and \`loaderExecutionMs\`; source analysis reports \`sourceAnalysisArtifactMs\` when a built analysis summary is reused; middleware timing similarly splits \`middlewareModuleLoadMs\` and \`middlewareExecutionMs\`.

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
  projectRoot: __dirname,
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
    dashboard?: boolean | undefined;
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
  const dashboardNote = options.dashboard
    ? "\nThis is the dashboard starter. It includes auth guards, form state, query cache hydration, Tailwind styling, and an opt-in devtools overlay helper in `src/devtools.ts`.\n"
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
${tailwindNote}${cloudflareNote}${deployNote}${dashboardNote}${pnpmTroubleshooting}`;
}
