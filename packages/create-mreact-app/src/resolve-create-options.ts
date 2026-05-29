import type { CreateMreactAppCreateCliOptions } from "./cli-args.js";
import type {
  CreateMreactAppDeployTarget,
  CreateMreactAppPackageManager,
  CreateMreactAppTemplate,
} from "./index.js";
import { createMreactAppTemplates } from "./index.js";
import { select, text } from "./prompts.js";

interface PromptStreamControls {
  isTTY?: boolean;
  pause?: () => void;
  resume?: () => void;
  setRawMode?: (mode: boolean) => void;
}

type PromptReadable = NodeJS.ReadableStream & PromptStreamControls;
type PromptWritable = NodeJS.WritableStream;

export interface ResolveCreateOptionsContext {
  env?: NodeJS.ProcessEnv | undefined;
  input?: PromptReadable | undefined;
  isTTY?: boolean | undefined;
  output?: PromptWritable | undefined;
}

export interface ResolvedCreateOptions {
  deploy?: CreateMreactAppDeployTarget | undefined;
  directory: string;
  packageManager: CreateMreactAppPackageManager;
  srcDir: boolean;
  template: CreateMreactAppTemplate;
}

const DEFAULT_DIRECTORY = "mreact-app";
const DEFAULT_TEMPLATE: CreateMreactAppTemplate = "app-router";
const DEFAULT_PACKAGE_MANAGER: CreateMreactAppPackageManager = "pnpm";

const PACKAGE_MANAGERS: readonly CreateMreactAppPackageManager[] = ["pnpm", "npm", "bun"];

/** Identify the package manager that invoked us via `npm_config_user_agent`. */
export function detectPackageManager(
  env: NodeJS.ProcessEnv,
): CreateMreactAppPackageManager | undefined {
  const userAgent = env.npm_config_user_agent;
  if (userAgent === undefined) {
    return undefined;
  }

  const name = userAgent.split("/")[0];
  if (name === "pnpm" || name === "npm" || name === "bun") {
    return name;
  }

  return undefined;
}

/**
 * Resolve a complete set of scaffolding options from parsed CLI flags.
 *
 * Non-interactive (non-TTY): every unprovided option falls back to its
 * default. Interactive (TTY): only the unprovided options are prompted for.
 */
export async function resolveCreateOptions(
  parsed: CreateMreactAppCreateCliOptions,
  context: ResolveCreateOptionsContext,
): Promise<ResolvedCreateOptions> {
  const env = context.env ?? process.env;
  const detectedPackageManager = detectPackageManager(env);
  const packageManagerDefault = detectedPackageManager ?? DEFAULT_PACKAGE_MANAGER;

  if (context.isTTY !== true) {
    return {
      deploy: parsed.deploy,
      directory: parsed.directory ?? DEFAULT_DIRECTORY,
      packageManager: parsed.packageManager ?? packageManagerDefault,
      srcDir: parsed.srcDir ?? false,
      template: parsed.template ?? DEFAULT_TEMPLATE,
    };
  }

  const streams = { input: context.input, output: context.output };

  const directory =
    parsed.directory ??
    (await text({ defaultValue: DEFAULT_DIRECTORY, message: "Project directory", ...streams }));

  const template =
    parsed.template ??
    (await select<CreateMreactAppTemplate>({
      choices: createMreactAppTemplates.map((value) => ({ label: value, value })),
      initialIndex: createMreactAppTemplates.indexOf(DEFAULT_TEMPLATE),
      message: "Template",
      ...streams,
    }));

  const packageManager =
    parsed.packageManager ??
    (await select<CreateMreactAppPackageManager>({
      choices: PACKAGE_MANAGERS.map((value) => ({ label: value, value })),
      initialIndex: PACKAGE_MANAGERS.indexOf(packageManagerDefault),
      message: "Package manager",
      ...streams,
    }));

  const srcDir =
    parsed.srcDir ??
    (await select<boolean>({
      choices: [
        { label: "No", value: false },
        { label: "Yes", value: true },
      ],
      message: "Place routes under src/app?",
      ...streams,
    }));

  const deploy =
    parsed.deploy ??
    (await select<CreateMreactAppDeployTarget | undefined>({
      choices: [
        { label: "none", value: undefined },
        { label: "container", value: "container" },
        { label: "aws-lambda", value: "aws-lambda" },
      ],
      message: "Deploy target",
      ...streams,
    }));

  return { deploy, directory, packageManager, srcDir, template };
}
