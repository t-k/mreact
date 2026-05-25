import { describe, expect, test, vi } from "vitest";
import {
  createSlotRenderContext,
  markShellBoundary,
  shellBoundaryId,
  splitLayoutSlot,
  warnUnconsumedRouteSlots,
} from "../src/layout-composer.js";

describe("router layout composer contract", () => {
  test("splits a layout at the default slot and consumes named slots", () => {
    const context = createSlotRenderContext({
      aside: "<aside>Related</aside>",
      footer: "<footer>Footer</footer>",
    });

    expect(
      splitLayoutSlot(
        "<html><body><slot name=\"aside\"></slot><main><slot /></main><slot name='footer'></slot></body></html>",
        context,
      ),
    ).toEqual({
      prefix: "<html><body><aside>Related</aside><main>",
      suffix: "</main><footer>Footer</footer></body></html>",
    });
    expect([...context.consumedSlots].sort()).toEqual(["aside", "footer"]);
  });

  test("drops missing named slots without consuming the default page body slot", () => {
    const context = createSlotRenderContext({});

    expect(splitLayoutSlot("<section><slot name=\"missing\"></slot><slot></slot></section>", context)).toEqual({
      prefix: "<section>",
      suffix: "</section>",
    });
    expect(context.consumedSlots.size).toBe(0);
  });

  test("marks shell boundaries once with escaped stable ids", () => {
    const marked = markShellBoundary("<section>Layout</section>", {
      file: "/app/layout.tsx",
      id: "docs/<root>",
      kind: "layout",
    });

    expect(marked).toBe('<section data-mreact-layout-boundary="docs/&lt;root&gt;">Layout</section>');
    expect(
      markShellBoundary(marked, {
        file: "/app/layout.tsx",
        id: "changed",
        kind: "layout",
      }),
    ).toBe(marked);
  });

  test("normalizes shell boundary ids by route directory", () => {
    expect(shellBoundaryId("/repo/src/app", "/repo/src/app")).toBe("root");
    expect(shellBoundaryId("/repo/src/app", "/repo/src/app/docs/(marketing)")).toBe(
      "docs/_marketing_",
    );
  });

  test("warns about unconsumed named slots only in dev mode", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    warnUnconsumedRouteSlots({
      appDir: "/repo/src/app",
      pageFile: "/repo/src/app/docs/page.tsx",
      serverModuleCacheVersion: undefined,
      slotContext: createSlotRenderContext({ default: "ignored", sidebar: "unused" }),
    });
    warnUnconsumedRouteSlots({
      appDir: "/repo/src/app",
      pageFile: "/repo/src/app/docs/page.tsx",
      serverModuleCacheVersion: "build",
      slotContext: createSlotRenderContext({ sidebar: "unused" }),
    });

    expect(warn).toHaveBeenCalledTimes(2);
    expect(warn.mock.calls[0]?.[0]).toContain("slots.default does not target <Slot />");
    expect(warn.mock.calls[1]?.[0]).toContain("slots.{sidebar} is not consumed");
    warn.mockRestore();
  });
});
