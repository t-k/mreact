// Shared esbuild bundling + static server for the compat-micro harness.
import { createRequire } from "node:module";
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "node:http";

const here = dirname(fileURLToPath(import.meta.url));
export const worktreeRoot = resolve(here, "..", "..");
const require = createRequire(import.meta.url);

function findEsbuild() {
  const pnpmDir = join(worktreeRoot, "node_modules", ".pnpm");
  const dirs = readdirSync(pnpmDir).filter((d) => d.startsWith("esbuild@")).sort();
  return require(join(pnpmDir, dirs[dirs.length - 1], "node_modules", "esbuild", "lib", "main.js"));
}
export const esbuild = findEsbuild();
export const { chromium } = require("@playwright/test");

const SRC_PKG = {
  "mreact-compat": "react-compat",
  "mreact-reactive-core": "reactive-core",
  "mreact-reactive-dom": "reactive-dom",
  "mreact-shared": "shared",
};
const SUB_OVERRIDE = { "reactive-core": { "runtime-state": "runtime-state-public" } };

const reckonaSrcPlugin = {
  name: "reckona-src",
  setup(build) {
    build.onResolve({ filter: /^@reckona\// }, (args) => {
      const rest = args.path.slice("@reckona/".length);
      const slash = rest.indexOf("/");
      const name = slash === -1 ? rest : rest.slice(0, slash);
      let sub = slash === -1 ? "index" : rest.slice(slash + 1);
      const dir = SRC_PKG[name];
      if (!dir) return null;
      sub = SUB_OVERRIDE[dir]?.[sub] ?? sub;
      return { path: join(worktreeRoot, "packages", dir, "src", `${sub}.ts`) };
    });
  },
};

const ENTRY_BY_FRAMEWORK = {
  react: "entry-react.ts",
  mreact: "entry-mreact.ts",
  "mreact-reactive": "entry-mreact-reactive.ts",
};

export async function build(framework, { sourcemap = false } = {}) {
  const distDir = join(here, "dist");
  mkdirSync(distDir, { recursive: true });
  const entry = join(here, ENTRY_BY_FRAMEWORK[framework] ?? "entry-mreact.ts");
  const usesLocalSrc = framework.startsWith("mreact");
  const outfile = join(distDir, `${framework}.js`);
  await esbuild.build({
    entryPoints: [entry],
    bundle: true,
    minify: true, // real prod build; sourcemap lets the profiler recover names
    format: "esm",
    platform: "browser",
    target: "es2022",
    outfile,
    sourcemap: sourcemap ? "linked" : false,
    define: { "process.env.NODE_ENV": '"production"', __DEV__: "false" },
    external: framework === "react" ? ["react", "react-dom", "react-dom/client"] : [],
    plugins: usesLocalSrc ? [reckonaSrcPlugin] : [],
    legalComments: "none",
    logLevel: "warning",
  });
  const html = readFileSync(join(here, "index.html"), "utf8").replace("./BUNDLE.js", `./${framework}.js`);
  const importmap = framework === "react"
    ? `<script type="importmap">${JSON.stringify({
        imports: {
          react: "https://esm.sh/react@19.2.0",
          "react-dom": "https://esm.sh/react-dom@19.2.0",
          "react-dom/client": "https://esm.sh/react-dom@19.2.0/client",
        },
      })}</script>`
    : "";
  writeFileSync(join(distDir, `${framework}.html`), html.replace("</head>", `${importmap}</head>`));
  return { outfile, distDir, html: join(distDir, `${framework}.html`), size: Math.round(readFileSync(outfile).length / 1024 * 10) / 10 };
}

const MIME = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".map": "application/json" };
export function serve(distDir) {
  return new Promise((resolvePromise) => {
    const server = createServer((req, res) => {
      const urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
      const file = join(distDir, urlPath === "/" ? "index.html" : urlPath);
      if (!existsSync(file)) { res.writeHead(404); res.end("not found"); return; }
      const ext = file.slice(file.lastIndexOf("."));
      res.writeHead(200, { "content-type": MIME[ext] || "application/octet-stream" });
      res.end(readFileSync(file));
    });
    server.listen(0, "127.0.0.1", () => resolvePromise(server));
  });
}
