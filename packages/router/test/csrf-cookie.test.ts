import { afterEach, describe, expect, test } from "vitest";
import { serverActionCookie, validateFormCsrf } from "../src/actions.js";

const originalEnv = process.env.NODE_ENV;

afterEach(() => {
  process.env.NODE_ENV = originalEnv;
});

describe("serverActionCookie() hardening (Issue 064)", () => {
  test("development: cookie has HttpOnly + SameSite=Lax but no Secure", () => {
    process.env.NODE_ENV = "development";
    const value = serverActionCookie("token-1234");
    expect(value.startsWith("mreact.csrf=")).toBe(true);
    expect(value).toMatch(/;\s*HttpOnly/i);
    expect(value).toMatch(/;\s*SameSite=Lax/i);
    expect(value).toMatch(/;\s*Path=\//i);
    expect(value).not.toMatch(/;\s*Secure(?:;|\s|$)/i);
  });

  test("production: __Host- prefix with Secure + HttpOnly", () => {
    process.env.NODE_ENV = "production";
    const value = serverActionCookie("token-1234");
    expect(value.startsWith("__Host-mreact.csrf=")).toBe(true);
    expect(value).toMatch(/;\s*Path=\//i);
    expect(value).toMatch(/;\s*SameSite=Lax/i);
    expect(value).toMatch(/;\s*Secure(?:;|$)/i);
    expect(value).toMatch(/;\s*HttpOnly/i);
  });

  test("staging: uses __Host- prefix with Secure + HttpOnly", () => {
    process.env.NODE_ENV = "staging";
    const value = serverActionCookie("token-1234");
    expect(value.startsWith("__Host-mreact.csrf=")).toBe(true);
    expect(value).toMatch(/;\s*Path=\//i);
    expect(value).toMatch(/;\s*SameSite=Lax/i);
    expect(value).toMatch(/;\s*Secure(?:;|$)/i);
    expect(value).toMatch(/;\s*HttpOnly/i);
  });

  test("production: __Host- requirement — no Domain attribute", () => {
    process.env.NODE_ENV = "production";
    const value = serverActionCookie("token-1234");
    expect(value).not.toMatch(/;\s*Domain=/i);
  });

  test("URL-encodes the token", () => {
    process.env.NODE_ENV = "production";
    const value = serverActionCookie("a b;c=d");
    expect(value).toContain("a%20b%3Bc%3Dd");
  });

  test("production: rejects the development CSRF cookie name", () => {
    process.env.NODE_ENV = "production";
    const form = new FormData();
    form.set("__mreact_csrf", "token-1234");

    const response = validateFormCsrf(
      new Request("https://app.test/action", {
        headers: { cookie: "mreact.csrf=token-1234" },
        method: "POST",
      }),
      form,
    );

    expect(response?.status).toBe(403);
  });

  test("staging: rejects the development CSRF cookie name", () => {
    process.env.NODE_ENV = "staging";
    const form = new FormData();
    form.set("__mreact_csrf", "token-1234");

    const response = validateFormCsrf(
      new Request("https://app.test/action", {
        headers: { cookie: "mreact.csrf=token-1234" },
        method: "POST",
      }),
      form,
    );

    expect(response?.status).toBe(403);
  });

  test("production: accepts the __Host CSRF cookie name", () => {
    process.env.NODE_ENV = "production";
    const form = new FormData();
    form.set("__mreact_csrf", "token-1234");

    const response = validateFormCsrf(
      new Request("https://app.test/action", {
        headers: { cookie: "__Host-mreact.csrf=token-1234" },
        method: "POST",
      }),
      form,
    );

    expect(response).toBeUndefined();
  });

  test("development: still accepts the development CSRF cookie name", () => {
    process.env.NODE_ENV = "development";
    const form = new FormData();
    form.set("__mreact_csrf", "token-1234");

    const response = validateFormCsrf(
      new Request("http://local.test/action", {
        headers: { cookie: "mreact.csrf=token-1234" },
        method: "POST",
      }),
      form,
    );

    expect(response).toBeUndefined();
  });
});
