import { afterEach, describe, expect, test } from "vitest";
import { createStringSink } from "../src/index.js";
import {
  renderAsyncBoundary,
  renderHydrationBoundary,
  renderOutOfOrderBoundary,
  renderOutOfOrderReorderScript,
  renderReactSuspenseClientRenderBoundary,
} from "../src/boundary.js";

const originalTextEncoder = globalThis.TextEncoder;

afterEach(() => {
  globalThis.TextEncoder = originalTextEncoder;
});

describe("server boundary module", () => {
  test("renderHydrationBoundary wraps async content with encoded markers", async () => {
    const sink = createStringSink();

    await renderHydrationBoundary(sink, "route:/user 1", async (boundarySink) => {
      boundarySink.append("<section>User</section>");
    });

    expect(sink.toString()).toBe(
      "<!--mreact-h:start:route%3A%2Fuser%201--><section>User</section><!--mreact-h:end:route%3A%2Fuser%201-->",
    );
  });

  test("renderHydrationBoundary encodes marker ids that could close comments", async () => {
    const sink = createStringSink();

    await renderHydrationBoundary(sink, `route:日本語"--><script>`, async (boundarySink) => {
      boundarySink.append("<section>Safe</section>");
    });

    expect(sink.toString()).toBe(
      "<!--mreact-h:start:route%3A%E6%97%A5%E6%9C%AC%E8%AA%9E%22--%3E%3Cscript%3E--><section>Safe</section><!--mreact-h:end:route%3A%E6%97%A5%E6%9C%AC%E8%AA%9E%22--%3E%3Cscript%3E-->",
    );
    expect(sink.toString()).not.toContain("--><script>");
  });

  test("renderOutOfOrderReorderScript escapes external script metadata", () => {
    const sink = createStringSink();

    renderOutOfOrderReorderScript(sink, {
      nonce: `nonce"1`,
      src: `/assets/reorder.js?chunk="main"`,
    });

    expect(sink.toString()).toBe(
      `<script data-mreact-oob-reorder nonce="nonce&quot;1" src="/assets/reorder.js?chunk=&quot;main&quot;"></script>`,
    );
  });

  test("small Await hydration payloads skip UTF-8 measurement", async () => {
    let encodeCalls = 0;
    class CountingTextEncoder extends originalTextEncoder {
      encode(input?: string) {
        encodeCalls += 1;
        return super.encode(input);
      }
    }
    globalThis.TextEncoder = CountingTextEncoder;
    const sink = createStringSink();

    await renderAsyncBoundary(
      sink,
      Promise.resolve({ message: "small" }),
      (boundarySink, value) => {
        boundarySink.append(String((value as { message: string }).message));
      },
      { hydrationAwaitId: "await-small" },
    );

    expect(sink.toString()).toContain("small");
    expect(encodeCalls).toBe(0);
  });

  test("renderReactSuspenseClientRenderBoundary escapes client-render error metadata", () => {
    const sink = createStringSink();

    renderReactSuspenseClientRenderBoundary(
      sink,
      (boundarySink) => {
        boundarySink.append("<span>Fallback</span>");
      },
      {
        message: `render "failed"`,
        stack: "at <Boundary>",
      },
    );

    expect(sink.toString()).toBe(
      `<!--$!--><template data-msg="render &quot;failed&quot;" data-stck="at &lt;Boundary&gt;"></template><span>Fallback</span><!--/$-->`,
    );
  });
});
