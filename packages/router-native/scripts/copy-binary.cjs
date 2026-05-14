"use strict";

const { copyFileSync, existsSync } = require("node:fs");
const { join } = require("node:path");

const candidates = [
  "libmreact_router_native.so",
  "libmreact_router_native.dylib",
  "mreact_router_native.dll",
].map((name) => join(__dirname, "..", "target", "release", name));
const source = candidates.find((candidate) => existsSync(candidate));

if (source === undefined) {
  throw new Error(`Native addon binary was not found. Checked: ${candidates.join(", ")}`);
}

copyFileSync(source, join(__dirname, "..", "index.node"));
