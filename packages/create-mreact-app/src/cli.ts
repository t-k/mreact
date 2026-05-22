#!/usr/bin/env node

import { resolve } from "node:path";
import {
  createMreactAppHelpText,
  createMreactAppSuccessText,
  parseCreateMreactAppCliArgs,
} from "./cli-args.js";
import { createMreactApp, upgradeMreactApp } from "./index.js";

try {
  const options = parseCreateMreactAppCliArgs(process.argv.slice(2));
  if (options.help === true) {
    console.log(createMreactAppHelpText());
    process.exit(0);
  }

  if (options.command === "upgrade") {
    const result = await upgradeMreactApp({
      directory: resolve(options.directory),
      dryRun: options.dryRun,
      fromVersion: options.fromVersion,
      targetVersion: options.targetVersion,
    });

    console.log(
      result.changed
        ? `Updated ${result.updatedDependencies.length} mreact dependency range(s).`
        : "No mreact dependency ranges needed updating.",
    );
    if (result.codemods.length > 0) {
      console.log(`Codemods: ${result.codemods.map((codemod) => codemod.id).join(", ")}`);
    }
    process.exit(0);
  }

  const result = await createMreactApp({
    deploy: options.deploy,
    directory: resolve(options.directory),
    name: options.directory,
    packageManager: options.packageManager,
    srcDir: options.srcDir,
    template: options.template,
  });

  console.log(
    createMreactAppSuccessText({
      directory: result.directory,
      displayDirectory: options.directory,
      packageManager: result.packageManager,
      template: result.template,
    }),
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
