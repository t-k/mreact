// @vitest-environment happy-dom

import { describe, expect, test } from "vitest";
import { applyOutOfOrderFragments } from "../src/reorder.js";

describe("out-of-order fragment reorder helper", () => {
  test("replaces matching placeholder template with fragment content", () => {
    const root = document.createElement("main");
    root.innerHTML =
      '<section><template data-mreact-oob-placeholder="mreact-0"><span>Loading</span></template><p>After</p></section><template data-mreact-oob-fragment="mreact-0"><span>Ada</span></template>';

    applyOutOfOrderFragments(root);

    expect(root.innerHTML).toBe(
      "<section><span>Ada</span><p>After</p></section>",
    );
  });

  test("replaces matching visible placeholder with fragment content", () => {
    const root = document.createElement("main");
    root.innerHTML =
      '<section><span data-mreact-oob-placeholder="mreact-0"><span>Loading</span></span><p>After</p></section><template data-mreact-oob-fragment="mreact-0"><span>Ada</span></template>';

    applyOutOfOrderFragments(root);

    expect(root.innerHTML).toBe(
      "<section><span>Ada</span><p>After</p></section>",
    );
  });

  test("keeps fragment template when matching placeholder is missing", () => {
    const root = document.createElement("main");
    root.innerHTML =
      '<template data-mreact-oob-fragment="missing"><span>Ada</span></template>';

    applyOutOfOrderFragments(root);

    expect(root.innerHTML).toBe(
      '<template data-mreact-oob-fragment="missing"><span>Ada</span></template>',
    );
  });
});
