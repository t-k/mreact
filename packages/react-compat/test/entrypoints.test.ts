import { describe, expect, test } from "vitest";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  Fragment,
  createElement,
  createRef,
  isValidElement,
  version,
} from "../src/index.js";

describe("react-compat entrypoints", () => {
  test("creates React-compatible element and ref values through the public entrypoint", () => {
    const element = createElement(Fragment, { key: "root" }, "hello");
    const ref = createRef<HTMLDivElement>();

    expect(isValidElement(element)).toBe(true);
    expect(element).toMatchObject({
      key: "root",
      props: { children: "hello" },
      ref: null,
      type: Fragment,
    });
    expect(ref.current).toBeNull();
    expect(version).toBe("19.2.6");
  });

  test("exposes stable workspace integration subpaths without using the internal export", async () => {
    const manifest = JSON.parse(
      await readFile(join(process.cwd(), "packages", "react-compat", "package.json"), "utf8"),
    ) as { exports?: Record<string, unknown> };

    expect(manifest.exports).toHaveProperty("./event-priority");
    expect(manifest.exports).toHaveProperty("./scheduler");
  });
});
