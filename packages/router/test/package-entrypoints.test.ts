import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import * as ts from "typescript";
import { describe, expect, test } from "vitest";

describe("router package entrypoints", () => {
  test("exposes stable session and native escape subpaths for workspace integrations", async () => {
    const manifest = JSON.parse(
      await readFile(join(process.cwd(), "packages", "router", "package.json"), "utf8"),
    ) as { exports?: Record<string, unknown> };

    expect(manifest.exports).toHaveProperty("./session");
    expect(manifest.exports).toHaveProperty("./native-escape");
  });

  test("exposes app-router global types for Slot layouts", async () => {
    const manifest = JSON.parse(
      await readFile(join(process.cwd(), "packages", "router", "package.json"), "utf8"),
    ) as { exports?: Record<string, unknown> };

    expect(manifest.exports).toHaveProperty("./app-router-globals");
  });

  test("app-router global types include Await for shared stream components", () => {
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
            "@reckona/mreact-compat/jsx-runtime": [
              "packages/react-compat/src/jsx-runtime.ts",
            ],
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
  });

  test("public entrypoint infers route loader data", () => {
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
  }, 10_000);

  test("public entrypoint exposes typed route href helpers", () => {
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
  }, 10_000);

  test("link subpath exports Link as a valid mreact JSX component", () => {
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
            "@reckona/mreact-compat/jsx-runtime": [
              "packages/react-compat/src/jsx-runtime.ts",
            ],
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
  });

  test("public entrypoint exposes app-router route and children types", () => {
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
  request: new Request("https://app.test/users/1"),
};
pageProps.data.name.toUpperCase();

const layoutProps: LayoutProps<{ id: string }> = {
  children: "body" satisfies MReactNode,
  params: { id: "1" },
  request: new Request("https://app.test/users/1"),
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
  });

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

  test("public entrypoint exports prepared form action reference type", () => {
    const directory = mkdtempSync(
      join(process.cwd(), "node_modules", ".tmp-mreact-form-action-types-"),
    );
    const filename = join(directory, "form-action-reference.ts");

    writeFileSync(
      filename,
      `
import type { PreparedFormActionReference, RenderAppRequestOptions } from "@reckona/mreact-router";

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
  });
});

function flattenDiagnostic(diagnostic: ts.Diagnostic): string {
  const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n");

  return `${diagnostic.code}: ${message}`;
}
