import fc from "fast-check";
import { describe, expect, test } from "vitest";
import { contentSecurityPolicy, responseHeadersContainCspNonce } from "../src/csp.js";

const directiveName = fc.stringMatching(/^[a-z][a-z0-9-]{0,20}$/);
const directiveValue = fc.stringMatching(/^[A-Za-z0-9+/_:.*=-]{1,30}$/);
const nonce = fc.stringMatching(/^[A-Za-z0-9+/_=-]{1,30}$/);

describe("CSP properties", () => {
  test("detects generated nonce source tokens at valid header boundaries", () => {
    fc.assert(
      fc.property(nonce, fc.constantFrom("", " ", ";", ","), (generatedNonce, boundary) => {
        const prefix = boundary === "" ? "" : `default-src 'self'${boundary}`;
        const headers = new Headers({
          "content-security-policy": `${prefix}'nonce-${generatedNonce}'`,
        });

        expect(responseHeadersContainCspNonce(headers)).toBe(true);
      }),
      { numRuns: 500 },
    );
  });

  test("serializes generated directives in insertion order without changing tokens", () => {
    const entries = fc.uniqueArray(
      fc.tuple(directiveName, fc.array(directiveValue, { minLength: 1, maxLength: 4 })),
      {
        maxLength: 8,
        selector: ([name]) => name,
      },
    );

    fc.assert(
      fc.property(entries, (pairs) => {
        const directives = Object.fromEntries(pairs);
        const expected = pairs.map(([name, values]) => `${name} ${values.join(" ")}`).join("; ");

        expect(contentSecurityPolicy({ directives })).toBe(expected || undefined);
      }),
      { numRuns: 500 },
    );
  });

  test("adds a valid nonce only to exact script-src and style-src names", () => {
    fc.assert(
      fc.property(nonce, directiveValue, (generatedNonce, value) => {
        expect(
          contentSecurityPolicy({
            nonce: generatedNonce,
            directives: {
              "script-src": value,
              "style-src": value,
              "default-src": value,
            },
          }),
        ).toBe(
          `script-src ${value} 'nonce-${generatedNonce}'; style-src ${value} 'nonce-${generatedNonce}'; default-src ${value}`,
        );
      }),
      { numRuns: 500 },
    );
  });

  test("rejects generated directive tokens containing a delimiter or control character", () => {
    fc.assert(
      fc.property(
        directiveValue,
        fc.constantFrom(";", '"', "'", " ", "\t", "\r", "\n", "\u007f"),
        directiveValue,
        (left, delimiter, right) => {
          expect(() =>
            contentSecurityPolicy({
              directives: { "default-src": `${left}${delimiter}${right}` },
            }),
          ).toThrow(/invalid CSP directive value/);
        },
      ),
      { numRuns: 500 },
    );
  });

  test("rejects generated nonces containing a delimiter or control character", () => {
    fc.assert(
      fc.property(
        nonce,
        fc.constantFrom(";", "'", '"', " ", "\t", "\r", "\n", "\u007f"),
        nonce,
        (left, delimiter, right) => {
          expect(() =>
            contentSecurityPolicy({
              nonce: `${left}${delimiter}${right}`,
              directives: { "script-src": "'self'" },
            }),
          ).toThrow(/invalid CSP nonce/);
        },
      ),
      { numRuns: 500 },
    );
  });
});
