import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createServer } from "vite";
import { describe, expect, test } from "vitest";
import {
  Fragment,
  createElement,
  useState,
  version,
} from "../src/index.js";
import { jsx, jsxs } from "../src/jsx-runtime.js";
import { jsxDEV } from "../src/jsx-dev-runtime.js";
import * as esmReact from "../src/index.js";
import * as esmJsxRuntime from "../src/jsx-runtime.js";
import * as esmJsxDevRuntime from "../src/jsx-dev-runtime.js";

const require = createRequire(import.meta.url);

describe("react drop-in entrypoint", () => {
  test("keeps CommonJS wrapper exports in parity with the ESM runtime surfaces", () => {
    const cjsReact = require("../index.cjs") as Record<string, unknown>;
    const cjsJsxRuntime = require("../jsx-runtime.cjs") as Record<string, unknown>;
    const cjsJsxDevRuntime = require("../jsx-dev-runtime.cjs") as Record<string, unknown>;

    expect(Object.keys(cjsReact).sort()).toEqual(Object.keys(esmReact).sort());
    expect(Object.keys(cjsJsxRuntime).sort()).toEqual(Object.keys(esmJsxRuntime).sort());
    expect(Object.keys(cjsJsxDevRuntime).sort()).toEqual(Object.keys(esmJsxDevRuntime).sort());
  });

  test("exports React-compatible core and JSX runtime shape", () => {
    expect(createElement("span", null, "Ada").type).toBe("span");
    expect(Fragment).toBeDefined();
    expect(useState).toBeTypeOf("function");
    expect(version).toBeTypeOf("string");
    expect(jsx("span", { children: "Ada" }).type).toBe("span");
    expect(jsxs("div", { children: [jsx("span", { children: "A" })] }).type).toBe("div");
    expect(jsxDEV("button", { children: "Save" }, undefined, false, undefined, undefined).type)
      .toBe("button");
  });

  test("exposes named APIs through CommonJS wrappers imported as ESM namespaces", async () => {
    const directory = mkdtempSync(join(tmpdir(), "mreact-rehackt-namespace-"));

    try {
      mkdirSync(join(directory, "node_modules", "rehackt"), { recursive: true });
      symlinkSync(resolve("packages/react"), join(directory, "node_modules", "react"), "dir");
      writeFileSync(
        join(directory, "node_modules", "rehackt", "package.json"),
        JSON.stringify({ name: "rehackt", version: "0.0.0", main: "index.js" }),
      );
      writeFileSync(
        join(directory, "node_modules", "rehackt", "index.js"),
        `
"use strict";
if (0) {
  module.exports = require("react");
}
Object.assign(module.exports, require("react"));
`,
      );
      writeFileSync(
        join(directory, "check.mjs"),
        `
import * as ReactFromRehackt from "rehackt";
import ReactDefaultFromRehackt from "rehackt";

if (typeof ReactFromRehackt.createContext !== "function") {
  throw new Error("missing namespace createContext");
}

if (typeof ReactDefaultFromRehackt.createContext !== "function") {
  throw new Error("missing default createContext");
}
`,
      );

      await import(`${pathToFileURL(join(directory, "check.mjs")).href}?${Date.now()}`);
    } finally {
      rmSync(directory, { force: true, recursive: true });
    }
  });

  test("exposes named APIs through Vite SSR namespace imports of CommonJS wrappers", async () => {
    const directory = mkdtempSync(join(tmpdir(), "mreact-vite-rehackt-"));

    try {
      mkdirSync(join(directory, "node_modules", "rehackt"), { recursive: true });
      symlinkSync(resolve("packages/react"), join(directory, "node_modules", "react"), "dir");
      writeFileSync(
        join(directory, "node_modules", "rehackt", "package.json"),
        JSON.stringify({ name: "rehackt", version: "0.0.0", main: "index.js" }),
      );
      writeFileSync(
        join(directory, "node_modules", "rehackt", "index.js"),
        `
"use strict";
if (0) {
  module.exports = require("react");
}
Object.assign(module.exports, require("react"));
`,
      );
      writeFileSync(
        join(directory, "entry.ts"),
        `
import * as ReactFromRehackt from "rehackt";
import ReactDefaultFromRehackt from "rehackt";

export const namespaceCreateContext = typeof ReactFromRehackt.createContext;
export const defaultCreateContext = typeof ReactDefaultFromRehackt.createContext;
`,
      );

      const server = await createServer({
        appType: "custom",
        configFile: false,
        root: directory,
        server: { middlewareMode: true },
      });

      try {
        const loaded = await server.ssrLoadModule("/entry.ts") as {
          namespaceCreateContext: string;
          defaultCreateContext: string;
        };

        expect(loaded.namespaceCreateContext).toBe("function");
        expect(loaded.defaultCreateContext).toBe("function");
      } finally {
        await server.close();
      }
    } finally {
      rmSync(directory, { force: true, recursive: true });
    }
  });
});
