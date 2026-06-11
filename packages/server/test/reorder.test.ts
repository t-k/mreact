// @vitest-environment happy-dom

import { describe, expect, test } from "vitest";
import { applyOutOfOrderFragments } from "../src/reorder.js";

describe("out-of-order fragment reorder helper", () => {
  test("replaces matching placeholder template with fragment content", () => {
    const root = document.createElement("main");
    root.innerHTML =
      '<section><template data-mreact-oob-placeholder="mreact-0"><span>Loading</span></template><p>After</p></section><template data-mreact-oob-fragment="mreact-0"><span>Ada</span></template><mreact-oob-complete hidden data-mreact-oob-complete="mreact-0"></mreact-oob-complete>';

    applyOutOfOrderFragments(root);

    expect(root.innerHTML).toBe(
      "<section><span>Ada</span><p>After</p></section>",
    );
  });

  test("replaces matching visible placeholder with fragment content", () => {
    const root = document.createElement("main");
    root.innerHTML =
      '<section><span data-mreact-oob-placeholder="mreact-0"><span>Loading</span></span><p>After</p></section><template data-mreact-oob-fragment="mreact-0"><span>Ada</span></template><mreact-oob-complete hidden data-mreact-oob-complete="mreact-0"></mreact-oob-complete>';

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

  test("reorders fragments next to user comment nodes without consuming the comments", () => {
    const root = document.createElement("main");
    root.innerHTML =
      '<section><!--user:before--><span data-mreact-oob-placeholder="mreact-0"><span>Loading</span></span><!--user:after--></section><!--user:fragment--><template data-mreact-oob-fragment="mreact-0"><strong>Ada</strong></template><mreact-oob-complete hidden data-mreact-oob-complete="mreact-0"></mreact-oob-complete>';

    applyOutOfOrderFragments(root);

    expect(root.innerHTML).toBe(
      "<section><!--user:before--><strong>Ada</strong><!--user:after--></section><!--user:fragment-->",
    );
  });

  test("does not replace an observed fragment until its completion marker is present", () => {
    const root = document.createElement("main");
    root.innerHTML =
      '<section><span data-mreact-oob-placeholder="mreact-0"><span>Loading</span></span></section><template data-mreact-oob-fragment="mreact-0"><ol><li>1.</li></ol></template>';

    applyOutOfOrderFragments(root);

    expect(root.innerHTML).toBe(
      '<section><span data-mreact-oob-placeholder="mreact-0"><span>Loading</span></span></section><template data-mreact-oob-fragment="mreact-0"><ol><li>1.</li></ol></template>',
    );

    root.insertAdjacentHTML(
      "beforeend",
      '<mreact-oob-complete hidden data-mreact-oob-complete="mreact-0"></mreact-oob-complete>',
    );
    applyOutOfOrderFragments(root);

    expect(root.innerHTML).toBe("<section><ol><li>1.</li></ol></section>");
  });
});
