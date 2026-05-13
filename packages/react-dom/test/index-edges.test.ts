// @vitest-environment happy-dom

import { describe, expect, test } from "vitest";
import {
  preconnect,
  preinit,
  preinitModule,
  preload,
  preloadModule,
  prefetchDNS,
  requestFormReset,
  unstable_batchedUpdates,
  useFormStatus,
} from "../src/index.js";

describe("react-dom/index helpers", () => {
  test("useFormStatus returns the not-pending shape", () => {
    const status = useFormStatus();
    expect(status).toEqual({
      pending: false,
      data: null,
      method: null,
      action: null,
    });
  });

  test("requestFormReset calls form.reset()", () => {
    const form = document.createElement("form");
    let called = 0;
    form.reset = () => {
      called += 1;
    };
    requestFormReset(form);
    expect(called).toBe(1);
  });

  test("unstable_batchedUpdates supports the zero-argument variant and the one-argument variant", () => {
    expect(unstable_batchedUpdates(() => 42)).toBe(42);
    expect(
      unstable_batchedUpdates(
        (arg: string) => `wrapped:${arg}`,
        "hello",
      ),
    ).toBe("wrapped:hello");
  });

  test("prefetchDNS appends a <link rel=\"dns-prefetch\"> for unique hrefs", () => {
    document.head.innerHTML = "";
    prefetchDNS("https://a.test/");
    prefetchDNS("https://a.test/"); // duplicate, ignored
    const links = document.head.querySelectorAll(
      'link[rel="dns-prefetch"][href="https://a.test/"]',
    );
    expect(links.length).toBe(1);
  });

  test("preconnect emits a <link rel=\"preconnect\"> with crossorigin", () => {
    document.head.innerHTML = "";
    preconnect("https://cdn.test/", { crossOrigin: "anonymous" });
    const link = document.head.querySelector('link[rel="preconnect"]');
    expect(link?.getAttribute("href")).toBe("https://cdn.test/");
    expect(link?.getAttribute("crossorigin")).toBe("anonymous");
  });

  test("preload emits a <link rel=\"preload\"> with attribute set", () => {
    document.head.innerHTML = "";
    preload("https://cdn.test/img.png", {
      as: "image",
      crossOrigin: "anonymous",
      fetchPriority: "high",
      imageSrcSet: "img.png 1x",
      imageSizes: "100px",
    });
    const link = document.head.querySelector(
      'link[rel="preload"][href="https://cdn.test/img.png"]',
    );
    expect(link?.getAttribute("as")).toBe("image");
    expect(link?.getAttribute("fetchpriority")).toBe("high");
    expect(link?.getAttribute("imagesrcset")).toBe("img.png 1x");
    expect(link?.getAttribute("imagesizes")).toBe("100px");
  });

  test("preloadModule emits a modulepreload link", () => {
    document.head.innerHTML = "";
    preloadModule("https://cdn.test/mod.js", { crossOrigin: "anonymous" });
    expect(
      document.head.querySelector(
        'link[rel="modulepreload"][href="https://cdn.test/mod.js"]',
      ),
    ).not.toBeNull();
  });

  test("preinit with as=style emits a stylesheet link", () => {
    document.head.innerHTML = "";
    preinit("https://cdn.test/styles.css", {
      as: "style",
      precedence: "high",
    });
    const link = document.head.querySelector(
      'link[rel="stylesheet"][href="https://cdn.test/styles.css"]',
    );
    expect(link?.getAttribute("data-precedence")).toBe("high");
  });

  test("preinit with as=script emits a <script> tag", () => {
    document.head.innerHTML = "";
    preinit("https://cdn.test/main.js", { as: "script" });
    expect(
      document.head.querySelector('script[src="https://cdn.test/main.js"]'),
    ).not.toBeNull();
  });

  test("preinitModule emits a <script type=\"module\">", () => {
    document.head.innerHTML = "";
    preinitModule("https://cdn.test/mod.js");
    const script = document.head.querySelector('script[src="https://cdn.test/mod.js"]');
    expect(script?.getAttribute("type")).toBe("module");
  });

  test("preinit script form is idempotent for the same src", () => {
    document.head.innerHTML = "";
    preinit("https://cdn.test/once.js", { as: "script" });
    preinit("https://cdn.test/once.js", { as: "script" });
    expect(
      document.head.querySelectorAll('script[src="https://cdn.test/once.js"]').length,
    ).toBe(1);
  });

  test("preinitModule is idempotent for the same href", () => {
    document.head.innerHTML = "";
    preinitModule("https://cdn.test/once.js");
    preinitModule("https://cdn.test/once.js");
    expect(
      document.head.querySelectorAll('script[src="https://cdn.test/once.js"]').length,
    ).toBe(1);
  });
});
