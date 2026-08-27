import fc from "fast-check";
import { describe, expect, test } from "vitest";
import { parseCookieHeader, serializeCookie } from "../src/cookies.js";

const cookieName = fc.stringMatching(/^[A-Za-z][A-Za-z0-9_-]{0,20}$/);
const cookieValue = fc
  .array(fc.integer({ min: 0x20, max: 0x7e }), { maxLength: 60 })
  .map((codes) => String.fromCharCode(...codes));

describe("cookie properties", () => {
  test("round trips generated cookie names and values", () => {
    fc.assert(
      fc.property(cookieName, cookieValue, (name, value) => {
        const pair = serializeCookie(name, value).split(";", 1)[0] ?? "";

        expect(parseCookieHeader(pair).get(name)).toBe(value);
      }),
      { numRuns: 500 },
    );
  });

  test("uses the last generated value for duplicate cookie names", () => {
    fc.assert(
      fc.property(cookieName, cookieValue, cookieValue, (name, first, last) => {
        const header = `${name}=${encodeURIComponent(first)}; ${name}=${encodeURIComponent(last)}`;

        expect(parseCookieHeader(header).get(name)).toBe(last);
      }),
      { numRuns: 500 },
    );
  });

  test("isolates malformed percent escapes without losing valid neighbors", () => {
    fc.assert(
      fc.property(cookieName, cookieName, cookieValue, (leftName, rightName, value) => {
        fc.pre(leftName !== rightName && leftName !== "bad" && rightName !== "bad");
        const parsed = parseCookieHeader(
          `${leftName}=${encodeURIComponent(value)}; bad=%ZZ; ${rightName}=ok`,
        );

        expect(parsed.get(leftName)).toBe(value);
        expect(parsed.has("bad")).toBe(false);
        expect(parsed.get(rightName)).toBe("ok");
      }),
      { numRuns: 500 },
    );
  });

  test("enforces generated secure-prefix and SameSite combinations", () => {
    fc.assert(
      fc.property(cookieValue, fc.boolean(), (value, secure) => {
        const secureCookie = () => serializeCookie("__Secure-session", value, { secure });
        const noneCookie = () => serializeCookie("session", value, { sameSite: "None", secure });

        if (secure) {
          expect(secureCookie()).toContain("Secure");
          expect(noneCookie()).toContain("SameSite=None");
        } else {
          expect(secureCookie).toThrow(/require Secure/);
          expect(noneCookie).toThrow(/requires Secure/);
        }
      }),
      { numRuns: 500 },
    );
  });

  test("rejects generated CRLF and semicolon attribute injection", () => {
    fc.assert(
      fc.property(
        cookieValue,
        fc.constantFrom("\r", "\n", ";", "\r\n"),
        cookieValue,
        (left, delimiter, right) => {
          expect(() =>
            serializeCookie("session", "value", { path: `${left}${delimiter}${right}` }),
          ).toThrow(/invalid cookie attribute/);
        },
      ),
      { numRuns: 500 },
    );
  });
});
