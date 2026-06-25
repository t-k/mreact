import { describe, expect, test } from "vitest";
import {
  cookies,
  headers,
  html,
  isNotFoundError,
  isRedirectError,
  json,
  next,
  parseForm,
  notFound,
  redirect303,
  redirect,
  redirectExternal,
  rewrite,
  rewriteLocation,
  textError,
  throwNotFound,
} from "../src/navigation.js";

describe("router navigation helpers", () => {
  test("redirect() throws a RedirectError with the default status 303 and location", () => {
    try {
      redirect("/login");
    } catch (error) {
      expect(isRedirectError(error)).toBe(true);
      expect((error as Error & { location: string; status: number }).location).toBe("/login");
      expect((error as Error & { location: string; status: number }).status).toBe(303);
      return;
    }
    throw new Error("expected redirect to throw");
  });

  test("redirect() honors an explicit options.status", () => {
    try {
      redirect("/perma", { status: 301 });
    } catch (error) {
      expect((error as Error & { status: number }).status).toBe(301);
      return;
    }
    throw new Error("expected redirect to throw");
  });

  test("redirect303() returns a safe redirect-after-post response", () => {
    const response = redirect303("/admin-users", {
      headers: { "set-cookie": "session=next; Path=/" },
    });

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/admin-users");
    expect(response.headers.get("set-cookie")).toBe("session=next; Path=/");
    expect(() => redirect303("//evil.test")).toThrow(/unsafe redirect target/);
  });

  test("textError() returns a plain text error response", async () => {
    const response = textError("Invalid form data.", 422);

    expect(response.status).toBe(422);
    expect(response.headers.get("content-type")).toBe("text/plain; charset=utf-8");
    await expect(response.text()).resolves.toBe("Invalid form data.");
  });

  test("parseForm() parses FormData and optionally validates through a schema", async () => {
    const request = new Request("https://app.test/users", {
      body: new URLSearchParams({ id: "42" }),
      method: "POST",
    });
    const parsed = await parseForm(request, {
      parse(form) {
        return { id: Number(form.get("id")) };
      },
    });

    expect(parsed).toEqual({ id: 42 });
  });

  test("redirect() rejects protocol-relative / scheme / backslash URLs", () => {
    expect(() => redirect("//evil.test")).toThrow(/unsafe redirect target/);
    expect(() => redirect("/\\evil")).toThrow(/unsafe redirect target/);
    expect(() => redirect("\\evil")).toThrow(/unsafe redirect target/);
    expect(() => redirect("javascript:alert(1)")).toThrow(/unsafe redirect target/);
    expect(() => redirect("")).toThrow(/unsafe redirect target/);
  });

  test("redirect() and rewrite() reject embedded control characters", () => {
    for (const value of ["/admin\tpanel", "/admin\npanel", "/admin\rpanel", "/admin\u0000panel"]) {
      expect(() => redirect(value)).toThrow(/unsafe redirect target/);
      expect(() => rewrite(value)).toThrow(/unsafe rewrite target/);
      expect(() => redirect303(value)).toThrow(/unsafe redirect target/);
    }

    expect(() => redirectExternal("https://example.com/\nnext")).toThrow(
      /unsafe redirect target/,
    );
  });

  test("redirectExternal() only allows http(s) targets", () => {
    expect(() => redirectExternal("javascript:alert(1)")).toThrow(/unsafe redirect target/);
    expect(() => redirectExternal("ftp://example.com/")).toThrow(/unsafe redirect target/);
    expect(() => redirectExternal("/relative")).toThrow(/unsafe redirect target/);

    try {
      redirectExternal("https://safe.example/");
    } catch (error) {
      expect(isRedirectError(error)).toBe(true);
      expect((error as Error & { location: string }).location).toBe("https://safe.example/");
    }
  });

  test("notFound() throws a NotFound error recognized by isNotFoundError", () => {
    try {
      notFound();
    } catch (error) {
      expect(isNotFoundError(error)).toBe(true);
      expect((error as Error & { status: number }).status).toBe(404);
      return;
    }
    throw new Error("expected notFound to throw");
  });

  test("throwNotFound() throws the same NotFound error shape as notFound()", () => {
    try {
      throwNotFound();
    } catch (error) {
      expect(isNotFoundError(error)).toBe(true);
      expect((error as Error & { status: number }).status).toBe(404);
      return;
    }
    throw new Error("expected throwNotFound to throw");
  });

  test("next() returns undefined to let the middleware pipeline continue", () => {
    expect(next()).toBeUndefined();
  });

  test("rewrite() marks the Response with the rewrite location for rewriteLocation()", () => {
    const response = rewrite("/internal-target");
    expect(response.status).toBe(200);
    expect(rewriteLocation(response)).toBe("/internal-target");
  });

  test("rewriteLocation() falls back to the x-mreact-rewrite header when the symbol is absent", () => {
    const response = new Response(null, {
      headers: { "x-mreact-rewrite": "/from-header" },
    });
    expect(rewriteLocation(response)).toBe("/from-header");
  });

  test("rewriteLocation() rejects protocol-relative / scheme / backslash targets", () => {
    for (const location of ["//evil.test", "/\\evil", "\\evil", "https://evil.test/x", "javascript:alert(1)", ""]) {
      expect(rewriteLocation(new Response(null, {
        headers: { "x-mreact-rewrite": location },
      }))).toBeUndefined();
      expect(() => rewrite(location)).toThrow(/unsafe rewrite target/);
    }
  });

  test("rewriteLocation() returns undefined for an ordinary Response", () => {
    expect(rewriteLocation(new Response("body"))).toBeUndefined();
  });

  test("json() and html() set sensible content types and pass through init", async () => {
    const j = json({ ok: true });
    expect(j.headers.get("content-type")).toMatch(/application\/json/);
    await expect(j.json()).resolves.toEqual({ ok: true });

    const h = html("<p>hi</p>", { status: 201 });
    expect(h.status).toBe(201);
    expect(h.headers.get("content-type")).toBe("text/html; charset=utf-8");
    await expect(h.text()).resolves.toBe("<p>hi</p>");
  });

  test("html() preserves a caller-provided content-type", async () => {
    const h = html("<p/>", { headers: { "content-type": "application/xhtml+xml" } });
    expect(h.headers.get("content-type")).toBe("application/xhtml+xml");
  });

  test("html() avoids constructing Headers for the default content-type path", async () => {
    const OriginalHeaders = globalThis.Headers;
    let headerAllocations = 0;

    class CountingHeaders extends OriginalHeaders {
      constructor(init?: HeadersInit) {
        headerAllocations += 1;
        super(init);
      }
    }

    globalThis.Headers = CountingHeaders;

    try {
      const h = html("<p/>");

      expect(h.headers.get("content-type")).toBe("text/html; charset=utf-8");
      expect(headerAllocations).toBe(0);
    } finally {
      globalThis.Headers = OriginalHeaders;
    }
  });

  test("headers() simply returns the request.headers reference", () => {
    const req = new Request("https://app.test/", { headers: { "x-test": "y" } });
    expect(headers(req).get("x-test")).toBe("y");
  });

  test("cookies() parses key=value pairs and decodes percent-escapes", () => {
    const req = new Request("https://app.test/", {
      headers: { cookie: "a=1; b=%E3%81%82" },
    });
    const c = cookies(req);
    expect(c.get("a")).toBe("1");
    expect(c.get("b")).toBe("あ");
    expect(c.has("a")).toBe(true);
    expect(c.has("z")).toBe(false);
    expect(Array.from(c.entries())).toEqual([
      ["a", "1"],
      ["b", "あ"],
    ]);
  });

  test("cookies() defers reading the cookie header until values are inspected", () => {
    const req = new Request("https://app.test/", {
      headers: { cookie: "a=1" },
    });
    const get = req.headers.get.bind(req.headers);
    let reads = 0;
    req.headers.get = ((name) => {
      if (name.toLowerCase() === "cookie") {
        reads += 1;
      }
      return get(name);
    }) as typeof req.headers.get;

    const c = cookies(req);

    expect(reads).toBe(0);
    expect(c.get("a")).toBe("1");
    expect(reads).toBe(1);
    expect(c.has("a")).toBe(true);
    expect(reads).toBe(1);
  });

  test("cookies() returns an empty bag when there is no cookie header", () => {
    const c = cookies(new Request("https://app.test/"));
    expect(Array.from(c.entries())).toEqual([]);
    expect(c.get("any")).toBeUndefined();
  });

  test("cookies() skips malformed percent-escapes rather than throwing", () => {
    const req = new Request("https://app.test/", { headers: { cookie: "a=%ZZ; b=2" } });
    const c = cookies(req);
    expect(c.has("a")).toBe(false);
    expect(c.get("b")).toBe("2");
  });

  test("cookies() ignores empty pairs and pairs with no name", () => {
    const req = new Request("https://app.test/", { headers: { cookie: "; =1; a=2" } });
    const c = cookies(req);
    expect(c.has("a")).toBe(true);
    expect(c.get("a")).toBe("2");
  });

  test("isRedirectError rejects non-redirect errors", () => {
    expect(isRedirectError(new Error("plain"))).toBe(false);
    expect(isRedirectError("not an error")).toBe(false);
  });
});
