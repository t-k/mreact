import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { createAwsLambdaRequestHandler } from "../src/adapters/aws-lambda.js";
import {
  createCloudflareBuiltRequestHandler,
  createCloudflareRouteModuleRenderer,
} from "../src/adapters/cloudflare.js";
import { expect, test } from "vitest";
import { buildApp } from "../src/build.js";
import { renderAppRequest } from "../src/render.js";
import { renderBuiltAppRequest } from "../src/serve.js";

test.each(
  ["node", "cloudflare", "aws-lambda"].flatMap((target) =>
    [false, true].flatMap((stream) =>
      ["@reckona/mreact-compat", "@reckona/mreact-compat/hooks"].map((hooksEntry) => ({
        target,
        stream,
        hooksEntry,
      })),
    ),
  ),
)(
  "production compat boundaries include meaningful server HTML ($target, stream=$stream, $hooksEntry)",
  async ({ target, stream, hooksEntry }) => {
    const root = await mkdtemp(join(tmpdir(), "mreact-compat-ssr-"));
    try {
      const appDir = join(root, "app");
      const outDir = join(root, ".mreact");
      await mkdir(appDir);
      await writeFile(
        join(appDir, "Counter.compat.tsx"),
        `import { useState } from "${hooksEntry}";
export function Counter() {
  const [count, setCount] = useState(0);
  return <button type="button" onClick={() => setCount(value => value + 1)}>compat count: {count}</button>;
}`,
      );
      const payload = '<img src=x onerror="globalThis.__compatXss = true">&text';
      await writeFile(
        join(appDir, "Text.compat.tsx"),
        "export function Text(props) { return props.value; }",
      );
      const code = `export const stream = ${stream};
import { Counter } from "./Counter.compat";
import { Text } from "./Text.compat";
export default function Page() { return <main><Counter /><p>Native sibling</p><Counter /><aside><Text value={${JSON.stringify(payload)}} /></aside></main>; }`;
      const filename = join(appDir, "page.tsx");
      await writeFile(filename, code);
      await buildApp({
        appDir,
        outDir,
        targets: target === "node" ? undefined : [target as "cloudflare" | "aws-lambda"],
      });
      const request = new Request("http://local.test/");
      let response: Response;
      if (target === "cloudflare") {
        const registry = await import(
          pathToFileURL(join(outDir, "cloudflare", "route-modules.mjs")).href
        );
        const handler = createCloudflareBuiltRequestHandler({
          assets: {},
          clientManifest: JSON.parse(
            await readFile(join(outDir, "client", "manifest.json"), "utf8"),
          ),
          serverManifest: JSON.parse(
            await readFile(join(outDir, "server", "manifest.json"), "utf8"),
          ),
          renderRoute: createCloudflareRouteModuleRenderer({ modules: registry.routeModules }),
        });
        response = await handler.fetch(
          request,
          {},
          { waitUntil() {}, passThroughOnException() {} },
        );
      } else if (target === "aws-lambda") {
        const handler = createAwsLambdaRequestHandler({ outDir });
        const result = await handler({
          version: "2.0",
          rawPath: "/",
          rawQueryString: "",
          headers: { host: "local.test" },
          requestContext: { http: { method: "GET", path: "/" } },
        } as never);
        response = new Response(result.body, { status: result.statusCode });
        const entry = await readFile(join(outDir, "aws-lambda", "mreact-handler.mjs"), "utf8");
        expect(entry).toContain('preload: { mode: "middleware" }');
        expect(entry).not.toContain("Counter.compat");
      } else {
        response = await renderBuiltAppRequest({ outDir, request });
      }
      const html = await response.text();
      expect(response.status, html).toBe(200);
      expect(
        html.match(/<button type="button">compat count: (?:<!-- -->)?0<\/button>/g),
      ).toHaveLength(2);
      expect(html).toContain("<p>Native sibling</p>");
      expect(html).toContain("&lt;img");
      expect(html).not.toContain("<img");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  },
  60_000,
);

test.each(["direct", "transitive"])(
  "production excludes %s browser-only module evaluation",
  async (kind) => {
    const root = await mkdtemp(join(tmpdir(), "mreact-compat-browser-only-"));
    try {
      const appDir = join(root, "app");
      const outDir = join(root, ".mreact");
      await mkdir(appDir);
      await writeFile(join(appDir, "browser.ts"), "export const title = document.title;");
      await writeFile(join(appDir, "helper.ts"), 'export { title } from "./browser";');
      await writeFile(
        join(appDir, "Counter.compat.tsx"),
        (kind === "direct"
          ? "const title = document.title;"
          : 'import { title } from "./helper";') +
          "\nexport function Counter() { return <button>{title}</button>; }",
      );
      await writeFile(
        join(appDir, "page.tsx"),
        'import { Counter } from "./Counter.compat";\nexport default function Page() { return <main><h1>Native</h1><Counter /></main>; }',
      );
      await buildApp({ appDir, outDir });
      const response = await renderBuiltAppRequest({
        outDir,
        request: new Request("http://local.test/"),
      });
      const html = await response.text();
      expect(response.status, html).toBe(200);
      expect(html).toContain("<h1>Native</h1>");
      expect(html).toContain('data-mreact-client-boundary="Counter"');
      expect(html).not.toContain("data-mreact-compat-resume=");
      expect(html).not.toContain("<button");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  },
  60_000,
);

test.each([false, true])(
  "production preserves nested compat output and bounds children/context (stream=%s)",
  async (stream) => {
    const root = await mkdtemp(join(tmpdir(), "mreact-compat-shapes-"));
    try {
      const appDir = join(root, "app");
      const outDir = join(root, ".mreact");
      await mkdir(appDir);
      await writeFile(
        join(appDir, "Label.compat.tsx"),
        "export function Label() { return <strong>Nested label</strong>; }",
      );
      await writeFile(
        join(appDir, "Panel.compat.tsx"),
        'import { Label } from "./Label.compat"; export function Panel({children}) { return <section><Label/>{children}</section>; }',
      );
      await writeFile(
        join(appDir, "Context.compat.tsx"),
        'import { createContext, useContext } from "@reckona/mreact-compat"; const Context = createContext("default"); export function ContextPanel() { return <p>{useContext(Context)}</p>; }',
      );
      await writeFile(
        join(appDir, "page.tsx"),
        `export const stream = ${stream}; import { Panel } from "./Panel.compat"; import { ContextPanel } from "./Context.compat"; export default function Page() { return <main><Panel/><Panel><em>Server slot</em></Panel><Panel value={1n}/><ContextPanel/></main>; }`,
      );
      await buildApp({ appDir, outDir });
      const response = await renderBuiltAppRequest({
        outDir,
        request: new Request("http://local.test/"),
      });
      const html = await response.text();
      expect(response.status, html).toBe(200);
      expect(html).toContain("<section><strong>Nested label</strong></section>");
      expect(html.match(/data-mreact-compat-resume=/g)).toHaveLength(1);
      expect(html).toContain("<em>Server slot</em>");
      expect(html).toContain('data-mreact-client-boundary-nonserializable="true"');
      expect(html).toContain('data-mreact-client-boundary="ContextPanel"');
      expect(html).not.toContain("<p>default</p>");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  },
  60_000,
);

test.each([false, true])(
  "development compat string results escape HTML (stream=%s)",
  async (stream) => {
    const root = await mkdtemp(join(tmpdir(), "mreact-compat-text-"));
    try {
      const payload = '<img src=x onerror="globalThis.__compatXss = true">&text';
      await writeFile(
        join(root, "Text.compat.tsx"),
        'import { useState } from "@reckona/mreact-compat/hooks"; export function Text(props) { const [value] = useState(props.value); return value; }',
      );
      await writeFile(
        join(root, "page.tsx"),
        `export const stream = ${stream}; import { Text } from "./Text.compat"; export default function Page() { return <main><Text value={${JSON.stringify(payload)}} /></main>; }`,
      );
      const response = await renderAppRequest({
        appDir: root,
        request: new Request("http://local.test/"),
      });
      const html = await response.text();
      expect(response.status, html).toBe(200);
      expect(html).toContain("&lt;img");
      expect(html).not.toContain("<img");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  },
  60_000,
);
