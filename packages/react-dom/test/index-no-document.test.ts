// @vitest-environment node

import { describe, expect, test } from "vitest";
import {
  preconnect,
  prefetchDNS,
  preinit,
  preinitModule,
  preload,
  preloadModule,
} from "../src/index.js";

describe("react-dom/index helpers in a non-DOM (Node) environment", () => {
  test("prefetchDNS / preconnect / preload / preinit / preloadModule / preinitModule are no-ops without a document", () => {
    expect(typeof document).toBe("undefined");
    expect(() => prefetchDNS("https://a.test/")).not.toThrow();
    expect(() => preconnect("https://a.test/", { crossOrigin: "anonymous" })).not.toThrow();
    expect(() =>
      preload("https://a.test/img", {
        as: "image",
        imageSrcSet: "a 1x",
      }),
    ).not.toThrow();
    expect(() => preloadModule("https://a.test/m.js")).not.toThrow();
    expect(() =>
      preinit("https://a.test/m.css", {
        as: "style",
        precedence: "high",
      }),
    ).not.toThrow();
    expect(() => preinit("https://a.test/m.js", { as: "script" })).not.toThrow();
    expect(() => preinitModule("https://a.test/m.js")).not.toThrow();
  });
});
