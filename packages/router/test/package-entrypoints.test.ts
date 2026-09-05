import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as ts from "@typescript/typescript6";
import { describe, expect, test } from "vitest";
import { build as viteBuild, type Rollup } from "vite";

const packageEntrypointTypeCheckTimeoutMs = 30_000;

describe("router package entrypoints", () => {
  test("exposes stable session and native escape subpaths for workspace integrations", async () => {
    const manifest = JSON.parse(
      await readFile(join(process.cwd(), "packages", "router", "package.json"), "utf8"),
    ) as { exports?: Record<string, unknown> };

    expect(manifest.exports).toHaveProperty("./session");
    expect(manifest.exports).toHaveProperty("./native-escape");
    expect(manifest.exports).toHaveProperty("./request");
  });

  test("bundles the request entrypoint without router build or dev toolchain code", async () => {
    const result = await viteBuild({
      build: {
        lib: {
          entry: join(process.cwd(), "packages", "router", "src", "request.ts"),
          formats: ["es"],
        },
        minify: false,
        rollupOptions: { treeshake: true },
        write: false,
      },
      configFile: false,
      logLevel: "silent",
    });
    const outputs = Array.isArray(result)
      ? result
      : "output" in result
        ? [result]
        : (() => {
            throw new Error("Vite unexpectedly returned a build watcher");
          })();
    const code = outputs
      .flatMap((output) => output.output)
      .filter((output): output is Rollup.OutputChunk => output.type === "chunk")
      .map((chunk) => chunk.code)
      .join("\n");

    expect(code).not.toContain("createDevServer");
    expect(code).not.toContain("buildApp");
    expect(code).not.toContain("createViteServer");
  });

  test("evaluates only request-plane modules through the public request specifier", () => {
    const directory = mkdtempSync(join(tmpdir(), "mreact-request-module-graph-"));
    const packageScopeDirectory = join(directory, "node_modules", "@reckona");
    mkdirSync(packageScopeDirectory, { recursive: true });
    symlinkSync(
      join(process.cwd(), "packages", "router"),
      join(packageScopeDirectory, "mreact-router"),
      process.platform === "win32" ? "junction" : "dir",
    );
    const bootstrap = join(directory, "bootstrap.mjs");
    const loader = join(directory, "loader.mjs");
    const runner = join(directory, "runner.mjs");
    const log = join(directory, "evaluated.jsonl");
    writeFileSync(
      bootstrap,
      `import { register } from "node:module";
register(new URL("./loader.mjs", import.meta.url), { data: { log: ${JSON.stringify(log)} } });
`,
    );
    writeFileSync(
      loader,
      `import { appendFile } from "node:fs/promises";
let log;
export function initialize(data) { log = data.log; }
export async function load(url, context, nextLoad) {
  if (url.startsWith("file:")) await appendFile(log, JSON.stringify(url) + "\\n");
  return nextLoad(url, context);
}
`,
    );
    writeFileSync(runner, 'await import("@reckona/mreact-router/request");\n');

    try {
      execFileSync(process.execPath, ["--import", bootstrap, runner], {
        cwd: process.cwd(),
        env: { ...process.env, NODE_ENV: "production" },
        stdio: "pipe",
      });
      const evaluated = readFileSync(log, "utf8")
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line) as string);
      const routerModules = evaluated
        .filter((url) => url.includes("/packages/router/dist/"))
        .map((url) =>
          url.slice(url.indexOf("/packages/router/dist/") + "/packages/router/dist/".length),
        )
        .sort();

      expect(routerModules).toEqual([
        "cache.js",
        "cookies.js",
        "csp.js",
        "deferred.js",
        "navigation.js",
        "request.js",
      ]);
      expect(evaluated.join("\n")).not.toMatch(
        /mreact-compiler|\/vite\/|\/build\.js|\/dev-server\.js|\/module-runner\.js|\/bundle-pipeline\.js|\/render\.js|\/serve\.js|\/client\.js/,
      );
    } finally {
      rmSync(directory, { force: true, recursive: true });
    }
  });

  test("exports every public type referenced by request helper signatures", async () => {
    const source = await readFile(
      join(process.cwd(), "packages", "router", "src", "request.ts"),
      "utf8",
    );

    for (const name of [
      "AppRouterCache",
      "AppRouterCacheEntry",
      "CacheControlOptions",
      "CookieOptions",
      "MemoryRouteCacheOptions",
      "MiddlewareNext",
      "RedirectOptions",
      "RequestCookies",
    ]) {
      expect(source).toContain(name);
    }
  });

  test("exposes app-router global types for Slot layouts", async () => {
    const manifest = JSON.parse(
      await readFile(join(process.cwd(), "packages", "router", "package.json"), "utf8"),
    ) as { exports?: Record<string, unknown> };

    expect(manifest.exports).toHaveProperty("./app-router-globals");
  });

  test(
    "app-router global types include Await for shared stream components",
    () => {
      const directory = mkdtempSync(join(process.cwd(), "node_modules", ".tmp-mreact-types-"));
      const filename = join(directory, "Shared.tsx");

      writeFileSync(
        filename,
        `
export function Shared(props: { name: Promise<string> }) {
  return (
    <Await value={props.name} placeholder={<em>loading</em>}>
      {(value) => <strong>{value.toUpperCase()}</strong>}
    </Await>
  );
}
`,
      );

      try {
        const program = ts.createProgram({
          rootNames: [
            filename,
            join(process.cwd(), "packages", "router", "src", "app-router-globals.ts"),
          ],
          options: {
            baseUrl: process.cwd(),
            jsx: ts.JsxEmit.ReactJSX,
            jsxImportSource: "@reckona/mreact-compat",
            ignoreDeprecations: "6.0",
            module: ts.ModuleKind.ESNext,
            moduleResolution: ts.ModuleResolutionKind.Bundler,
            noEmit: true,
            paths: {
              "@reckona/mreact-compat": ["packages/react-compat/src/index.ts"],
              "@reckona/mreact-compat/jsx-runtime": ["packages/react-compat/src/jsx-runtime.ts"],
              "@reckona/mreact-compat/jsx-dev-runtime": [
                "packages/react-compat/src/jsx-dev-runtime.ts",
              ],
            },
            strict: true,
            target: ts.ScriptTarget.ES2022,
            types: [],
          },
        });
        const diagnostics = ts
          .getPreEmitDiagnostics(program)
          .map((diagnostic) => flattenDiagnostic(diagnostic));

        expect(diagnostics).toEqual([]);
      } finally {
        rmSync(directory, { force: true, recursive: true });
      }
    },
    packageEntrypointTypeCheckTimeoutMs,
  );

  test(
    "public entrypoint infers route loader data",
    () => {
      const directory = mkdtempSync(join(process.cwd(), "node_modules", ".tmp-mreact-types-"));
      const filename = join(directory, "route-loader-data.ts");

      writeFileSync(
        filename,
        `
import type { InferLoaderData } from "@reckona/mreact-router";

async function loader(context: { params: { id: string } }) {
  return { count: Number(context.params.id), name: "Ada" };
}

type LoaderData = InferLoaderData<typeof loader>;

const data: LoaderData = { count: 2, name: "Grace" };
data.count.toFixed();
data.name.toUpperCase();
// @ts-expect-error count is inferred as number.
data.count.toUpperCase();
`,
      );

      try {
        const program = ts.createProgram({
          rootNames: [filename, join(process.cwd(), "packages", "router", "src", "index.ts")],
          options: {
            baseUrl: process.cwd(),
            ignoreDeprecations: "6.0",
            module: ts.ModuleKind.ESNext,
            moduleResolution: ts.ModuleResolutionKind.Bundler,
            noEmit: true,
            paths: {
              "@reckona/mreact-router": ["packages/router/src/index.ts"],
              "@reckona/mreact-compiler": ["packages/compiler/src/index.ts"],
              "@reckona/mreact-devtools": ["packages/devtools/src/index.ts"],
              "@reckona/mreact-query": ["packages/query/src/index.ts"],
              "@reckona/mreact-reactive-core": ["packages/reactive-core/src/index.ts"],
              "@reckona/mreact-reactive-core/runtime-state": [
                "packages/reactive-core/src/runtime-state-public.ts",
              ],
              "@reckona/mreact-server": ["packages/server/src/index.ts"],
              "@reckona/mreact-shared": ["packages/shared/src/index.ts"],
            },
            strict: true,
            target: ts.ScriptTarget.ES2022,
            types: ["node"],
          },
        });
        const diagnostics = ts
          .getPreEmitDiagnostics(program)
          .map((diagnostic) => flattenDiagnostic(diagnostic));

        expect(diagnostics).toEqual([]);
      } finally {
        rmSync(directory, { force: true, recursive: true });
      }
    },
    packageEntrypointTypeCheckTimeoutMs,
  );

  test(
    "public entrypoint infers page props from route loader data",
    () => {
      const directory = mkdtempSync(join(process.cwd(), "node_modules", ".tmp-mreact-page-types-"));
      const filename = join(directory, "route-page-data.ts");

      writeFileSync(
        filename,
        `
import { definePage, type LoaderContext } from "@reckona/mreact-router";

interface UserData {
  id: string;
  name: string;
  joinedAt: string;
}

export async function loader(context: LoaderContext<{ id: string }>): Promise<UserData> {
  return {
    id: context.params.id,
    name: "Ada",
    joinedAt: "1843-01-01",
  };
}

export default definePage<typeof loader>(function Page(props) {
  props.data.name.toUpperCase();
  props.data.joinedAt.toUpperCase();
  props.params.id.toUpperCase();
  // @ts-expect-error data.id is inferred as string.
  props.data.id.toFixed();
  // @ts-expect-error params are inferred from the loader context.
  props.params.slug;
  return props.data.name;
});
`,
      );

      try {
        const program = ts.createProgram({
          rootNames: [filename, join(process.cwd(), "packages", "router", "src", "index.ts")],
          options: {
            baseUrl: process.cwd(),
            ignoreDeprecations: "6.0",
            module: ts.ModuleKind.ESNext,
            moduleResolution: ts.ModuleResolutionKind.Bundler,
            noEmit: true,
            paths: {
              "@reckona/mreact-router": ["packages/router/src/index.ts"],
              "@reckona/mreact-compat": ["packages/react-compat/src/index.ts"],
              "@reckona/mreact-compiler": ["packages/compiler/src/index.ts"],
              "@reckona/mreact-devtools": ["packages/devtools/src/index.ts"],
              "@reckona/mreact-query": ["packages/query/src/index.ts"],
              "@reckona/mreact-reactive-core": ["packages/reactive-core/src/index.ts"],
              "@reckona/mreact-reactive-core/runtime-state": [
                "packages/reactive-core/src/runtime-state-public.ts",
              ],
              "@reckona/mreact-server": ["packages/server/src/index.ts"],
              "@reckona/mreact-shared": ["packages/shared/src/index.ts"],
            },
            strict: true,
            target: ts.ScriptTarget.ES2022,
            types: ["node"],
          },
        });
        const diagnostics = ts
          .getPreEmitDiagnostics(program)
          .map((diagnostic) => flattenDiagnostic(diagnostic));

        expect(diagnostics).toEqual([]);
      } finally {
        rmSync(directory, { force: true, recursive: true });
      }
    },
    packageEntrypointTypeCheckTimeoutMs,
  );

  test(
    "public entrypoint exports throwNotFound as a never-returning helper",
    () => {
      const directory = mkdtempSync(
        join(process.cwd(), "node_modules", ".tmp-mreact-not-found-types-"),
      );
      const filename = join(directory, "throw-not-found.ts");

      writeFileSync(
        filename,
        `
import { throwNotFound } from "@reckona/mreact-router";

const value: never = throwNotFound();
`,
      );

      try {
        const program = ts.createProgram({
          rootNames: [filename, join(process.cwd(), "packages", "router", "src", "index.ts")],
          options: {
            baseUrl: process.cwd(),
            ignoreDeprecations: "6.0",
            module: ts.ModuleKind.ESNext,
            moduleResolution: ts.ModuleResolutionKind.Bundler,
            noEmit: true,
            paths: {
              "@reckona/mreact-router": ["packages/router/src/index.ts"],
              "@reckona/mreact-compat": ["packages/react-compat/src/index.ts"],
              "@reckona/mreact-compiler": ["packages/compiler/src/index.ts"],
              "@reckona/mreact-devtools": ["packages/devtools/src/index.ts"],
              "@reckona/mreact-query": ["packages/query/src/index.ts"],
              "@reckona/mreact-reactive-core": ["packages/reactive-core/src/index.ts"],
              "@reckona/mreact-reactive-core/runtime-state": [
                "packages/reactive-core/src/runtime-state-public.ts",
              ],
              "@reckona/mreact-server": ["packages/server/src/index.ts"],
              "@reckona/mreact-shared": ["packages/shared/src/index.ts"],
            },
            strict: true,
            target: ts.ScriptTarget.ES2022,
            types: ["node"],
          },
        });
        const diagnostics = ts
          .getPreEmitDiagnostics(program)
          .map((diagnostic) => flattenDiagnostic(diagnostic));

        expect(diagnostics).toEqual([]);
      } finally {
        rmSync(directory, { force: true, recursive: true });
      }
    },
    packageEntrypointTypeCheckTimeoutMs,
  );

  test(
    "public entrypoint exposes typed route href helpers",
    () => {
      const directory = mkdtempSync(join(process.cwd(), "node_modules", ".tmp-mreact-href-types-"));
      const filename = join(directory, "typed-href.ts");

      writeFileSync(
        filename,
        `
import { href } from "@reckona/mreact-router";

const user = href("/users/:id", { params: { id: "ada" } });
const files = href("/users/:id/files/:...path", { params: { id: "ada", path: ["notes", "day 1"] } });
const search = href("/search", { search: { q: "compiler", page: 2, exact: true } });
user.toUpperCase();
files.toUpperCase();
search.toUpperCase();

// @ts-expect-error dynamic route params are required.
href("/users/:id");
// @ts-expect-error unknown params are rejected.
href("/users/:id", { params: { slug: "ada" } });
// @ts-expect-error catch-all params must be arrays.
href("/files/:...path", { params: { path: "notes" } });
// @ts-expect-error href only accepts internal route paths.
href("https://example.test/users/:id", { params: { id: "ada" } });
`,
      );

      try {
        const program = ts.createProgram({
          rootNames: [filename, join(process.cwd(), "packages", "router", "src", "index.ts")],
          options: {
            baseUrl: process.cwd(),
            ignoreDeprecations: "6.0",
            module: ts.ModuleKind.ESNext,
            moduleResolution: ts.ModuleResolutionKind.Bundler,
            noEmit: true,
            paths: {
              "@reckona/mreact-router": ["packages/router/src/index.ts"],
              "@reckona/mreact-compat": ["packages/react-compat/src/index.ts"],
              "@reckona/mreact-compiler": ["packages/compiler/src/index.ts"],
              "@reckona/mreact-devtools": ["packages/devtools/src/index.ts"],
              "@reckona/mreact-query": ["packages/query/src/index.ts"],
              "@reckona/mreact-reactive-core": ["packages/reactive-core/src/index.ts"],
              "@reckona/mreact-reactive-core/runtime-state": [
                "packages/reactive-core/src/runtime-state-public.ts",
              ],
              "@reckona/mreact-server": ["packages/server/src/index.ts"],
              "@reckona/mreact-shared": ["packages/shared/src/index.ts"],
            },
            strict: true,
            target: ts.ScriptTarget.ES2022,
            types: ["node"],
          },
        });
        const diagnostics = ts
          .getPreEmitDiagnostics(program)
          .map((diagnostic) => flattenDiagnostic(diagnostic));

        expect(diagnostics).toEqual([]);
      } finally {
        rmSync(directory, { force: true, recursive: true });
      }
    },
    packageEntrypointTypeCheckTimeoutMs,
  );

  test(
    "link subpath exports Link as a valid mreact JSX component",
    () => {
      const directory = mkdtempSync(join(process.cwd(), "node_modules", ".tmp-mreact-types-"));
      const filename = join(directory, "link-jsx.tsx");

      writeFileSync(
        filename,
        `
import { Link } from "@reckona/mreact-router/link";

export function Navigation() {
  return <Link href="/docs" prefetch="viewport"><span>Docs</span></Link>;
}
`,
      );

      try {
        const program = ts.createProgram({
          rootNames: [filename, join(process.cwd(), "packages", "router", "src", "link.ts")],
          options: {
            baseUrl: process.cwd(),
            jsx: ts.JsxEmit.ReactJSX,
            jsxImportSource: "@reckona/mreact",
            ignoreDeprecations: "6.0",
            module: ts.ModuleKind.ESNext,
            moduleResolution: ts.ModuleResolutionKind.Bundler,
            noEmit: true,
            paths: {
              "@reckona/mreact": ["packages/react/src/index.ts"],
              "@reckona/mreact/jsx-runtime": ["packages/react/src/jsx-runtime.ts"],
              "@reckona/mreact/jsx-dev-runtime": ["packages/react/src/jsx-dev-runtime.ts"],
              "@reckona/mreact-compat": ["packages/react-compat/src/index.ts"],
              "@reckona/mreact-compat/jsx-runtime": ["packages/react-compat/src/jsx-runtime.ts"],
              "@reckona/mreact-compat/jsx-dev-runtime": [
                "packages/react-compat/src/jsx-dev-runtime.ts",
              ],
              "@reckona/mreact-router/link": ["packages/router/src/link.ts"],
              "@reckona/mreact-shared/compiler-contract": [
                "packages/shared/src/compiler-contract.ts",
              ],
              "@reckona/mreact-shared/html-escape": ["packages/shared/src/html-escape.ts"],
              "@reckona/mreact-shared/url-safety": ["packages/shared/src/url-safety.ts"],
            },
            strict: true,
            target: ts.ScriptTarget.ES2022,
            types: [],
          },
        });
        const diagnostics = ts
          .getPreEmitDiagnostics(program)
          .map((diagnostic) => flattenDiagnostic(diagnostic));

        expect(diagnostics).toEqual([]);
      } finally {
        rmSync(directory, { force: true, recursive: true });
      }
    },
    packageEntrypointTypeCheckTimeoutMs,
  );

  test(
    "public entrypoint exposes app-router route and children types",
    () => {
      const directory = mkdtempSync(join(process.cwd(), "node_modules", ".tmp-mreact-types-"));
      const filename = join(directory, "route-public-types.ts");

      writeFileSync(
        filename,
        `
import type {
  LayoutProps,
  LoaderContext,
  MReactNode,
  PageProps,
  RouteLocation,
  RouteHandlerContext,
} from "@reckona/mreact-router";

async function loader(context: LoaderContext<{ id: string }>) {
  context.request.headers.get("accept");
  context.params.id.toUpperCase();
  return { name: "Ada" };
}

type Data = Awaited<ReturnType<typeof loader>>;

const pageProps: PageProps<Data, { id: string }> = {
  data: { name: "Ada" },
  params: { id: "1" },
  request: {
    url: "https://app.test/users/1?tab=profile#bio",
    pathname: "/users/1",
    search: "?tab=profile",
    hash: "#bio",
  } satisfies RouteLocation,
};
pageProps.data.name.toUpperCase();
pageProps.request.search;
// @ts-expect-error Shared route props do not expose server-only Request headers.
pageProps.request.headers;

const layoutProps: LayoutProps<{ id: string }> = {
  children: "body" satisfies MReactNode,
  params: { id: "1" },
  request: {
    url: "https://app.test/users/1",
    pathname: "/users/1",
    search: "",
    hash: "",
  },
};
layoutProps.children;

const routeHandlerContext: RouteHandlerContext<{ id: string }> = {
  params: { id: "1" },
  request: new Request("https://app.test/users/1"),
};
routeHandlerContext.params.id.toUpperCase();
`,
      );

      try {
        const program = ts.createProgram({
          rootNames: [filename, join(process.cwd(), "packages", "router", "src", "index.ts")],
          options: {
            baseUrl: process.cwd(),
            ignoreDeprecations: "6.0",
            module: ts.ModuleKind.ESNext,
            moduleResolution: ts.ModuleResolutionKind.Bundler,
            noEmit: true,
            paths: {
              "@reckona/mreact-router": ["packages/router/src/index.ts"],
              "@reckona/mreact-compat": ["packages/react-compat/src/index.ts"],
              "@reckona/mreact-compiler": ["packages/compiler/src/index.ts"],
              "@reckona/mreact-devtools": ["packages/devtools/src/index.ts"],
              "@reckona/mreact-query": ["packages/query/src/index.ts"],
              "@reckona/mreact-reactive-core": ["packages/reactive-core/src/index.ts"],
              "@reckona/mreact-reactive-core/runtime-state": [
                "packages/reactive-core/src/runtime-state-public.ts",
              ],
              "@reckona/mreact-server": ["packages/server/src/index.ts"],
              "@reckona/mreact-shared": ["packages/shared/src/index.ts"],
            },
            strict: true,
            target: ts.ScriptTarget.ES2022,
            types: ["node"],
          },
        });
        const diagnostics = ts
          .getPreEmitDiagnostics(program)
          .map((diagnostic) => flattenDiagnostic(diagnostic));

        expect(diagnostics).toEqual([]);
      } finally {
        rmSync(directory, { force: true, recursive: true });
      }
    },
    packageEntrypointTypeCheckTimeoutMs,
  );

  test("exposes modular client helper subpaths", async () => {
    const manifest = JSON.parse(
      await readFile(join(process.cwd(), "packages", "router", "package.json"), "utf8"),
    ) as { exports?: Record<string, unknown> };

    expect(manifest.exports).toHaveProperty("./link");
    expect(manifest.exports).toHaveProperty("./navigation-state");
  });

  test("declares the JSX runtime package used by Cloudflare route builds", async () => {
    const manifest = JSON.parse(
      await readFile(join(process.cwd(), "packages", "router", "package.json"), "utf8"),
    ) as { dependencies?: Record<string, unknown> };

    expect(manifest.dependencies).toHaveProperty("@reckona/mreact");
  });

  test("declares reactive-core used by dev client route bundles", async () => {
    const manifest = JSON.parse(
      await readFile(join(process.cwd(), "packages", "router", "package.json"), "utf8"),
    ) as { dependencies?: Record<string, unknown> };

    expect(manifest.dependencies).toHaveProperty("@reckona/mreact-reactive-core");
  });

  test("declares reactive-dom used by compiled client route dependencies", async () => {
    const manifest = JSON.parse(
      await readFile(join(process.cwd(), "packages", "router", "package.json"), "utf8"),
    ) as { dependencies?: Record<string, unknown> };

    expect(manifest.dependencies).toHaveProperty("@reckona/mreact-reactive-dom");
  });

  test(
    "public entrypoint exports prepared form action reference type",
    () => {
      const directory = mkdtempSync(
        join(process.cwd(), "node_modules", ".tmp-mreact-form-action-types-"),
      );
      const filename = join(directory, "form-action-reference.ts");

      writeFileSync(
        filename,
        `
import type {
  AppRouterProjectOptions,
  AppRouterRenderPreload,
  BuiltPrerenderedRoute,
  BuiltServerModuleArtifact,
  ClientRouteInferenceCache,
  LinkSinkProps,
  MemoryPrerenderStoreEntry,
  MiddlewareNext,
  PreparedFormActionReference,
  RedirectOptions,
  RequestCookies,
  RenderAppRequestOptions,
  ResponseSinkStrategy,
  RouteMatcher,
  ScanAppRoutesOptions,
} from "@reckona/mreact-router";

const reference: PreparedFormActionReference = {
  end: 36,
  exportName: "save",
  expression: "actions.save",
  expressionEnd: 35,
  expressionStart: 23,
  inferred: true,
  moduleId: "actions.ts",
  sourceHash: "hash",
  start: 0,
};

const options = {} as RenderAppRequestOptions;
options.serverActionReferencesByFile = new Map([["page.tsx", [reference]]]);
const preload = {} as AppRouterRenderPreload;
const sink: ResponseSinkStrategy = "string";
const project = {} as AppRouterProjectOptions;
const prerendered = {} as BuiltPrerenderedRoute;
const builtModule = {} as BuiltServerModuleArtifact;
const cache = {} as ClientRouteInferenceCache;
const link = {} as LinkSinkProps;
// @ts-expect-error HtmlSink Link props cannot contain browser callbacks.
const invalidLink: LinkSinkProps = { href: "/", onClick() {} };
const memoryEntry = {} as MemoryPrerenderStoreEntry;
const next = undefined as MiddlewareNext;
const redirect = {} as RedirectOptions;
const cookies = {} as RequestCookies;
const matcher = {} as RouteMatcher;
const scan = {} as ScanAppRoutesOptions;
void preload;
void sink;
void project;
void prerendered;
void builtModule;
void cache;
void link;
void invalidLink;
void memoryEntry;
void next;
void redirect;
void cookies;
void matcher;
void scan;
`,
      );

      try {
        const program = ts.createProgram({
          rootNames: [filename, join(process.cwd(), "packages", "router", "src", "index.ts")],
          options: {
            baseUrl: process.cwd(),
            ignoreDeprecations: "6.0",
            module: ts.ModuleKind.ESNext,
            moduleResolution: ts.ModuleResolutionKind.Bundler,
            noEmit: true,
            paths: {
              "@reckona/mreact-router": ["packages/router/src/index.ts"],
              "@reckona/mreact-compat": ["packages/react-compat/src/index.ts"],
              "@reckona/mreact-compiler": ["packages/compiler/src/index.ts"],
              "@reckona/mreact-devtools": ["packages/devtools/src/index.ts"],
              "@reckona/mreact-query": ["packages/query/src/index.ts"],
              "@reckona/mreact-reactive-core": ["packages/reactive-core/src/index.ts"],
              "@reckona/mreact-reactive-core/runtime-state": [
                "packages/reactive-core/src/runtime-state-public.ts",
              ],
              "@reckona/mreact-server": ["packages/server/src/index.ts"],
              "@reckona/mreact-shared": ["packages/shared/src/index.ts"],
            },
            strict: true,
            target: ts.ScriptTarget.ES2022,
            types: ["node"],
          },
        });
        const diagnostics = ts
          .getPreEmitDiagnostics(program)
          .map((diagnostic) => flattenDiagnostic(diagnostic));

        expect(diagnostics).toEqual([]);
      } finally {
        rmSync(directory, { force: true, recursive: true });
      }
      // Whole-program public-surface type checks need the same headroom as the
      // sibling createProgram tests on single-worker CI runners.
    },
    packageEntrypointTypeCheckTimeoutMs,
  );

  test(
    "generated route declarations type-check Link href without a runtime helper import",
    () => {
      const directory = mkdtempSync(
        join(process.cwd(), "node_modules", ".tmp-mreact-link-routes-"),
      );
      const routesFilename = join(directory, "routes.d.ts");
      const filename = join(directory, "link-routes.tsx");

      writeFileSync(
        routesFilename,
        `
export type AppRoutePath = "/" | "/docs" | "/users/:id" | "/files/:...path";

declare module "@reckona/mreact-router/link" {
  interface AppRouteDeclarations {
    readonly path: AppRoutePath;
  }
}
`,
      );
      writeFileSync(
        filename,
        `
import { Link } from "@reckona/mreact-router/link";

export function Navigation() {
  return (
    <nav>
      <Link href="/">Home</Link>
      <Link href="/docs">Docs</Link>
      <Link href="/users/ada?tab=files#top">User</Link>
      <Link href="/files/notes/day-1">Files</Link>
      {/* @ts-expect-error unknown generated routes are rejected. */}
      <Link href="/missing">Missing</Link>
      {/* @ts-expect-error Link href expects a concrete URL, not a route pattern. */}
      <Link href="/users/:id">Pattern</Link>
    </nav>
  );
}
`,
      );

      try {
        const program = ts.createProgram({
          rootNames: [
            routesFilename,
            filename,
            join(process.cwd(), "packages", "router", "src", "link.ts"),
          ],
          options: {
            baseUrl: process.cwd(),
            jsx: ts.JsxEmit.ReactJSX,
            jsxImportSource: "@reckona/mreact",
            ignoreDeprecations: "6.0",
            module: ts.ModuleKind.ESNext,
            moduleResolution: ts.ModuleResolutionKind.Bundler,
            noEmit: true,
            paths: {
              "@reckona/mreact": ["packages/react/src/index.ts"],
              "@reckona/mreact/jsx-runtime": ["packages/react/src/jsx-runtime.ts"],
              "@reckona/mreact/jsx-dev-runtime": ["packages/react/src/jsx-dev-runtime.ts"],
              "@reckona/mreact-router": ["packages/router/src/index.ts"],
              "@reckona/mreact-router/link": ["packages/router/src/link.ts"],
              "@reckona/mreact-compat": ["packages/react-compat/src/index.ts"],
              "@reckona/mreact-compat/jsx-runtime": ["packages/react-compat/src/jsx-runtime.ts"],
              "@reckona/mreact-compat/jsx-dev-runtime": [
                "packages/react-compat/src/jsx-dev-runtime.ts",
              ],
              "@reckona/mreact-compiler": ["packages/compiler/src/index.ts"],
              "@reckona/mreact-devtools": ["packages/devtools/src/index.ts"],
              "@reckona/mreact-query": ["packages/query/src/index.ts"],
              "@reckona/mreact-reactive-core": ["packages/reactive-core/src/index.ts"],
              "@reckona/mreact-reactive-core/runtime-state": [
                "packages/reactive-core/src/runtime-state-public.ts",
              ],
              "@reckona/mreact-server": ["packages/server/src/index.ts"],
              "@reckona/mreact-shared": ["packages/shared/src/index.ts"],
              "@reckona/mreact-shared/compiler-contract": [
                "packages/shared/src/compiler-contract.ts",
              ],
              "@reckona/mreact-shared/html-escape": ["packages/shared/src/html-escape.ts"],
              "@reckona/mreact-shared/url-safety": ["packages/shared/src/url-safety.ts"],
            },
            strict: true,
            target: ts.ScriptTarget.ES2022,
            types: [],
          },
        });
        const diagnostics = ts
          .getPreEmitDiagnostics(program)
          .map((diagnostic) => flattenDiagnostic(diagnostic));

        expect(diagnostics).toEqual([]);
      } finally {
        rmSync(directory, { force: true, recursive: true });
      }
    },
    packageEntrypointTypeCheckTimeoutMs,
  );

  test(
    "generated public asset declarations type-check asset paths without a runtime helper import",
    () => {
      const directory = mkdtempSync(
        join(process.cwd(), "node_modules", ".tmp-mreact-public-assets-"),
      );
      const publicAssetsFilename = join(directory, "public-assets.d.ts");
      const filename = join(directory, "public-assets.tsx");

      writeFileSync(
        publicAssetsFilename,
        `
declare module "mreact:public-assets" {
  export type PublicAssetPath = "/favicon.svg" | "/images/hero.avif" | "/robots.txt";
}
`,
      );
      writeFileSync(
        filename,
        `
import type { PublicAssetPath } from "mreact:public-assets";

const hero = "/images/hero.avif" satisfies PublicAssetPath;
// @ts-expect-error missing public assets are rejected.
const missing = "/images/missing.avif" satisfies PublicAssetPath;

export function Hero() {
  return <img src={hero} alt="Hero" width="1200" height="630" />;
}
`,
      );

      try {
        const program = ts.createProgram({
          rootNames: [publicAssetsFilename, filename],
          options: {
            baseUrl: process.cwd(),
            jsx: ts.JsxEmit.ReactJSX,
            jsxImportSource: "@reckona/mreact",
            ignoreDeprecations: "6.0",
            module: ts.ModuleKind.ESNext,
            moduleResolution: ts.ModuleResolutionKind.Bundler,
            noEmit: true,
            paths: {
              "@reckona/mreact": ["packages/react/src/index.ts"],
              "@reckona/mreact/jsx-runtime": ["packages/react/src/jsx-runtime.ts"],
              "@reckona/mreact/jsx-dev-runtime": ["packages/react/src/jsx-dev-runtime.ts"],
            },
            strict: true,
            target: ts.ScriptTarget.ES2022,
            types: [],
          },
        });
        const diagnostics = ts
          .getPreEmitDiagnostics(program)
          .map((diagnostic) => flattenDiagnostic(diagnostic));

        expect(diagnostics).toEqual([]);
      } finally {
        rmSync(directory, { force: true, recursive: true });
      }
    },
    packageEntrypointTypeCheckTimeoutMs,
  );
});

function flattenDiagnostic(diagnostic: ts.Diagnostic): string {
  const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n");

  return `${diagnostic.code}: ${message}`;
}
