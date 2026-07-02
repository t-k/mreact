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

  test("indexes completion markers once for many fragments", () => {
    const root = document.createElement("main");
    root.innerHTML = Array.from(
      { length: 4 },
      (_, index) =>
        `<span data-mreact-oob-placeholder="frag-${index}">Loading</span><template data-mreact-oob-fragment="frag-${index}"><strong>${index}</strong></template><mreact-oob-complete hidden data-mreact-oob-complete="frag-${index}"></mreact-oob-complete>`,
    ).join("");
    const originalQuerySelectorAll = root.querySelectorAll.bind(root);
    let completionMarkerScans = 0;
    root.querySelectorAll = ((selector: string) => {
      if (selector === "[data-mreact-oob-complete]") {
        completionMarkerScans += 1;
      }

      return originalQuerySelectorAll(selector);
    }) as typeof root.querySelectorAll;

    applyOutOfOrderFragments(root);

    expect(completionMarkerScans).toBe(1);
    expect(root.querySelectorAll("[data-mreact-oob-fragment]")).toHaveLength(0);
    expect(root.querySelectorAll("[data-mreact-oob-complete]")).toHaveLength(0);
  });

  test("keeps first matching placeholder and completion marker when duplicate ids exist", () => {
    const root = document.createElement("main");
    root.innerHTML =
      '<span data-mreact-oob-placeholder="dup">first loading</span><span data-mreact-oob-placeholder="dup">second loading</span><template data-mreact-oob-fragment="dup"><strong>Ada</strong></template><mreact-oob-complete data-mreact-oob-complete="dup" data-order="first"></mreact-oob-complete><mreact-oob-complete data-mreact-oob-complete="dup" data-order="second"></mreact-oob-complete>';

    applyOutOfOrderFragments(root);

    expect(root.innerHTML).toBe(
      '<strong>Ada</strong><span data-mreact-oob-placeholder="dup">second loading</span><mreact-oob-complete data-mreact-oob-complete="dup" data-order="second"></mreact-oob-complete>',
    );
  });
});
