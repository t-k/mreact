import { describe, expect, test } from "vitest";
import { contentSecurityPolicy } from "../src/csp.js";

describe("contentSecurityPolicy() validation (Issue 063)", () => {
  test("returns undefined when no directives provided", () => {
    expect(contentSecurityPolicy(undefined)).toBeUndefined();
    expect(contentSecurityPolicy({})).toBeUndefined();
    expect(contentSecurityPolicy({ directives: {} })).toBeUndefined();
    expect(contentSecurityPolicy({ nonce: "abc" })).toBeUndefined();
  });

  test("serializes a basic directive", () => {
    expect(
      contentSecurityPolicy({
        directives: { "default-src": "'self'" },
      }),
    ).toBe("default-src 'self'");
  });

  test("serializes multiple directives joined by '; '", () => {
    expect(
      contentSecurityPolicy({
        directives: {
          "default-src": "'self'",
          "img-src": ["'self'", "https:"],
        },
      }),
    ).toBe("default-src 'self'; img-src 'self' https:");
  });

  test("appends nonce to script-src and style-src", () => {
    expect(
      contentSecurityPolicy({
        nonce: "abc123",
        directives: { "script-src": ["'self'"] },
      }),
    ).toBe("script-src 'self' 'nonce-abc123'");

    expect(
      contentSecurityPolicy({
        nonce: "abc123",
        directives: { "style-src": ["'self'"] },
      }),
    ).toBe("style-src 'self' 'nonce-abc123'");
  });

  test("does NOT append nonce to other directives", () => {
    expect(
      contentSecurityPolicy({
        nonce: "abc123",
        directives: { "default-src": ["'self'"] },
      }),
    ).toBe("default-src 'self'");
  });

  test("rejects nonce containing single quote (nonce escape)", () => {
    expect(() =>
      contentSecurityPolicy({
        nonce: "abc'; script-src 'unsafe-inline",
        directives: { "script-src": ["'self'"] },
      }),
    ).toThrow(/invalid CSP nonce/);
  });

  test("rejects nonce containing semicolon", () => {
    expect(() =>
      contentSecurityPolicy({
        nonce: "abc;def",
        directives: { "script-src": ["'self'"] },
      }),
    ).toThrow(/invalid CSP nonce/);
  });

  test("rejects nonce containing whitespace", () => {
    expect(() =>
      contentSecurityPolicy({
        nonce: "abc def",
        directives: { "script-src": ["'self'"] },
      }),
    ).toThrow(/invalid CSP nonce/);
  });

  test("accepts base64 / base64url nonces", () => {
    expect(() =>
      contentSecurityPolicy({
        nonce: "AbCd+/=",
        directives: { "script-src": ["'self'"] },
      }),
    ).not.toThrow();

    expect(() =>
      contentSecurityPolicy({
        nonce: "AbCd-_=",
        directives: { "script-src": ["'self'"] },
      }),
    ).not.toThrow();
  });

  test("rejects directive value containing `;` (directive escape)", () => {
    expect(() =>
      contentSecurityPolicy({
        directives: {
          "default-src": ["'self'; script-src 'unsafe-inline'"],
        },
      }),
    ).toThrow(/invalid CSP directive value/);
  });

  test("rejects directive value containing whitespace inside a single token", () => {
    expect(() =>
      contentSecurityPolicy({
        directives: {
          "default-src": ["'self' 'unsafe-inline'"],
        },
      }),
    ).toThrow(/invalid CSP directive value/);
  });

  test("rejects directive value containing double quote", () => {
    expect(() =>
      contentSecurityPolicy({
        directives: { "default-src": ['"self"'] },
      }),
    ).toThrow(/invalid CSP directive value/);
  });

  test("rejects directive value containing ASCII control chars", () => {
    expect(() =>
      contentSecurityPolicy({
        directives: { "default-src": ["self\nfoo"] },
      }),
    ).toThrow(/invalid CSP directive value/);
  });

  test("rejects invalid directive name", () => {
    expect(() =>
      contentSecurityPolicy({
        directives: { "bogus name": "'self'" },
      }),
    ).toThrow(/invalid CSP directive name/);
  });

  test("accepts hash-source quoted keywords", () => {
    expect(
      contentSecurityPolicy({
        directives: {
          "script-src": ["'sha256-AbCdEf='"],
        },
      }),
    ).toBe("script-src 'sha256-AbCdEf='");
  });

  test("accepts wildcard and scheme sources", () => {
    expect(
      contentSecurityPolicy({
        directives: {
          "img-src": ["*", "https:", "data:"],
        },
      }),
    ).toBe("img-src * https: data:");
  });
});
