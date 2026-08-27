import fc from "fast-check";
import { describe, expect, test } from "vitest";
import {
  isUnsafeMetaRefreshContent,
  isUnsafeUrlAttribute,
  safeUrlAttributeValue,
} from "../src/url-safety.js";

const blockedScheme = fc.constantFrom(
  "javascript",
  "data",
  "vbscript",
  "livescript",
  "mhtml",
  "file",
);
const singleUrlSink = fc.constantFrom("href", "action", "formaction", "xlink:href");
const c0Prefix = fc
  .array(fc.integer({ min: 0, max: 0x20 }), { maxLength: 8 })
  .map((codes) => String.fromCharCode(...codes));
const schemeNoise = fc.constantFrom("", "\t", "\r", "\n", "\t\n");

function varyCase(value: string, mask: number): string {
  return [...value]
    .map((character, index) => (((mask >>> index) & 1) === 0 ? character : character.toUpperCase()))
    .join("");
}

describe("URL safety properties", () => {
  test("rejects blocked schemes after C0 prefixes, casing changes, and embedded ASCII whitespace", () => {
    fc.assert(
      fc.property(
        blockedScheme,
        singleUrlSink,
        c0Prefix,
        schemeNoise,
        fc.nat(),
        (scheme, sink, prefix, noise, mask) => {
          const split = mask % (scheme.length + 1);
          const value = `${prefix}${varyCase(scheme.slice(0, split), mask)}${noise}${varyCase(scheme.slice(split), ~mask)}:payload`;

          expect(isUnsafeUrlAttribute(sink, value)).toBe(true);
          expect(safeUrlAttributeValue(sink, value)).toBeUndefined();
        },
      ),
      { numRuns: 500 },
    );
  });

  test("preserves generated relative HTTPS, mailto, and tel values exactly", () => {
    const safeValue = fc.oneof(
      fc.stringMatching(/^\/[A-Za-z0-9/_-]{0,40}$/),
      fc.stringMatching(/^https:\/\/example\.test\/[A-Za-z0-9/_-]{0,40}$/),
      fc.stringMatching(/^mailto:[A-Za-z0-9._-]{1,20}@example\.test$/),
      fc.stringMatching(/^tel:\+[0-9]{1,20}$/),
    );

    fc.assert(
      fc.property(safeValue, (value) => {
        expect(isUnsafeUrlAttribute("href", value)).toBe(false);
        expect(safeUrlAttributeValue("href", value)).toBe(value);
      }),
      { numRuns: 500 },
    );
  });

  test("taints a srcset when any generated candidate has a blocked scheme", () => {
    fc.assert(
      fc.property(blockedScheme, fc.nat(), (scheme, mask) => {
        const unsafe = `${varyCase(scheme, mask)}:payload`;

        expect(isUnsafeUrlAttribute("srcset", `/safe.png 1x, ${unsafe} 2x`)).toBe(true);
      }),
      { numRuns: 500 },
    );
  });

  test("applies the same blocked-scheme rule to generated meta refresh redirects", () => {
    fc.assert(
      fc.property(blockedScheme, fc.boolean(), (scheme, quoted) => {
        const url = `${scheme}:payload`;
        const target = quoted ? `'${url}'` : url;

        expect(isUnsafeMetaRefreshContent("refresh", `0; url=${target}`)).toBe(true);
      }),
      { numRuns: 500 },
    );
  });
});
