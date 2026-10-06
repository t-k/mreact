// @vitest-environment happy-dom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement, createStreamingHydrationRoot } from "../../react-compat/src/index.js";
import type { ReactCompatNode } from "../../react-compat/src/index.js";
import { describe, expect, test } from "vitest";
import { transform } from "../src/index.js";
import { analyzeToIr } from "../src/internal.js";
import { emitServer } from "../src/emit-server.js";
import { emitServerStream } from "../src/emit-server-stream.js";
import { registerServerRenderValue } from "../../shared/src/server-render-value-internal.js";
import { compileCompatModule, runCompatServerComponent } from "./helpers.js";
import { runServerComponent, runServerStreamComponent } from "./helpers.js";

const example = readFileSync(resolve("examples/selective-hydration/src/App.compat.tsx"), "utf8");

describe("compiled mixed text hydration", () => {
  test.each(["string", "stream"] as const)(
    "emits fixed mixed text boundaries without runtime joining (%s)",
    async (serverOutput) => {
      const output = transform({
        code: `export function App() { return <p>A{""}{"< & >"}<b>end</b></p>; }`,
        filename: "fixed.compat.tsx",
        mode: "compat",
        target: "server",
        dev: false,
        serverOutput,
      });
      expect(output.diagnostics).toEqual([]);
      const html =
        serverOutput === "string"
          ? runCompatServerComponent(output.code)
          : await runServerStreamComponent(output.code);
      expect(html).toBe("<p>A<!-- -->&lt; &amp; &gt;<b>end</b></p>");
      expect(output.code).toContain("A<!-- -->&lt; &amp; &gt;");
    },
  );

  test.each(["html", "react-node", "compat-child"] as const)(
    "preserves text around an opaque %s child in both server outputs",
    async (renderMode) => {
      const { ir, diagnostics } = analyzeToIr({
        code: `export function App(props) { return <p>A{" "}{props.child}C{" "}D<span>end</span></p>; }`,
        filename: "mixed-child.tsx",
        target: "server",
      });
      expect(diagnostics).toEqual([]);
      const root = ir.components[0]!.root;
      if (root.kind !== "element") throw new Error("Expected a host element root");
      const child = root.children.find(
        (child) => child.kind === "expr" && child.code === "props.child",
      );
      if (child?.kind !== "expr") throw new Error("Expected the opaque child expression");
      child.renderMode = renderMode;
      const props = {
        child:
          renderMode === "html"
            ? registerServerRenderValue("<em>node</em>")
            : createElement("em", null, "node"),
      };
      for (const serverOutput of ["string", "stream"] as const) {
        const output =
          serverOutput === "string"
            ? emitServer(ir, { preserveMixedTextNodes: true })
            : emitServerStream(ir, { preserveMixedTextNodes: true });
        const html =
          serverOutput === "string"
            ? runCompatServerComponent(output.code, "App", props)
            : await runServerStreamComponent(output.code, "App", props);
        expect(html).toBe("<p>A<!-- --> <em>node</em>C<!-- --> <!-- -->D<span>end</span></p>");
      }
    },
  );

  test("keeps native mixed text merged to match compiler DOM paths", async () => {
    const code = `export function App() { return <p>hello{" "}<b>world</b></p>; }`;
    for (const serverOutput of ["string", "stream"] as const) {
      const output = transform({
        code,
        filename: "native.tsx",
        target: "server",
        dev: false,
        serverOutput,
      });
      const html =
        serverOutput === "string"
          ? runServerComponent(output.code)
          : await runServerStreamComponent(output.code);
      expect(html).toBe("<p>hello <b>world</b></p>");
    }
  });

  test.each([false, true])(
    "replays the first click once while preserving its target (nested target: %s)",
    (nested) => {
      const code = nested ? example.replace(">+1</button>", "><span>+1</span></button>") : example;
      const client = transform({
        code,
        filename: "App.compat.tsx",
        target: "client",
        mode: "compat",
        dev: true,
      });
      const server = transform({
        code,
        filename: "App.compat.tsx",
        target: "server",
        mode: "compat",
        dev: true,
        serverHydration: true,
      });
      expect(client.diagnostics).toEqual([]);
      expect(server.diagnostics).toEqual([]);
      const App = compileCompatModule(client.code).App as () => ReactCompatNode;
      const container = document.createElement("div");
      container.innerHTML = runCompatServerComponent(server.code);
      const button = container.querySelector("button")!;
      const target = nested ? button.querySelector("span")! : button;
      const recoveries: string[] = [];
      const root = createStreamingHydrationRoot(container, {
        manifest: { version: 1, events: [{ id: "App:0", event: "click", handler: "onClick" }] },
        selectiveHydration: {
          element: createElement(App, {}),
          options: {
            resumeId: "App",
            onRecoverableError(error) {
              recoveries.push(error.message);
            },
          },
        },
      });

      try {
        target.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
        expect(container.querySelector("[data-status]")?.textContent).toBe("status: hydrated");
        expect(container.textContent).toContain("count: 1");
        expect(container.querySelector("button")).toBe(button);
        expect(container.contains(target)).toBe(true);
        expect(recoveries).toEqual([]);
        button.click();
        expect(container.textContent).toContain("count: 2");
      } finally {
        root.dispose();
      }
    },
  );

  test.each(["string", "stream"] as const)(
    "preserves nonempty text boundaries within mixed element siblings (%s)",
    async (serverOutput) => {
      const output = transform({
        code: `export function App() { return <p>A{""}{null}{0}{" "}<em>next</em>B{" "}C</p>; }`,
        filename: "mixed.compat.tsx",
        target: "server",
        mode: "compat",
        dev: false,
        serverOutput,
      });
      expect(output.diagnostics).toEqual([]);
      const html =
        serverOutput === "string"
          ? runCompatServerComponent(output.code)
          : await runServerStreamComponent(output.code);
      expect(html).toBe("<p>A<!-- -->0<!-- --> <em>next</em>B<!-- --> <!-- -->C</p>");
    },
  );
});
