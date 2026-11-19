import { describe, expect, test, vi } from "vitest";
import * as componentDetection from "../src/oxc-component-detection.js";
import { transform } from "../src/index.js";
import { compileServerModule } from "./helpers.js";

function compileServer(code: string): string {
  return transform({
    code,
    filename: "page.tsx",
    target: "server",
    dev: false,
  }).code;
}

async function evaluateCompiled(code: string): Promise<Record<string, unknown>> {
  return compileServerModule(code);
}

describe("compiler render-value reassignment safety (Issue 074)", () => {
  test.each([false, true])("reuses the first JSX analysis only without a reassignment (%j)", (reassign) => {
    const collect = vi.spyOn(componentDetection, "collectOxcLocalJsxReturnFunctionNames");
    try {
      compileServer(`
        let render = () => <b>first</b>;
        function wrapper() { return render(); }
        ${reassign ? 'render = () => "next";' : ""}
        export default function Page() { return <main>{wrapper()}</main>; }
      `);
      expect(collect).toHaveBeenCalledTimes(reassign ? 2 : 1);
    } finally {
      collect.mockRestore();
    }
  });

  test("let JSX-init reassigned to user input is escaped at render", async () => {
    const code = compileServer(
      `export default function Page({ note }) {
        let x = <em>safe</em>;
        x = note;
        return <p>{x}</p>;
      }`,
    );
    const { default: Page } = (await evaluateCompiled(code)) as {
      default: (p: { note: string }) => string;
    };
    const out = Page({ note: "<script>alert(1)</script>" });
    expect(out).not.toContain("<script>");
    expect(out).toContain("&lt;script&gt;");
  });

  test("const JSX-init binding keeps raw HTML path", async () => {
    const code = compileServer(
      `export default function Page() {
        const inner = <em>safe</em>;
        return <p>{inner}</p>;
      }`,
    );
    const { default: Page } = (await evaluateCompiled(code)) as {
      default: () => string;
    };
    const out = Page();
    expect(out).toBe("<p><em>safe</em></p>");
  });

  test("conditional reassignment to user input is escaped", async () => {
    const code = compileServer(
      `export default function Item({ item }) {
        let preview = <span>loading</span>;
        if (item && item.html) {
          preview = item.html;
        }
        return <article>{preview}</article>;
      }`,
    );
    const { default: Item } = (await evaluateCompiled(code)) as {
      default: (p: { item: { html: string } }) => string;
    };
    const out = Item({ item: { html: "<script>alert(1)</script>" } });
    expect(out).not.toContain("<script>");
  });

  test("post-init augmented assignment (+=) is also escaped", async () => {
    const code = compileServer(
      `export default function Page({ note }) {
        let pieces = <em>start</em>;
        pieces += note;
        return <p>{pieces}</p>;
      }`,
    );
    const { default: Page } = (await evaluateCompiled(code)) as {
      default: (p: { note: string }) => string;
    };
    const out = Page({ note: "<script>alert(1)</script>" });
    expect(out).not.toContain("<script>");
  });
});
