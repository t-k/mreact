import { describe, expect, test } from "vitest";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import ReactCompatDefault, {
  createElement as createElementFromDefaultImport,
} from "../src/index.js";
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

  test("supports React-style default imports for third-party libraries", async () => {
    const { default: defaultExport, ...namedExports } = await import("../src/index.js");
    const element = ReactCompatDefault.createElement("span", null, "Ada");
    const defaultNamespace = defaultExport as Record<string, unknown>;

    for (const [key, value] of Object.entries(namedExports)) {
      expect(defaultNamespace[key]).toBe(value);
    }

    expect(createElementFromDefaultImport).toBe(createElement);
    expect(ReactCompatDefault.Fragment).toBe(Fragment);
    expect(element.type).toBe("span");
    expect(element.props.children).toBe("Ada");
  });

  test("exposes stable workspace integration subpaths without using the internal export", async () => {
    const manifest = JSON.parse(
      await readFile(join(process.cwd(), "packages", "react-compat", "package.json"), "utf8"),
    ) as { exports?: Record<string, unknown> };

    expect(manifest.exports).toHaveProperty("./event-priority");
    expect(manifest.exports).toHaveProperty("./scheduler");
  });
});
