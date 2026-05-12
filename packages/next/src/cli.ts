#!/usr/bin/env node

import { resolve } from "node:path";
import {
  formatGeneratedMreactComponents,
  generateMreactComponents,
} from "./index.js";

const rootDir = resolve(process.argv[2] ?? "app");
const generated = await generateMreactComponents({ rootDir });

console.log(formatGeneratedMreactComponents(generated, rootDir));
