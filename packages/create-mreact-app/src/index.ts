import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, join, relative, resolve } from "node:path";

/** Names the starter template used when scaffolding a new mreact app. */
export type CreateMreactAppTemplate = "basic" | "tailwind" | "dashboard";

/** Names the package manager used to write install and script commands. */
export type CreateMreactAppPackageManager = "pnpm" | "npm" | "bun";

/** Names the deployment target whose files are included in the generated app. */
export type CreateMreactAppDeployTarget = "aws-lambda" | "cloudflare" | "container";

/** Configures the project directory, template, package manager, and deploy target for app scaffolding. */
export interface CreateMreactAppOptions {
  deploy?: CreateMreactAppDeployTarget | undefined;
  directory: string;
  name?: string | undefined;
  packageManager?: CreateMreactAppPackageManager | undefined;
  srcDir?: boolean | undefined;
  template?: CreateMreactAppTemplate | undefined;
}

/** Reports the generated app directory, files, package manager, template, and deploy target. */
export interface CreateMreactAppResult {
  deploy?: CreateMreactAppDeployTarget | undefined;
  directory: string;
  files: string[];
  packageManager: CreateMreactAppPackageManager;
  template: CreateMreactAppTemplate;
}

/** Configures an existing mreact app upgrade run. */
export interface UpgradeMreactAppOptions {
  directory: string;
  dryRun?: boolean | undefined;
  fromVersion?: string | undefined;
  targetVersion?: string | undefined;
}

/** Describes a package dependency version changed by an app upgrade run. */
export interface UpgradeMreactAppDependencyUpdate {
  field: PackageDependencyField;
  from: string;
  name: string;
  to: string;
}

/** Reports whether an upgrade codemod would be or was applied. */
export interface UpgradeMreactAppCodemodResult {
  applied: boolean;
  description: string;
  id: string;
}

/** Reports the package file, dependency updates, codemods, and change flag for an upgrade run. */
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
  "@reckona/mreact-auth": "^0.0.181",
  "@reckona/mreact-devtools": "^0.0.181",
  "@reckona/mreact-forms": "^0.0.181",
  "@reckona/mreact": "^0.0.181",
  "@reckona/mreact-query": "^0.0.181",
  "@reckona/mreact-reactive-core": "^0.0.181",
  "@reckona/mreact-reactive-dom": "^0.0.181",
  "@reckona/mreact-router": "^0.0.181",
  "@reckona/mreact-test-utils": "^0.0.181",
} as const satisfies Record<string, string>;
const currentMreactVersion = internalPackageVersions["@reckona/mreact"].replace(/^\^/, "");
const typescriptVersion = "^6.0.3";
const tailwindVersion = "^4.3.0";
const tailwindCliVersion = "^4.3.0";
const concurrentlyVersion = "^9.2.0";
const nodeTypesVersion = "^25.7.0";
const oxlintVersion = "^1.69.0";
const playwrightVersion = "^1.60.0";
const tsxVersion = "^4.21.0";
const viteVersion = "^8.0.11";
const vitestVersion = "^4.1.8";
const wranglerVersion = "^4.100.0";
const cloudflareWorkersTypesVersion = "^4.20260522.1";
const appRouterGlobalsType = "@reckona/mreact-router/app-router-globals";
const pnpmOnlyBuiltDependencies = ["@parcel/watcher", "esbuild", "sharp", "workerd"] as const;

/** Scaffolds a new mreact app by writing the selected template files into the target directory. */
export async function createMreactApp(
  options: CreateMreactAppOptions,
): Promise<CreateMreactAppResult> {
  const template = options.template ?? "basic";
  const packageManager = options.packageManager ?? "pnpm";
  const name = await inferPackageNameForTarget(options.directory, options.name);
  const workspacePackages = await detectWorkspacePackagesForTarget(options.directory);
  const definition = templateDefinition(
    template,
    name,
    packageManager,
    options.srcDir === true,
    options.deploy,
    workspacePackages,
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

/** Updates known mreact workspace dependencies and records version-gated codemods for an existing app. */
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

  const tsconfigUpdate = await appRouterGlobalsTsconfigUpdate(options.directory, packageJson);
  const codemods = createMreactAppCodemods
    .filter((codemod) => shouldRunCodemod(options.fromVersion, codemod.version, targetVersion))
    .map((codemod) => ({
      applied: options.dryRun !== true,
      description: codemod.description,
      id: codemod.id,
    }));
  const packageJsonChanged = updatedDependencies.length > 0;
  const changed = packageJsonChanged || tsconfigUpdate.changed;

  if (changed && options.dryRun !== true) {
    if (packageJsonChanged) {
      await writeFile(packageJsonPath, json(packageJson));
    }

    if (tsconfigUpdate.changed) {
      await writeFile(tsconfigUpdate.path, json(tsconfigUpdate.config));
    }
  }

  return {
    changed,
    codemods,
    packageJsonPath,
    updatedDependencies,
  };
}

/** Lists the templates supported by `createMreactApp()`. */
export const createMreactAppTemplates = [
  "basic",
  "tailwind",
  "dashboard",
] as const satisfies readonly CreateMreactAppTemplate[];

/** Lists the deployment targets supported by `createMreactApp()`. */
export const createMreactAppDeployTargets = [
  "cloudflare",
  "container",
  "aws-lambda",
] as const satisfies readonly CreateMreactAppDeployTarget[];

/** Lists version-gated codemods reported by `upgradeMreactApp()`. */
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
  {
    description:
      "Check app-router tsconfig global type declarations for Slot, Await, and generated route helpers.",
    id: "0.0.54-app-router-globals",
    version: "0.0.54",
  },
  {
    description:
      "Review generated app-router CSS imports and route stylesheet assumptions after automatic route CSS asset support.",
    id: "0.0.78-route-css-assets",
    version: "0.0.78",
  },
  {
    description:
      "Review AWS Lambda build/package scripts for generated Lambda targets, generated import policy, and minimal asset packaging.",
    id: "0.0.120-aws-lambda-generated-package",
    version: "0.0.120",
  },
  {
    description:
      "Review starter pages that still render static hello content; current basic and Tailwind starters use a small interactive cell counter.",
    id: "0.0.148-interactive-counter-starter",
    version: "0.0.148",
  },
] as const;

/** Names package.json dependency sections that can contain mreact workspace packages. */
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
  workspacePackages: ReadonlySet<string>,
): TemplateDefinition {
  // `cloudflare` is a deploy target, orthogonal to the app-content template.
  const cloudflare = deploy === "cloudflare";

  if (template === "tailwind") {
    return appRouterTemplate(name, packageManager, workspacePackages, {
      cloudflare,
      dashboard: false,
      deploy,
      srcDir,
      tailwind: true,
    });
  }

  if (template === "dashboard") {
    return appRouterTemplate(name, packageManager, workspacePackages, {
      cloudflare,
      dashboard: true,
      deploy,
      srcDir,
      tailwind: true,
    });
  }

  return appRouterTemplate(name, packageManager, workspacePackages, {
    cloudflare,
    dashboard: false,
    deploy,
    srcDir,
    tailwind: false,
  });
}

function appRouterTemplate(
  name: string,
  packageManager: CreateMreactAppPackageManager,
  workspacePackages: ReadonlySet<string>,
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
          "@reckona/mreact": dependencyRange("@reckona/mreact", workspacePackages),
          "@reckona/mreact-reactive-core": dependencyRange(
            "@reckona/mreact-reactive-core",
            workspacePackages,
          ),
          "@reckona/mreact-router": dependencyRange("@reckona/mreact-router", workspacePackages),
          ...(options.tailwind || options.dashboard
            ? {
                "@reckona/mreact-query": dependencyRange(
                  "@reckona/mreact-query",
                  workspacePackages,
                ),
                "@reckona/mreact-reactive-dom": dependencyRange(
                  "@reckona/mreact-reactive-dom",
                  workspacePackages,
                ),
                "@reckona/mreact-test-utils": dependencyRange(
                  "@reckona/mreact-test-utils",
                  workspacePackages,
                ),
              }
            : {}),
          ...(options.dashboard
            ? {
                "@reckona/mreact-auth": dependencyRange("@reckona/mreact-auth", workspacePackages),
                "@reckona/mreact-devtools": dependencyRange(
                  "@reckona/mreact-devtools",
                  workspacePackages,
                ),
              }
            : {}),
        },
        devDependencies: {
          "@playwright/test": playwrightVersion,
          "@types/node": nodeTypesVersion,
          oxlint: oxlintVersion,
          tsx: tsxVersion,
          typescript: typescriptVersion,
          vite: viteVersion,
          vitest: vitestVersion,
          ...(options.tailwind
            ? {
                "@tailwindcss/cli": tailwindCliVersion,
                concurrently: concurrentlyVersion,
                tailwindcss: tailwindVersion,
              }
            : {}),
          ...(options.cloudflare ? { wrangler: wranglerVersion } : {}),
          ...(options.cloudflare
            ? { "@cloudflare/workers-types": cloudflareWorkersTypesVersion }
            : {}),
        },
        ...(packageManager === "pnpm"
          ? { pnpm: { onlyBuiltDependencies: [...pnpmOnlyBuiltDependencies] } }
          : {}),
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
          types: [
            "node",
            "@reckona/mreact-router/app-router-globals",
            ...(options.cloudflare ? ["@cloudflare/workers-types"] : []),
          ],
          skipLibCheck: true,
        },
        include: [
          ...(options.srcDir ? ["src"] : ["app", "src"]),
          "vite.config.ts",
          ...(options.cloudflare ? ["worker-env.d.ts"] : []),
        ],
      }),
    },
    {
      path: "vite.config.ts",
      content: viteConfigSource(paths),
    },
    {
      path: `${paths.routesDir}/layout.tsx`,
      content: layoutSourceForTemplate(options, paths),
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
        path: `${paths.routesDir}/api/login/route.ts`,
        content: dashboardLoginRouteSource,
      },
      {
        path: `${paths.routesDir}/api/logout/route.ts`,
        content: dashboardLogoutRouteSource,
      },
      {
        path: `${paths.routesDir}/middleware.ts`,
        content: dashboardMiddlewareSource,
      },
      {
        path: `${paths.routesDir}/session-store.ts`,
        content: dashboardSessionStoreSource,
      },
      {
        path: "src/devtools.ts",
        content: dashboardDevtoolsSource,
      },
      {
        path: "src/devtools.client.tsx",
        content: dashboardDevtoolsBoundarySource,
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
        path: "wrangler.toml",
        content: wranglerSource(name),
      },
      {
        path: "worker-env.d.ts",
        content: cloudflareWorkerEnvSource,
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
  if (options.dashboard) return dashboardHomePageSource;
  if (options.srcDir) return srcDirPageSource;
  if (options.tailwind) return tailwindPageSource;

  return pageSource;
}

function layoutSourceForTemplate(
  options: { dashboard: boolean; tailwind: boolean },
  paths: { routesDir: string; sourceDir: string },
): string {
  if (options.dashboard) {
    return dashboardLayoutSource(
      paths.routesDir === "src/app" ? "../devtools.client.js" : "../src/devtools.client.js",
    );
  }

  return options.tailwind ? tailwindLayoutSource : layoutSource;
}

function templatePaths(srcDir: boolean): { routesDir: string; sourceDir: string } {
  return srcDir
    ? { routesDir: "src/app", sourceDir: "src" }
    : { routesDir: "app", sourceDir: "app" };
}

function viteConfigSource(paths: { routesDir: string; sourceDir: string }): string {
  return `import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { mreactRouter } from "@reckona/mreact-router/vite";

const projectRoot = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [
    mreactRouter({
      projectRoot,
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
    typecheck: "tsc --noEmit",
    lint: "oxlint . --ignore-pattern .mreact",
    test: "vitest run --passWithNoTests",
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
    const cloudflareBuild = "mreact-router build --target=cloudflare";
    scripts.deploy = "wrangler deploy";
    scripts.dev = `${run} build && wrangler dev`;
    scripts.preview = `${run} build && wrangler dev`;
    scripts.build = options.tailwind
      ? `${run} prepare:css && ${run} build:css && ${cloudflareBuild}`
      : cloudflareBuild;
  }

  if (options.deploy === "aws-lambda") {
    const lambdaBuild = "mreact-router build --target=aws-lambda";
    scripts.build = options.tailwind
      ? `${run} prepare:css && ${run} build:css && ${lambdaBuild}`
      : lambdaBuild;
    scripts["package:lambda"] =
      "mreact-router package aws-lambda --from .mreact --out .lambda --skip-runtime-dependency-check";
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
  const sanitized = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^[._-]+|[._-]+$/g, "")
    .slice(0, 214)
    .replace(/[._-]+$/g, "");

  return sanitized || "mreact-app";
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

async function appRouterGlobalsTsconfigUpdate(
  directory: string,
  packageJson: Record<string, unknown>,
): Promise<{ changed: false } | { changed: true; config: Record<string, unknown>; path: string }> {
  if (!hasDependency(packageJson, "@reckona/mreact-router")) {
    return { changed: false };
  }

  const path = join(directory, "tsconfig.json");
  let source: string;

  try {
    source = await readFile(path, "utf8");
  } catch {
    return { changed: false };
  }

  let config: Record<string, unknown>;

  try {
    config = JSON.parse(source) as Record<string, unknown>;
  } catch {
    return { changed: false };
  }

  const compilerOptions = ensureObjectProperty(config, "compilerOptions");
  const types = compilerOptions.types;

  if (Array.isArray(types)) {
    if (types.includes(appRouterGlobalsType)) {
      return { changed: false };
    }

    types.push(appRouterGlobalsType);
    return { changed: true, config, path };
  }

  compilerOptions.types = [appRouterGlobalsType];
  return { changed: true, config, path };
}

function ensureObjectProperty(
  parent: Record<string, unknown>,
  key: string,
): Record<string, unknown> {
  const value = parent[key];

  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  const next: Record<string, unknown> = {};
  parent[key] = next;
  return next;
}

function hasDependency(packageJson: Record<string, unknown>, name: string): boolean {
  return packageDependencyFields.some((field) => {
    const dependencies = packageJson[field];
    return isDependencyRecord(dependencies) && Object.hasOwn(dependencies, name);
  });
}

async function inferPackageNameForTarget(
  directory: string,
  name: string | undefined,
): Promise<string> {
  if (name !== undefined) {
    return sanitizePackageName(name);
  }

  const targetDirectory = resolve(directory);
  const fallbackName = sanitizePackageName(basename(targetDirectory) || "mreact-app");
  const workspaceRoot = await findPnpmWorkspaceRoot(dirname(targetDirectory));

  if (workspaceRoot === undefined) {
    return fallbackName;
  }

  const workspaceGlobs = await readPnpmWorkspacePackageGlobs(workspaceRoot);
  const relativeTarget = relative(workspaceRoot, targetDirectory).replaceAll("\\", "/");

  if (workspaceGlobs.includes("examples/*") && /^examples\/[^/]+$/.test(relativeTarget)) {
    return `@reckona/example-${fallbackName.replace(/^@[^/]+\//, "")}`;
  }

  return fallbackName;
}

function dependencyRange(
  packageName: keyof typeof internalPackageVersions,
  workspacePackages: ReadonlySet<string>,
): string {
  return workspacePackages.has(packageName) ? "workspace:*" : internalPackageVersions[packageName];
}

async function detectWorkspacePackagesForTarget(directory: string): Promise<ReadonlySet<string>> {
  const workspaceRoot = await findPnpmWorkspaceRoot(dirname(resolve(directory)));

  if (workspaceRoot === undefined) {
    return new Set();
  }

  const workspaceGlobs = await readPnpmWorkspacePackageGlobs(workspaceRoot);
  const packageNames = new Set<string>();

  for (const glob of workspaceGlobs) {
    if (!glob.endsWith("/*")) {
      continue;
    }

    const parent = join(workspaceRoot, glob.slice(0, -2));
    let entries: string[];

    try {
      entries = await readdir(parent);
    } catch {
      continue;
    }

    for (const entry of entries) {
      const packageJsonPath = join(parent, entry, "package.json");

      try {
        const json = JSON.parse(await readFile(packageJsonPath, "utf8")) as { name?: unknown };
        if (typeof json.name === "string" && json.name.startsWith("@reckona/")) {
          packageNames.add(json.name);
        }
      } catch {
        continue;
      }
    }
  }

  return packageNames;
}

async function findPnpmWorkspaceRoot(startDirectory: string): Promise<string | undefined> {
  let current = resolve(startDirectory);

  while (true) {
    try {
      await readFile(join(current, "pnpm-workspace.yaml"), "utf8");
      return current;
    } catch {
      const parent = dirname(current);
      if (parent === current) return undefined;
      current = parent;
    }
  }
}

async function readPnpmWorkspacePackageGlobs(workspaceRoot: string): Promise<string[]> {
  const source = await readFile(join(workspaceRoot, "pnpm-workspace.yaml"), "utf8");
  const globs: string[] = [];

  for (const line of source.split(/\r?\n/)) {
    const match = /^\s*-\s*["']?([^"'\s#]+)["']?/.exec(line);
    if (match?.[1] !== undefined) {
      globs.push(match[1]);
    }
  }

  return globs;
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

function dashboardLayoutSource(devtoolsImport: string): string {
  return `import { DashboardDevtools } from "${devtoolsImport}";

export default function Layout() {
  return (
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="stylesheet" href="/styles.css" />
      </head>
      <body class="bg-slate-950 text-slate-100">
        <Slot />
        <DashboardDevtools />
      </body>
    </html>
  );
}
`;
}

const pageSource = `import { cell } from "@reckona/mreact-reactive-core";

export const metadata = {
  title: "Counter",
};

export default function Page() {
  const count = cell<number>(0);

  return (
    <main>
      <h1>mreact counter</h1>
      <p>
        Count: <strong>{count.get()}</strong>
      </p>
      <p>
        <button type="button" onClick={() => count.set((value) => value + 1)}>
          +1
        </button>{" "}
        <button type="button" onClick={() => count.set(0)}>
          Reset
        </button>
      </p>
    </main>
  );
}
`;

const srcDirPageSource = `import { cell } from "@reckona/mreact-reactive-core";
import { appTitle } from "../lib/app-info.js";

export const metadata = {
  title: "Counter",
};

export default function Page() {
  const count = cell<number>(0);

  return (
    <main>
      <h1>{appTitle}</h1>
      <p>
        Count: <strong>{count.get()}</strong>
      </p>
      <p>
        <button type="button" onClick={() => count.set((value) => value + 1)}>
          +1
        </button>{" "}
        <button type="button" onClick={() => count.set(0)}>
          Reset
        </button>
      </p>
    </main>
  );
}
`;

const appInfoSource = `export const appTitle = "mreact counter";
`;

const cloudflareWorkerEnvSource = `export {};

declare global {
  interface Env {
    ASSETS: Fetcher;
    // Example R2 binding. Uncomment the matching wrangler.toml stanza before use.
    MEDIA?: R2Bucket;
  }
}
`;

const tailwindPageSource = `import { cell } from "@reckona/mreact-reactive-core";

export const metadata = {
  title: "Counter",
};

export default function Page() {
  const count = cell<number>(0);

  return (
    <main class="mx-auto flex min-h-screen max-w-3xl flex-col justify-center gap-5 px-6">
      <p class="text-sm font-medium text-cyan-300">mreact</p>
      <h1 class="text-4xl font-semibold">Counter starter</h1>
      <section class="grid gap-3 rounded-lg border border-slate-800 bg-slate-900 p-5">
        <p class="text-slate-300">
          Count: <strong class="text-white">{count.get()}</strong>
        </p>
        <div class="flex flex-wrap gap-3">
          <button
            type="button"
            class="rounded-md bg-cyan-300 px-4 py-2 font-medium text-slate-950"
            onClick={() => count.set((value) => value + 1)}
          >
            +1
          </button>
          <button
            type="button"
            class="rounded-md border border-slate-700 px-4 py-2 text-slate-100"
            onClick={() => count.set(0)}
          >
            Reset
          </button>
        </div>
      </section>
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
  type QueryKey,
} from "@reckona/mreact-query";
import type { LoaderContext } from "@reckona/mreact-router";
import { sessions, type DashboardSessionData } from "../session-store.js";

export const metadata = {
  title: "Dashboard",
};

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
        <form method="post" action="/api/logout">
          <button class="rounded-md border border-slate-700 px-3 py-2 text-sm text-slate-200" type="submit">
            Sign out
          </button>
        </form>
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

const dashboardLoginPageSource = `export const metadata = {
  title: "Login",
};

export default function Page() {
  return (
    <main class="mx-auto grid min-h-screen max-w-md content-center px-6">
      <form
        class="grid gap-4 rounded-lg border border-slate-800 bg-slate-900 p-6"
        method="post"
        action="/api/login"
      >
        <h1 class="text-2xl font-semibold text-white">Login</h1>
        <p class="text-sm text-slate-300">
          Demo account: <code>demo@example.com</code> / <code>kanban1234</code>
        </p>
        <p class="text-xs text-amber-200">
          Replace these development-only credentials before production.
        </p>
        <label class="grid gap-1 text-sm text-slate-300">
          Email
          <input class="rounded-md border border-slate-700 bg-slate-950 px-3 py-2" name="email" type="email" defaultValue="demo@example.com" required />
        </label>
        <label class="grid gap-1 text-sm text-slate-300">
          Password
          <input class="rounded-md border border-slate-700 bg-slate-950 px-3 py-2" name="password" type="password" defaultValue="kanban1234" required />
        </label>
        <button class="rounded-md bg-cyan-300 px-4 py-2 font-medium text-slate-950" type="submit">
          Continue
        </button>
      </form>
    </main>
  );
}
`;

const dashboardLoginRouteSource = `import { createSession } from "@reckona/mreact-auth";
import { sessions } from "../../session-store.js";

// Development-only demo credentials. Replace this route with your real
// authentication provider before deploying the dashboard starter.
const demoAccount = {
  email: "demo@example.com",
  password: "kanban1234",
  roles: ["admin"],
} as const;

export async function POST(request: Request): Promise<Response> {
  if (process.env.NODE_ENV !== "development" && process.env.NODE_ENV !== "test") {
    return Response.json(
      { ok: false, error: "Development-only demo credentials are disabled outside development." },
      { status: 403 },
    );
  }

  const form = await request.formData();
  const email = String(form.get("email") ?? "");
  const password = String(form.get("password") ?? "");

  if (email !== demoAccount.email || password !== demoAccount.password) {
    return Response.json({ ok: false, error: "Invalid demo credentials." }, { status: 401 });
  }

  const response = new Response(null, {
    status: 303,
    headers: { location: "/dashboard" },
  });
  await createSession(response, sessions, {
    userId: demoAccount.email,
    roles: demoAccount.roles,
  });
  return response;
}
`;

const dashboardLogoutRouteSource = `import { destroySession } from "@reckona/mreact-auth";
import { sessions } from "../../session-store.js";

export async function POST(request: Request): Promise<Response> {
  const response = new Response(null, {
    status: 303,
    headers: { location: "/login" },
  });
  await destroySession(request, response, sessions);
  return response;
}
`;

const dashboardMiddlewareSource = `import { getSession } from "@reckona/mreact-auth";
import { redirect } from "@reckona/mreact-router";
import { sessions } from "./session-store.js";

export const config = { matcher: ["/dashboard/:path*"] };

export async function middleware(request: Request): Promise<Response | undefined> {
  const session = await getSession(request, sessions);
  if (session === undefined) {
    redirect("/login");
  }
  return undefined;
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

const dashboardDevtoolsBoundarySource = `import { effect } from "@reckona/mreact-reactive-core";
import { mountDashboardDevtools } from "./devtools.js";

export function DashboardDevtools() {
  effect(() => {
    void mountDashboardDevtools();
  });

  return null;
}
`;

const tailwindCssSource = `@import "tailwindcss";
`;

const awsLambdaHandlerSource = `import { createPreloadedAwsLambdaRequestHandler } from "@reckona/mreact-router/adapters/aws-lambda";

export const handler = await createPreloadedAwsLambdaRequestHandler({
  outDir: new URL("../.mreact", import.meta.url).pathname,
  importPolicy: "generated",
});
`;

function wranglerSource(name: string): string {
  return `name = "${name}"
main = ".mreact/cloudflare/worker.mjs"
compatibility_date = "2026-05-15"

[assets]
directory = ".mreact/client"
binding = "ASSETS"

# Example R2 binding. Uncomment and replace the bucket name when the app needs R2.
# [[r2_buckets]]
# binding = "MEDIA"
# bucket_name = "${name}-media"
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
ENV HOST=0.0.0.0
ENV MREACT_ROUTER_HOST_POLICY=strict
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
docker run --rm -p 8080:8080 -e HOST=0.0.0.0 -e MREACT_ROUTER_HOST_POLICY=strict -e PORT=8080 mreact-app
\`\`\`

The server reads \`HOST\` and \`PORT\` and defaults to the values provided by
the platform. The Dockerfile sets \`HOST=0.0.0.0\` so published container ports
can reach the Node server and \`MREACT_ROUTER_HOST_POLICY=strict\` so public
containers do not implicitly trust arbitrary Host headers. Set
\`MREACT_ROUTER_ALLOWED_HOSTS\` to your deployed hostnames when your app needs
the public origin for absolute URLs.
The Dockerfile uses Node 24 LTS and runs \`${run} start\`.

## Cloud Run

Cloud Run injects \`PORT\` automatically. The Dockerfile sets \`HOST=0.0.0.0\`,
\`MREACT_ROUTER_HOST_POLICY=strict\`, and \`PORT=8080\` for local runs, which
matches Cloud Run's common default. Build and deploy the image with your
preferred Google Cloud workflow, then route HTTP traffic to the container.

## AWS App Runner

AWS App Runner can use the same image. Configure the service port as \`8080\`
or set \`PORT\` to the value you choose for the service. Use a simple HTTP
health check path such as \`/\`.

## CDN assets

\`.mreact/client\` contains hashed client route assets and copied public assets
at their root paths, with \`.mreact/client/public\` kept as a compatibility
mirror. To serve them from a CDN, upload that directory to your static origin
and configure the router:

\`\`\`ts
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = dirname(fileURLToPath(import.meta.url));

mreactRouter({
  projectRoot,
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

This project includes a generated Lambda handler for API Gateway HTTP API v2 and
Lambda Function URL events. \`src/lambda.ts\` is included as a small custom
handler starting point when you need to add adapter options.

## Build

\`\`\`bash
${run} build
${run} package:lambda
\`\`\`

The generated \`build\` script runs \`mreact-router build --target=aws-lambda\`.
That target emits Node-compatible server/client output, a generated import
policy at \`.mreact/server/import-policy.json\`, and a preloaded Lambda handler
at \`.mreact/aws-lambda/mreact-handler.mjs\`. If you replace the script, use the
same target explicitly:

\`\`\`bash
mreact-router build --target=aws-lambda
${run} package:lambda
\`\`\`

You can also make the target a project default in \`vite.config.ts\`:

\`\`\`ts
mreactRouter({
  buildTargets: ["aws-lambda"],
});
\`\`\`

\`.lambda/mreact-handler.mjs\` exports \`handler\` after \`${run} package:lambda\`.
Package that file together with \`.lambda/.mreact\`, \`package.json\`, and
production \`node_modules\`.

The generated \`package:lambda\` script uses \`--skip-runtime-dependency-check\` because the prepare script below installs production dependencies into \`.lambda/node_modules\` after creating the minimal artifact. Do not deploy the artifact before that install step finishes.

## Minimal deployment artifact

AWS Lambda has a 250 MB unzipped deployment package limit. Do not point CDK, SAM, Serverless Framework, or Terraform at the full project root after a CI install, because that can include source files, tests, dev dependencies, Vite/Vitest/Playwright tooling, and package-manager caches. The mreact runtime only needs the built app output, the Lambda handler bundle, and production runtime dependencies.

The Lambda adapter treats \`outDir\` as read-only. On cold start it materializes generated runtime files under \`/tmp/mreact-router/<hash>/runtime\` and creates a \`node_modules\` symlink back to the deployed package root so server-side imports resolve from the production dependencies. Static middleware \`config.matcher\` / \`config.id\` checks run before middleware module import, and loader redirects settle before page component server transforms for non-stream routes and stream routes without a loading boundary. Pass \`runtimeDir\` to \`createAwsLambdaRequestHandler()\` only if you need a custom writable cache directory.

pnpm's default isolated linker creates a symlink-heavy \`node_modules\` tree. Some Lambda packaging tools dereference those links or count their targets differently, which can make an artifact look small locally but exceed the unzipped limit after packaging. For pnpm Lambda artifacts, install production dependencies into \`.lambda/\` with \`--config.node-linker=hoisted\`, then verify both symlink count and actual file bytes before upload.

\`src/\` is not required at runtime when \`.mreact/server/manifest.json\` is present. Server source needed by the runtime is materialized into the build manifest and server module artifacts during \`${run} build\`.

Recommended artifact layout:

\`\`\`text
.lambda/
  .mreact/
  mreact-handler.mjs
  mreact-lambda-artifact.json
  package.json
  lockfile
  node_modules/
\`\`\`

Create a dedicated asset directory before handing it to CDK/SAM/serverless. Save this as \`scripts/prepare-lambda-asset.sh\` if you want a repeatable deploy step:

\`\`\`bash
#!/usr/bin/env bash
set -euo pipefail

rm -rf .lambda

${run} build
${run} package:lambda
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

Production adapters enforce the app-router import policy when bundling loaders, middleware, route handlers, metadata, and server actions. The build writes \`.mreact/server/import-policy.json\` from server-side static imports, and generated Lambda handlers use \`importPolicy: "generated"\` by default. AWS Lambda request/control artifacts bundle the generated import-policy packages they use for loaders, middleware, route handlers, and metadata, reducing first-hit package resolution on sparse Lambda traffic. Packages listed in the generated import policy may still be needed by render-only modules, inferred server actions, custom handlers, or adapter code, so keep them installed in the production \`node_modules\` copied into the Lambda artifact.

\`\`\`ts
export const handler = await createPreloadedAwsLambdaRequestHandler({
  outDir: new URL("../.mreact", import.meta.url).pathname,
  importPolicy: "generated",
});
\`\`\`

The generated handler uses top-level \`await\` with \`createPreloadedAwsLambdaRequestHandler()\` so the built runtime, middleware, route modules, layouts, and metadata are imported during the Lambda initialization phase instead of racing the first user request. Static middleware matchers, loader redirects, request/control artifacts split from render artifacts, AWS Lambda request/control package bundling, compiled module files, and optional \`hot-route-requests\` preload avoid unnecessary dependency evaluation on unmatched health checks and simple redirects. Add \`timings: true\` while diagnosing production latency to emit \`router:request:timing\` and \`router:render:timing\` debug events for request conversion, render phases, loader wait, source analysis, page module load, page component render, layout module load, layout component render, response construction, and Lambda response conversion. Loader timing splits module load/evaluation from user loader execution with \`loaderModuleLoadMs\` and \`loaderExecutionMs\`; source analysis reports \`sourceAnalysisArtifactMs\` when a built analysis summary is reused; middleware timing similarly splits \`middlewareModuleLoadMs\` and \`middlewareExecutionMs\`.

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
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = dirname(fileURLToPath(import.meta.url));

mreactRouter({
  projectRoot,
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
  const starterNote =
    options.dashboard
      ? ""
      : "\nThe generated home page is a counter starter that uses `cell` for client interactivity.\n";
  const cloudflareNote = options.cloudflare
    ? `
## Cloudflare Workers

The Workers entrypoint is generated at \`.mreact/cloudflare/worker.mjs\`. \`${run} dev\` runs \`${run} build\` first so a fresh scaffold can start with Wrangler, and \`${run} build\` must still be run before \`wrangler deploy\`.

Bindings are declared in \`wrangler.toml\` and typed in \`worker-env.d.ts\`. The scaffold includes a commented R2 example named \`MEDIA\`; uncomment it and replace the bucket name before using \`context.env.MEDIA\` from loaders or route handlers.
`
    : "";
  const deployNote =
    options.deploy === "container"
      ? "\nContainer deploy files are included. See `docs/deploy/container.md`.\n"
      : options.deploy === "aws-lambda"
        ? "\nAWS Lambda deploy files are included. See `docs/deploy/aws-lambda.md`.\n"
        : "";
  const dashboardNote = options.dashboard
    ? "\nThis is the dashboard starter. It includes auth guards, a development-only demo login, query cache hydration, Tailwind styling, and the devtools overlay in development. Demo account: `demo@example.com` / `kanban1234`. Replace these credentials before production; the generated login route enables them only when `NODE_ENV` is `development` or `test`.\n"
    : "";
  const pnpmTroubleshooting =
    packageManager === "pnpm"
      ? `
## Troubleshooting

### pnpm approve-builds warning

pnpm 10 may print an \`Ignored build scripts\` warning for transitive tooling packages such as \`esbuild\`, \`@parcel/watcher\`, \`sharp\`, or \`workerd\`. The generated \`package.json\` includes those packages in \`pnpm.onlyBuiltDependencies\`, so a fresh install or \`pnpm rebuild\` can run the required native build steps. If you add another native dependency, add its package name to \`pnpm.onlyBuiltDependencies\`, then run \`pnpm rebuild <package>\` or reinstall.

### Adding native dependencies

Packages such as \`better-sqlite3\`, \`argon2\`, \`bcrypt\`, \`canvas\`, and \`node-pty\` often use install scripts for native binaries. With pnpm 10, add the package to \`pnpm.onlyBuiltDependencies\` in \`package.json\` before rebuilding or reinstalling so the native binding is actually produced.
`
      : "";

  return `# ${name}

mreact app-router project generated by \`@reckona/create-mreact-app\`.

## Scripts

- \`${run} dev\`
- \`${run} build\`
- \`${run} typecheck\`
- \`${run} lint\`
- \`${run} test\`
- \`${run} start\`
${starterNote}${tailwindNote}${cloudflareNote}${deployNote}${dashboardNote}${pnpmTroubleshooting}`;
}
