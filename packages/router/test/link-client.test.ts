// @vitest-environment happy-dom

import { describe, expect, test } from "vitest";
import { Link } from "../src/link.js";

describe("Link client rendering", () => {
  test("drops unsafe client href values", () => {
    const anchor = Link({
      children: "profile",
      href: "javascript:alert(1)",
    }) as HTMLAnchorElement;

    expect(anchor.tagName).toBe("A");
    expect(anchor.getAttribute("href")).toBeNull();
    expect(anchor.textContent).toBe("profile");
  });
});
