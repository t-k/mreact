import { describe, expect, test } from "vitest";
import { assetHref, assetPreloadLinks, defineMessages, detectLocale } from "../src/index.js";

describe("mreact router i18n and asset helpers", () => {
  test("detects locale from a path prefix before accept-language", () => {
    const result = detectLocale(new Request("https://example.test/ja/dashboard"), {
      defaultLocale: "en",
      locales: ["en", "ja"],
    });

    expect(result).toEqual({
      locale: "ja",
      pathname: "/dashboard",
      source: "path",
    });
  });

  test("falls back to accept-language and typed message definitions", () => {
    const result = detectLocale(
      new Request("https://example.test/dashboard", {
        headers: { "accept-language": "fr-CA, ja;q=0.8, en;q=0.2" },
      }),
      {
        defaultLocale: "en",
        locales: ["en", "ja", "fr"],
      },
    );
    const messages = defineMessages({
      title: "Tableau de bord",
      actions: {
        save: "Enregistrer",
      },
    });

    expect(result).toEqual({
      locale: "fr",
      pathname: "/dashboard",
      source: "accept-language",
    });
    expect(messages.actions.save).toBe("Enregistrer");
  });

  test("creates asset hrefs and preload link descriptors from a build manifest", () => {
    const manifest = {
      "app/page.tsx": {
        assets: ["assets/logo.1234.svg"],
        css: ["assets/page.abcd.css"],
        file: "assets/page.1234.js",
      },
    };

    expect(assetHref(manifest, "app/page.tsx")).toBe("/assets/page.1234.js");
    expect(assetPreloadLinks(manifest, "app/page.tsx")).toEqual([
      {
        attrs: {
          href: "/assets/page.1234.js",
          rel: "modulepreload",
        },
        tag: "link",
      },
      {
        attrs: {
          href: "/assets/page.abcd.css",
          rel: "stylesheet",
        },
        tag: "link",
      },
      {
        attrs: {
          as: "image",
          href: "/assets/logo.1234.svg",
          rel: "preload",
        },
        tag: "link",
      },
    ]);
  });
});
