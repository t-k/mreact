import { describe, expect, test } from "vitest";
import { createStringSink } from "../src/index.js";
import {
  renderHydrationBoundary,
  renderOutOfOrderReorderScript,
  renderReactSuspenseClientRenderBoundary,
} from "../src/boundary.js";

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
