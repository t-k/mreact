import { rm } from "node:fs/promises";
import { describe, expect, test } from "vitest";
import { createAppFixture } from "@reckona/mreact-test-utils";
import { transform } from "@reckona/mreact-compiler";
import { renderAppRequest } from "../src/render.js";
import { importAppRouterSourceModule } from "../src/module-runner.js";

describe("server render values across source modules", () => {
  test("preserves already bundled code without applying build definitions again", async () => {
    const loaded = await importAppRouterSourceModule<{ value: string }>({
      code: "export const value = typeof __MREACT_PREBUILT_RUNTIME_VALUE__;",
      define: { __MREACT_PREBUILT_RUNTIME_VALUE__: '"recompiled"' },
      label: "prebuilt-render-value-module",
    });
    expect(loaded.value).toBe("undefined");
  });

  test("shares registered markup and thunks between separately bundled modules", async () => {
    const producer = await importAppRouterSourceModule<{
      markup: object;
      thunk: () => string;
    }>({
      code: `import { registerServerRenderValue, registerServerRenderThunk } from "@reckona/mreact-shared/server-render-value-internal";
export const markup = registerServerRenderValue("<strong>trusted</strong>");
export const thunk = registerServerRenderThunk(() => "<form>trusted</form>");`,
      label: "render-value-producer",
      resolveDir: process.cwd(),
    });
    const consumer = await importAppRouterSourceModule<{
      isServerRenderValue: (value: unknown) => boolean;
      readServerRenderValue: (value: object) => unknown;
    }>({
      code: `export { isServerRenderValue, readServerRenderValue } from "@reckona/mreact-shared/server-render-value-internal";`,
      label: "render-value-consumer",
      resolveDir: process.cwd(),
    });
    expect(consumer.isServerRenderValue(producer.markup)).toBe(true);
    expect(consumer.readServerRenderValue(producer.markup)).toBe("<strong>trusted</strong>");
    expect(consumer.isServerRenderValue(producer.thunk)).toBe(true);
    expect(consumer.readServerRenderValue(producer.thunk)).toBe(producer.thunk);
    expect(consumer.isServerRenderValue({ html: "<script>unsafe</script>" })).toBe(false);

    const compiled = transform({
      code: "export function AuthLayout(props) { return <section>{props.children}</section>; }",
      filename: "AuthLayout.tsx",
      target: "server",
      serverOutput: "string",
      dev: true,
    });
    expect(compiled.diagnostics).toEqual([]);
    const layout = await importAppRouterSourceModule<{
      AuthLayout: (props: { children: unknown }) => string;
    }>({
      code: compiled.code,
      label: "render-value-layout",
      resolveDir: process.cwd(),
    });
    expect(layout.AuthLayout({ children: producer.thunk })).toBe(
      "<section><form>trusted</form></section>",
    );
    expect(layout.AuthLayout({ children: [producer.markup, "<script>unsafe</script>"] })).toBe(
      "<section><strong>trusted</strong>&lt;script&gt;unsafe&lt;/script&gt;</section>",
    );
  });

  test.each([false, true])(
    "renders native ESM package bindings after escape regexes with stream=%s",
    async (stream) => {
      const fixture = await createAppFixture("mreact-render-native-esm");
      try {
        await fixture.write(
          "node_modules/fixture-esm-badge/package.json",
          JSON.stringify({ exports: "./index.js", name: "fixture-esm-badge", type: "module" }),
        );
        await fixture.write(
          "node_modules/fixture-esm-badge/index.js",
          `export let renders = 0;
export function badge(text) {
  renders += 1;
  return text.toUpperCase();
}
`,
        );
        await fixture.write(
          "layout.tsx",
          `
export default function Layout(props) {
  return <html><head></head><body><main id="main-content">{props.children}</main></body></html>;
}
`,
        );
        await fixture.write(
          "Counter.tsx",
          `
import { cell } from "@reckona/mreact-reactive-core";

export function Counter(props) {
  const count = cell(props.initial);
  return <button type="button" onClick={() => count.set((value) => value + 1)}>{props.label}: {count.get()}</button>;
}
`,
        );
        await fixture.write(
          "page.tsx",
          `
import { badge, renders } from "fixture-esm-badge";
import { Counter } from "./Counter";
export const stream = ${stream};
const stripQuotes = (text: string) => text.replace(/"/g, '');
export default function Page() {
  const unsafe = '<script>alert("unsafe")</script>';
  return (
    <section>
      <h1>{badge('hello')}</h1>
      <p>{\`renders=\${renders}\`}</p>
      <p>{stripQuotes(unsafe)}</p>
      <Counter initial={2} label="Count" />
    </section>
  );
}
`,
        );
        const response = await fixture.render("/", {
          importPolicy: { allowedPackages: ["fixture-esm-badge"] },
        });
        const html = await response.text();
        expect(response.status).toBe(200);
        expect(html).toContain('<main id="main-content">');
        expect(html).toContain("<section><h1>HELLO</h1><p>renders=1</p>");
        expect(html).toContain("&lt;script&gt;alert(unsafe)&lt;/script&gt;");
        expect(html).toContain('data-mreact-client-boundary="Counter"');
        expect(html).toContain('{"initial":2,"label":"Count"}');
        expect(html).not.toContain("&lt;section&gt;");
        expect(html).not.toContain("ReferenceError");
      } finally {
        await rm(fixture.appDir, { force: true, recursive: true });
      }
    },
  );

  test.each([false, true])("renders imported layout children with stream=%s", async (stream) => {
    const fixture = await createAppFixture("mreact-render-values");
    try {
      await fixture.write(
        "layout.tsx",
        `
export default function Layout(props) { return <html><head></head><body>{props.children}</body></html>; }
`,
      );
      await fixture.write(
        "AuthLayout.tsx",
        `
export default function AuthLayout(props) {
  return <section>{props.children}<footer>{props.footer}</footer></section>;
}`,
      );
      await fixture.write(
        "page.tsx",
        `
import AuthLayout from "./AuthLayout";
export const stream = ${stream};
function LoginForm() { return <form><button>Sign in</button></form>; }
export default function Page() {
  const unsafe = '<script>alert("unsafe")</script>';
  return <AuthLayout footer={["Terms ", [<strong>apply</strong>, unsafe]]}><LoginForm /></AuthLayout>;
}`,
      );
      const response = await renderAppRequest({
        appDir: fixture.appDir,
        request: new Request("http://local.test/"),
      });
      const html = await response.text();
      expect(response.status).toBe(200);
      expect(html).toContain("<form><button>Sign in</button></form>");
      expect(html).toContain("<strong>apply</strong>");
      expect(html).toContain("&lt;script&gt;");
      expect(html).not.toContain('<script>alert("unsafe")</script>');
      expect(html).not.toContain("_selectedValue");
      expect(html).not.toContain("&lt;form&gt;");
    } finally {
      await rm(fixture.appDir, { recursive: true, force: true });
    }
  });
});
