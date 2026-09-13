import { AsyncLocalStorage } from "node:async_hooks";
import {
  installRequestStateStorage,
  runWithRequestState,
  type RequestStateScope,
} from "@reckona/mreact-reactive-core";
import { afterEach, expect, test } from "vitest";
import { routeCachePolicyFromOptions } from "../src/cache-policy.js";
import {
  applyCloudflareCachePolicy,
  beginCloudflareCacheScope,
  cacheControl,
  currentCloudflareCachePolicy,
  revalidatePath,
} from "../src/cloudflare-cache.js";

afterEach(() => installRequestStateStorage(new AsyncLocalStorage<RequestStateScope>()));

test("requires an active router request, not just an unrelated requestState scope", () => {
  installRequestStateStorage(new AsyncLocalStorage<RequestStateScope>());
  expect(() => cacheControl({ sMaxAge: 10 })).toThrow("app router request");
  expect(() => runWithRequestState(() => cacheControl({ sMaxAge: 10 }))).toThrow(
    "app router request",
  );
  installRequestStateStorage(undefined);
  expect(() => cacheControl({ sMaxAge: 10 })).toThrow("nodejs_compat");
  expect(beginCloudflareCacheScope()).toBeUndefined();
  expect(currentCloudflareCachePolicy()).toBeUndefined();
});

test("leaves public browser and proxy headers cacheable", () => {
  const request = new Request("https://app.test/", {
    headers: {
      "sec-fetch-user": "?1",
      "cf-connecting-ip": "192.0.2.1",
      "user-agent": "browser",
      "x-request-id": "trace",
      "x-auth-tokenized": "public",
      "x-bearerauthorization": "public",
      "x-visitor-user-agent": "public",
    },
  });
  const response = applyCloudflareCachePolicy(
    new Response("body"),
    request,
    { cacheControl: "s-maxage=60", revalidateSeconds: 60 },
    false,
  );
  expect(response.headers.get("cache-control")).toBe("s-maxage=60");
});

test.each([
  "proxy-authorization",
  "x-access-token",
  "x-id-token",
  "tenant-api-key",
  "tenant-auth-token",
  "tenant-session-id",
  "tenant-user",
  "tenant-user-email",
  "tenant-user-id",
  "tenant-jwt",
  "tenant-jwt-assertion",
])("protects custom credentials carried by %s", (header) => {
  const response = applyCloudflareCachePolicy(
    new Response("private"),
    new Request("https://app.test/", { headers: { [header]: "secret" } }),
    { cacheControl: "s-maxage=60", revalidateSeconds: 60 },
    false,
  );
  expect(response.headers.get("cache-control")).toBe("private, no-store");
});

test.each([
  " no-store ",
  "max-age=30, no-store , must-revalidate",
  "max-age=30, private , must-revalidate",
  "max-age=30, no-cache , must-revalidate",
])("preserves restrictive response directive whitespace (%s)", (value) => {
  const response = new Response("body", { headers: { "cache-control": value } });
  const normalized = response.headers.get("cache-control");
  applyCloudflareCachePolicy(
    response,
    new Request("https://app.test/"),
    { cacheControl: "s-maxage=60", revalidateSeconds: 60 },
    false,
  );
  expect(response.headers.get("cache-control")).toBe(normalized);
});

test.each(["no-store", "private", "max-age=30, private "])(
  "keeps an already private declared policy intact (%s)",
  (value) => {
    const response = applyCloudflareCachePolicy(
      new Response("body"),
      new Request("https://app.test/", { headers: { cookie: "session=secret" } }),
      { cacheControl: value, revalidateSeconds: 0 },
      true,
    );
    expect(response.headers.get("cache-control")).toBe(value.trim());
  },
);

test("rejects invalid cache options with actionable option names", () => {
  expect(() => routeCachePolicyFromOptions({ maxAge: -1 })).toThrow(
    "cacheControl() maxAge must be a non-negative integer.",
  );
  expect(() => routeCachePolicyFromOptions({ sMaxAge: -1 })).toThrow(
    "cacheControl() sMaxAge must be a non-negative integer.",
  );
  expect(() => routeCachePolicyFromOptions({ staleWhileRevalidate: -1 })).toThrow(
    "cacheControl() staleWhileRevalidate must be a non-negative integer.",
  );
  expect(() => routeCachePolicyFromOptions({ staleWhileRevalidate: false })).toThrow(
    "cacheControl() staleWhileRevalidate must be true or a non-negative integer.",
  );
});

test("reports unsupported Cloudflare path invalidation without importing Node storage", () => {
  expect(() => revalidatePath("/route")).toThrow("unavailable in Cloudflare workers");
});

test.each([
  [{ maxAge: 0 }, "max-age=0", 0],
  [{ maxAge: 30 }, "max-age=30", 0],
  [{ sMaxAge: 45, staleWhileRevalidate: 0 }, "s-maxage=45, stale-while-revalidate=0", 45],
  [
    { maxAge: 5, sMaxAge: 60, staleWhileRevalidate: true },
    "max-age=5, s-maxage=60, stale-while-revalidate",
    60,
  ],
])("formats portable cache policies %j", (options, cacheControl, revalidateSeconds) => {
  expect(routeCachePolicyFromOptions(options)).toEqual({ cacheControl, revalidateSeconds });
});

test.each([
  {},
  { maxAge: -1 },
  { sMaxAge: 0.1 },
  { maxAge: Number.POSITIVE_INFINITY },
  { sMaxAge: Number.MAX_SAFE_INTEGER + 1 },
  { staleWhileRevalidate: false },
  { staleWhileRevalidate: -1 },
  { staleWhileRevalidate: Number.NaN },
])("rejects invalid portable cache policies %j", (options) => {
  expect(() => routeCachePolicyFromOptions(options)).toThrow("cacheControl()");
});

test.each(["GET", "HEAD", "POST"])("shares only bodyless safe method responses (%s)", (method) => {
  const response = applyCloudflareCachePolicy(
    new Response("body", { status: 201, statusText: "Created" }),
    new Request("https://app.test/", { method }),
    { cacheControl: "max-age=30", revalidateSeconds: 0 },
    false,
  );
  expect(response.headers.get("cache-control")).toBe(
    method === "POST" ? "private, no-store" : "max-age=30",
  );
  expect(response.status).toBe(201);
  expect(response.statusText).toBe("Created");
});

test("preserves a response without a policy and keeps explicit no-store case-insensitively", () => {
  const response = new Response("body", { headers: { "cache-control": "max-age=60, No-Store" } });
  const request = new Request("https://app.test/");
  expect(applyCloudflareCachePolicy(response, request, undefined, false)).toBe(response);
  expect(
    applyCloudflareCachePolicy(new Response("plain"), request, undefined, false).headers.get(
      "cache-control",
    ),
  ).toBeNull();
  expect(
    applyCloudflareCachePolicy(
      response,
      request,
      { cacheControl: "s-maxage=60", revalidateSeconds: 60 },
      false,
    ),
  ).toBe(response);
});
