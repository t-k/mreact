import { describe, expect, test, vi } from "vitest";
import { deleteCookie, parseCookieHeader, serializeCookie, setCookie } from "../src/cookies.js";

describe("router cookie helpers", () => {
  test("serializeCookie omits every optional attribute by default", () => {
    expect(serializeCookie("session", "value")).toBe("session=value");
  });

  test("serializeCookie emits safe attributes in deterministic order", () => {
    expect(
      serializeCookie("session", "a b;c", {
        httpOnly: true,
        maxAge: 60,
        path: "/",
        sameSite: "Lax",
        secure: true,
      }),
    ).toBe("session=a%20b%3Bc; Max-Age=60; Path=/; HttpOnly; Secure; SameSite=Lax");
  });

  test("serializeCookie includes every supported attribute and rejects invalid Max-Age", () => {
    const expires = new Date("2030-01-02T03:04:05.000Z");

    expect(
      serializeCookie("session", "value", {
        domain: "example.test",
        expires,
        httpOnly: true,
        maxAge: -1,
        path: "/account",
        sameSite: "Strict",
        secure: true,
      }),
    ).toBe(
      "session=value; Max-Age=-1; Domain=example.test; Path=/account; Expires=Wed, 02 Jan 2030 03:04:05 GMT; HttpOnly; Secure; SameSite=Strict",
    );
    expect(() => serializeCookie("session", "value", { maxAge: 1.5 })).toThrow(
      /invalid cookie Max-Age/,
    );
    expect(() =>
      serializeCookie("session", "value", { maxAge: Number.MAX_SAFE_INTEGER + 1 }),
    ).toThrow(/invalid cookie Max-Age/);
  });

  test("serializeCookie rejects invalid names and attribute injection", () => {
    expect(() => serializeCookie("bad name", "x")).toThrow(/invalid cookie name/i);
    expect(() => serializeCookie("bad;name", "x")).toThrow(/invalid cookie name/i);
    expect(() => serializeCookie("ok", "x", { path: "/\r\nx: y" })).toThrow(
      /invalid cookie attribute/i,
    );
    expect(() => serializeCookie("ok", "x", { domain: "example.test; Secure" })).toThrow(
      /invalid cookie attribute/i,
    );
  });

  test("SameSite=None requires Secure", () => {
    expect(() => serializeCookie("sid", "x", { sameSite: "None" })).toThrow(
      /SameSite=None requires Secure/i,
    );
    expect(serializeCookie("sid", "x", { sameSite: "None", secure: true })).toContain(
      "SameSite=None",
    );
  });

  test("__Secure- and __Host- cookie prefixes enforce browser invariants", () => {
    expect(() => serializeCookie("__Secure-session", "x")).toThrow(
      /__Secure- cookies require Secure/i,
    );
    expect(() => serializeCookie("__Host-session", "x", { secure: true })).toThrow(
      /__Host- cookies require Path=\/+/i,
    );
    expect(() => serializeCookie("__Host-session", "x", { path: "/" })).toThrow(
      /__Host- cookies require Secure/i,
    );
    expect(() =>
      serializeCookie("__Host-session", "x", {
        domain: "example.test",
        path: "/",
        secure: true,
      }),
    ).toThrow(/__Host- cookies must not set Domain/i);
    expect(serializeCookie("__Host-session", "x", { path: "/", secure: true })).toBe(
      "__Host-session=x; Path=/; Secure",
    );
  });

  test("setCookie appends without replacing existing Set-Cookie headers", () => {
    const response = new Response("ok");
    setCookie(response, "a", "1", { path: "/" });
    setCookie(response, "b", "2", { path: "/" });
    expect(response.headers.get("set-cookie")).toContain("a=1; Path=/");
    expect(response.headers.get("set-cookie")).toContain("b=2; Path=/");
  });

  test("deleteCookie emits a Max-Age=0 tombstone", () => {
    const response = new Response(null);
    deleteCookie(response, "session", { path: "/", sameSite: "Lax", secure: true });
    expect(response.headers.get("set-cookie")).toBe(
      "session=; Max-Age=0; Path=/; Secure; SameSite=Lax",
    );
  });

  test("parseCookieHeader decodes values and skips malformed percent escapes", () => {
    const values = parseCookieHeader("a=1; b=%E3%81%82; bad=%ZZ; empty=");
    expect(values.get("a")).toBe("1");
    expect(values.get("b")).toBe("あ");
    expect(values.has("bad")).toBe(false);
    expect(values.get("empty")).toBe("");
  });

  test("parseCookieHeader handles absent, empty, duplicate, and equals-containing values", () => {
    expect(parseCookieHeader(undefined)).toEqual(new Map());
    expect(parseCookieHeader(null)).toEqual(new Map());
    expect(parseCookieHeader(" ; =ignored; token=a=b=c; token=last")).toEqual(
      new Map([["token", "last"]]),
    );
  });

  test("parseCookieHeader skips URI decoding for raw cookie values without percent escapes", () => {
    const decode = vi.spyOn(globalThis, "decodeURIComponent");

    try {
      const values = parseCookieHeader("sid=abc123; theme=dark");

      expect(values.get("sid")).toBe("abc123");
      expect(values.get("theme")).toBe("dark");
      expect(decode).not.toHaveBeenCalled();
    } finally {
      decode.mockRestore();
    }
  });
});
