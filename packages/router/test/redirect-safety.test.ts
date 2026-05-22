import { describe, expect, test } from "vitest";
import { redirect, redirectExternal } from "../src/navigation.js";

function captureRedirect(fn: () => never): {
  location?: string;
  status?: number;
  threw: boolean;
  error?: unknown;
} {
  try {
    fn();
    return { threw: false };
  } catch (error) {
    const { location, status } = error as {
      location?: unknown;
      status?: unknown;
    };
    return {
      threw: true,
      location: typeof location === "string" ? location : undefined,
      status: typeof status === "number" ? status : undefined,
      error,
    };
  }
}

describe("redirect() safety (Issue 061)", () => {
  test("rejects protocol-relative `//evil.com`", () => {
    expect(() => redirect("//evil.com/path")).toThrow(/unsafe redirect/);
  });

  test("rejects backslash trick `/\\evil.com`", () => {
    expect(() => redirect("/\\evil.com")).toThrow(/unsafe redirect/);
  });

  test("rejects double backslash `\\\\evil.com`", () => {
    expect(() => redirect("\\\\evil.com")).toThrow(/unsafe redirect/);
  });

  test("rejects absolute http(s) URLs", () => {
    expect(() => redirect("https://evil.com/path")).toThrow(/unsafe redirect/);
    expect(() => redirect("http://evil.com/path")).toThrow(/unsafe redirect/);
  });

  test("rejects `javascript:` scheme", () => {
    expect(() => redirect("javascript:alert(1)")).toThrow(/unsafe redirect/);
  });

  test("rejects `data:` scheme", () => {
    expect(() => redirect("data:text/html,<script>alert(1)</script>")).toThrow(
      /unsafe redirect/,
    );
  });

  test("rejects `vbscript:` scheme", () => {
    expect(() => redirect("vbscript:msgbox(1)")).toThrow(/unsafe redirect/);
  });

  test("rejects leading whitespace + protocol-relative", () => {
    expect(() => redirect("   //evil.com")).toThrow(/unsafe redirect/);
  });

  test("rejects leading control character before scheme", () => {
    expect(() => redirect("javascript:alert(1)")).toThrow(
      /unsafe redirect/,
    );
  });

  test("rejects empty string", () => {
    expect(() => redirect("")).toThrow(/unsafe redirect/);
  });

  test("accepts path-absolute `/foo`", () => {
    const result = captureRedirect(() => redirect("/foo"));
    expect(result.threw).toBe(true);
    expect(result.location).toBe("/foo");
    expect(result.status).toBe(303);
  });

  test("accepts path-absolute with query and hash", () => {
    const result = captureRedirect(() => redirect("/foo?bar=1#baz"));
    expect(result.location).toBe("/foo?bar=1#baz");
  });

  test("accepts query-only redirect", () => {
    const result = captureRedirect(() => redirect("?next=1"));
    expect(result.location).toBe("?next=1");
  });

  test("accepts hash-only redirect", () => {
    const result = captureRedirect(() => redirect("#section"));
    expect(result.location).toBe("#section");
  });

  test("accepts relative path `foo`", () => {
    const result = captureRedirect(() => redirect("foo"));
    expect(result.location).toBe("foo");
  });

  test("accepts custom status code", () => {
    const result = captureRedirect(() => redirect("/foo", { status: 301 }));
    expect(result.status).toBe(301);
  });
});

describe("redirectExternal() safety (Issue 061)", () => {
  test("accepts https URL", () => {
    const result = captureRedirect(() =>
      redirectExternal("https://example.com/path"),
    );
    expect(result.location).toBe("https://example.com/path");
    expect(result.status).toBe(307);
  });

  test("accepts http URL", () => {
    const result = captureRedirect(() =>
      redirectExternal("http://example.com/path"),
    );
    expect(result.location).toBe("http://example.com/path");
  });

  test("rejects `javascript:` even via redirectExternal", () => {
    expect(() => redirectExternal("javascript:alert(1)")).toThrow(
      /unsafe redirect/,
    );
  });

  test("rejects `data:` even via redirectExternal", () => {
    expect(() => redirectExternal("data:text/html,x")).toThrow(/unsafe redirect/);
  });

  test("rejects protocol-relative via redirectExternal", () => {
    expect(() => redirectExternal("//evil.com")).toThrow(/unsafe redirect/);
  });

  test("rejects path-relative (use redirect() instead)", () => {
    expect(() => redirectExternal("/foo")).toThrow(/unsafe redirect/);
  });
});
