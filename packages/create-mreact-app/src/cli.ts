#!/usr/bin/env node

import { resolve } from "node:path";
import { parseCreateMreactAppCliArgs } from "./cli-args.js";
import { createMreactApp } from "./index.js";

try {
  const options = parseCreateMreactAppCliArgs(process.argv.slice(2));
  const result = await createMreactApp({
    deploy: options.deploy,
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
