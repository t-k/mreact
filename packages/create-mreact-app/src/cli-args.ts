import {
  createMreactAppTemplates,
  type CreateMreactAppDeployTarget,
  type CreateMreactAppPackageManager,
  type CreateMreactAppTemplate,
} from "./index.js";

export interface CreateMreactAppCreateCliOptions {
  command: "create";
  deploy?: CreateMreactAppDeployTarget | undefined;
  directory: string;
  help?: boolean | undefined;
  packageManager: CreateMreactAppPackageManager;
  srcDir: boolean;
  template: CreateMreactAppTemplate;
}

export interface CreateMreactAppUpgradeCliOptions {
  command: "upgrade";
  directory: string;
  dryRun?: boolean | undefined;
  fromVersion?: string | undefined;
  help?: boolean | undefined;
  targetVersion?: string | undefined;
}

export type CreateMreactAppCliOptions =
  | CreateMreactAppCreateCliOptions
  | CreateMreactAppUpgradeCliOptions;

export function parseCreateMreactAppCliArgs(args: readonly string[]): CreateMreactAppCliOptions {
  if (args[0] === "upgrade") {
    return parseUpgradeArgs(args.slice(1));
  }

  const directories: string[] = [];
  let template: CreateMreactAppTemplate = "app-router";
  let packageManager: CreateMreactAppPackageManager = "pnpm";
  let deploy: CreateMreactAppDeployTarget | undefined;
  let srcDir = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--") {
      directories.push(...args.slice(index + 1));
      break;
    }

    if (arg === "--help" || arg === "-h") {
      return {
        command: "create",
        deploy,
        directory: directories[0] ?? "mreact-app",
        help: true,
        packageManager,
        srcDir,
        template,
      };
    }

    if (arg === "--template") {
      template = parseTemplate(readOptionValue(args, index, "template"));
      index += 1;
      continue;
    }

    if (arg?.startsWith("--template=")) {
      template = parseTemplate(arg.slice("--template=".length));
      continue;
    }

    if (arg === "--pm" || arg === "--package-manager") {
      packageManager = parsePackageManager(readOptionValue(args, index, "package manager"));
      index += 1;
      continue;
    }

    if (arg?.startsWith("--pm=")) {
      packageManager = parsePackageManager(arg.slice("--pm=".length));
      continue;
    }

    if (arg?.startsWith("--package-manager=")) {
      packageManager = parsePackageManager(arg.slice("--package-manager=".length));
      continue;
    }

    if (arg === "--deploy") {
      deploy = parseDeployTarget(readOptionValue(args, index, "deploy target"));
      index += 1;
      continue;
    }

    if (arg?.startsWith("--deploy=")) {
      deploy = parseDeployTarget(arg.slice("--deploy=".length));
      continue;
    }

    if (arg === "--src-dir") {
      srcDir = true;
      continue;
    }

    if (arg?.startsWith("-")) {
      throw new Error(`Unknown option ${arg}.`);
    }

    if (arg !== undefined) {
      directories.push(arg);
    }
  }

  if (directories.length > 1) {
    throw new Error(`Expected one target directory, received ${directories.length}.`);
  }

  return {
    command: "create",
    deploy,
    directory: directories[0] ?? "mreact-app",
    packageManager,
    srcDir,
    template,
  };
}

export function createMreactAppHelpText(): string {
  return [
    "Usage:",
    "  create-mreact-app [directory] [options]",
    "  create-mreact-app upgrade [directory] [options]",
    "",
    "Options:",
    `  --template <name>           Template to generate: ${createMreactAppTemplates.join(", ")}. Default: app-router.`,
    "  --pm, --package-manager <pm> Package manager for generated scripts: pnpm, npm, or bun. Default: pnpm.",
    "  --deploy <target>           Add deploy files: container or aws-lambda.",
    "  --src-dir                   Generate routes under src/app instead of app.",
    "  -h, --help                  Show this help message.",
    "",
    "Upgrade options:",
    "  --dry-run                   Report dependency and codemod changes without writing package.json.",
    "  --from <version>            Version the project is upgrading from.",
    "  --to <version>              Target mreact package version. Default: current create-mreact-app version.",
    "",
    "Examples:",
    "  create-mreact-app my-app",
    "  create-mreact-app my-app --template app-router-tailwind --src-dir",
    "  create-mreact-app my-app --deploy container",
    "  create-mreact-app my-app --deploy aws-lambda",
    "  create-mreact-app upgrade --dry-run",
  ].join("\n");
}

export function createMreactAppSuccessText(options: {
  directory: string;
  displayDirectory: string;
  packageManager: CreateMreactAppPackageManager;
  template: CreateMreactAppTemplate;
}): string {
  const installCommand =
    options.packageManager === "npm"
      ? "npm install"
      : options.packageManager === "bun"
        ? "bun install"
        : "pnpm install";
  const devCommand =
    options.packageManager === "npm"
      ? "npm run dev"
      : options.packageManager === "bun"
        ? "bun run dev"
        : "pnpm dev";
  const dashboardNote =
    options.template === "dashboard"
      ? ["", "Demo account:", "  demo@example.com / kanban1234"]
      : [];

  return [
    `Created mreact app in ${options.directory} (template: ${options.template})`,
    "",
    "Next steps:",
    `  cd ${options.displayDirectory}`,
    `  ${installCommand}`,
    `  ${devCommand}`,
    "",
    "Then open http://localhost:3001/.",
    ...dashboardNote,
  ].join("\n");
}

function parseUpgradeArgs(args: readonly string[]): CreateMreactAppUpgradeCliOptions {
  const directories: string[] = [];
  let dryRun = false;
  let fromVersion: string | undefined;
  let targetVersion: string | undefined;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--") {
      directories.push(...args.slice(index + 1));
      break;
    }

    if (arg === "--help" || arg === "-h") {
      return {
        command: "upgrade",
        directory: directories[0] ?? ".",
        dryRun,
        fromVersion,
        help: true,
        targetVersion,
      };
    }

    if (arg === "--dry-run") {
      dryRun = true;
      continue;
    }

    if (arg === "--from") {
      fromVersion = readOptionValue(args, index, "from version");
      index += 1;
      continue;
    }

    if (arg?.startsWith("--from=")) {
      fromVersion = arg.slice("--from=".length);
      continue;
    }

    if (arg === "--to") {
      targetVersion = readOptionValue(args, index, "target version");
      index += 1;
      continue;
    }

    if (arg?.startsWith("--to=")) {
      targetVersion = arg.slice("--to=".length);
      continue;
    }

    if (arg?.startsWith("-")) {
      throw new Error(`Unknown option ${arg}.`);
    }

    if (arg !== undefined) {
      directories.push(arg);
    }
  }

  if (directories.length > 1) {
    throw new Error(`Expected one target directory, received ${directories.length}.`);
  }

  return {
    command: "upgrade",
    directory: directories[0] ?? ".",
    dryRun,
    fromVersion,
    targetVersion,
  };
}

function readOptionValue(args: readonly string[], index: number, name: string): string {
  const value = args[index + 1];

  if (value === undefined || value.startsWith("-")) {
    throw new Error(`Missing value for ${name}.`);
  }

  return value;
}

function parseTemplate(value: string | undefined): CreateMreactAppTemplate {
  if (
    value === "basic" ||
    value === "app-router" ||
    value === "app-router-tailwind" ||
    value === "cloudflare" ||
    value === "dashboard"
  ) {
    return value;
  }

  throw new Error(
    `Unknown template ${JSON.stringify(value)}. Available templates: ${createMreactAppTemplates.join(", ")}`,
  );
}

function parsePackageManager(value: string | undefined): CreateMreactAppPackageManager {
  if (value === "pnpm" || value === "npm" || value === "bun") {
    return value;
  }

  throw new Error(`Unknown package manager ${JSON.stringify(value)}. Use pnpm, npm, or bun.`);
}

function parseDeployTarget(value: string | undefined): CreateMreactAppDeployTarget {
  if (value === "aws-lambda" || value === "container") {
    return value;
  }

  throw new Error(`Unknown deploy target ${JSON.stringify(value)}. Use aws-lambda or container.`);
}
