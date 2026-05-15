#!/usr/bin/env node

import { resolve } from "node:path";
import {
  createMreactApp,
  createMreactAppTemplates,
  type CreateMreactAppPackageManager,
  type CreateMreactAppTemplate,
} from "./index.js";

interface CliOptions {
  directory: string;
  packageManager: CreateMreactAppPackageManager;
  srcDir: boolean;
  template: CreateMreactAppTemplate;
}

try {
  const options = parseArgs(process.argv.slice(2));
  const result = await createMreactApp({
    directory: resolve(options.directory),
    name: options.directory,
    packageManager: options.packageManager,
    srcDir: options.srcDir,
    template: options.template,
  });

  console.log(`Created ${result.template} mreact app in ${result.directory}`);
  console.log(`Next: cd ${options.directory}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

function parseArgs(args: readonly string[]): CliOptions {
  const directory = args.find((arg) => !arg.startsWith("-")) ?? "mreact-app";
  let template: CreateMreactAppTemplate = "app-router";
  let packageManager: CreateMreactAppPackageManager = "pnpm";
  let srcDir = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--template") {
      template = parseTemplate(args[index + 1]);
      index += 1;
      continue;
    }

    if (arg?.startsWith("--template=")) {
      template = parseTemplate(arg.slice("--template=".length));
      continue;
    }

    if (arg === "--pm" || arg === "--package-manager") {
      packageManager = parsePackageManager(args[index + 1]);
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

    if (arg === "--src-dir") {
      srcDir = true;
    }
  }

  return { directory, packageManager, srcDir, template };
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
