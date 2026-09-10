// @vitest-environment happy-dom
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { buildClientRouteBundle, collectClientRouteReferences } from "../src/client.js";
import { renderAppRequest } from "../src/render.js";

test.each(["valid", "escaped props", "malformed props", "missing marker"])(
  "development compat boundaries isolate %s and preserve SSR DOM",
  async (scenario) => {
    const root = await mkdtemp(join(tmpdir(), "mreact-compat-ssr-"));
    try {
      const appDir = join(root, "app");
      await mkdir(appDir);
      await writeFile(
        join(appDir, "Counter.compat.tsx"),
        `import { useState } from "@reckona/mreact-compat";
export function Counter({ label = "compat count" }) {
  const [count, setCount] = useState(0);
  return <button type="button" onClick={() => setCount(value => value + 1)}>{label}: {count}</button>;
}`,
      );
      const label =
        scenario === "escaped props"
          ? '</script><script>throw "injected"</script>&"'
          : "compat count";
      const code = `import { Counter } from "./Counter.compat";
export default function Page() { return <main><Counter label={${JSON.stringify(label)}} /><p>Native sibling</p><Counter /></main>; }`;
      const filename = join(appDir, "page.tsx");
      await writeFile(filename, code);
      const response = await renderAppRequest({
        appDir,
        request: new Request("http://local.test/"),
      });
      const html = await response.text();
      expect(response.status, html).toBe(200);
      expect(html.match(/<button type="button">/g)).toHaveLength(2);
      expect(html).toContain("<p>Native sibling</p>");
      document.body.innerHTML = (
        /<body[^>]*>([\s\S]*?)<\/body>/i.exec(html)?.[1] ?? html
      ).replaceAll(/<script\b[^>]*type=["']module["'][^>]*><\/script>/gi, "");
      const buttons = Array.from(document.querySelectorAll("button"));
      const sibling = document.querySelector("p");
      const scripts = document.querySelectorAll<HTMLScriptElement>(
        "script[data-mreact-client-boundary-props]",
      );
      expect(scripts).toHaveLength(2);
      expect(JSON.parse(scripts[0]!.textContent!)).toEqual({ label });
      if (scenario === "malformed props") scripts[0]!.textContent = "{";
      if (scenario === "missing marker") document.querySelector("template")!.nextSibling!.remove();
      const references = await collectClientRouteReferences({ appDir, code, filename });
      const bundle = await buildClientRouteBundle({
        code,
        filename,
        routePath: "/",
        clientBoundaryImports: references.clientBoundaryImports,
        clientReferenceImports: references.clientReferenceImports,
        clientReferenceManifest: references.clientReferenceManifest,
      });
      await import(
        `data:text/javascript;charset=utf-8,${encodeURIComponent(bundle)}#compat-ssr-${scenario}`
      );
      expect(Array.from(document.querySelectorAll("button"))).toEqual(buttons);
      buttons[0]!.click();
      expect(buttons[0]!.textContent).toBe(
        `${label}: ${scenario === "malformed props" || scenario === "missing marker" ? 0 : 1}`,
      );
      expect(buttons[1]!.textContent).toBe("compat count: 0");
      buttons[1]!.click();
      expect(buttons[1]!.textContent).toBe("compat count: 1");
      expect(document.querySelector("p")).toBe(sibling);
    } finally {
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_COMMENT);
      const roots: Array<{ unmount(): void }> = [];
      while (walker.nextNode()) {
        const root = (walker.currentNode as Comment & { __mreactCompatRoot?: { unmount(): void } })
          .__mreactCompatRoot;
        if (root !== undefined) roots.push(root);
      }
      roots.forEach((root) => root.unmount());
      document.body.replaceChildren();
      await rm(root, { recursive: true, force: true });
    }
  },
  60_000,
);
