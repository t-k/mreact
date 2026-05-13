import { describe, expect, test } from "vitest";
import {
  deleteCookie,
  parseCookieHeader,
  serializeCookie,
  setCookie,
} from "../src/cookies.js";

describe("app-router cookie helpers", () => {
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
});
