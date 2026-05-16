import {
  createMreactAppTemplates,
  type CreateMreactAppDeployTarget,
  type CreateMreactAppPackageManager,
  type CreateMreactAppTemplate,
} from "./index.js";

export interface CreateMreactAppCliOptions {
  deploy?: CreateMreactAppDeployTarget | undefined;
  directory: string;
  packageManager: CreateMreactAppPackageManager;
  srcDir: boolean;
  template: CreateMreactAppTemplate;
}

export function parseCreateMreactAppCliArgs(args: readonly string[]): CreateMreactAppCliOptions {
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
    deploy,
    directory: directories[0] ?? "mreact-app",
    packageManager,
    srcDir,
    template,
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
    value === "cloudflare"
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
