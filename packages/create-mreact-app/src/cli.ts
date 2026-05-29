#!/usr/bin/env node

import { runCreateMreactAppCli } from "./run-cli.js";

const isTTY = process.stdin.isTTY === true && process.stdout.isTTY === true;

process.exitCode = await runCreateMreactAppCli(process.argv.slice(2), {
  env: process.env,
  input: process.stdin,
  isTTY,
  output: process.stdout,
});
