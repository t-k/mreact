import { describe, expect, test } from "vitest";

import { trackRequestHeaderReads, withTrackedRequest } from "../src/request-header-tracking.js";

describe("request header read tracking", () => {
  test("reports no read for a request whose headers are untouched", () => {
    const tracked = trackRequestHeaderReads(
      new Request("https://app.test/items?id=1", {
        headers: { "accept-language": "ja" },
      }),
    );

    expect(tracked.request.method).toBe("GET");
    expect(tracked.requestDependent()).toBe(false);
  });

  test("reports a read when application code observes the request URL", () => {
    const tracked = trackRequestHeaderReads(new Request("https://tenant-a.test/items?id=1"));

    expect(tracked.request.url).toBe("https://tenant-a.test/items?id=1");
    expect(tracked.requestDependent()).toBe(true);
  });

  test("reports a read for get, has and iteration", () => {
    const request = new Request("https://app.test/", {
      headers: { "accept-language": "ja" },
    });

    const read = trackRequestHeaderReads(request);
    expect(read.request.headers.get("accept-language")).toBe("ja");
    expect(read.requestDependent()).toBe(true);

    const has = trackRequestHeaderReads(request);
    expect(has.request.headers.has("accept-language")).toBe(true);
    expect(has.requestDependent()).toBe(true);

    const iterated = trackRequestHeaderReads(request);
    expect([...iterated.request.headers].length).toBeGreaterThan(0);
    expect(iterated.requestDependent()).toBe(true);

    const enumerated = trackRequestHeaderReads(request);
    enumerated.request.headers.forEach(() => undefined);
    expect(enumerated.requestDependent()).toBe(true);
  });

  test("records a read performed through a cloned request", () => {
    const tracked = trackRequestHeaderReads(
      new Request("https://app.test/", { headers: { "accept-language": "ja" } }),
    );

    expect(tracked.request.clone().headers.get("accept-language")).toBe("ja");
    expect(tracked.requestDependent()).toBe(true);
  });

  test("records a read for taking a reference to the headers", () => {
    const tracked = trackRequestHeaderReads(
      new Request("https://app.test/", { headers: { "accept-language": "ja" } }),
    );

    const headers = tracked.request.headers;

    expect(headers).toBeInstanceOf(Headers);
    expect(tracked.requestDependent()).toBe(true);
  });

  test("records a read for a header that is absent", () => {
    const tracked = trackRequestHeaderReads(new Request("https://app.test/"));

    expect(tracked.request.headers.get("cf-ipcountry")).toBeNull();
    expect(tracked.requestDependent()).toBe(true);
  });

  test("leaves the original request untracked", () => {
    const request = new Request("https://app.test/", {
      headers: { "accept-language": "ja" },
    });
    const tracked = trackRequestHeaderReads(request);

    expect(request.headers.get("accept-language")).toBe("ja");
    expect(tracked.requestDependent()).toBe(false);
  });

  test("keeps the tracked request usable as a real Request", async () => {
    const tracked = trackRequestHeaderReads(new Request("https://app.test/items"));

    expect(tracked.request).toBeInstanceOf(Request);
    expect(new Request(tracked.request).url).toBe("https://app.test/items");
    await expect(tracked.request.text()).resolves.toBe("");
  });

  test("records context request access before opaque code reconstructs it", () => {
    const tracked = trackRequestHeaderReads(
      new Request("https://app.test/items", {
        headers: { "cf-connecting-ip": "203.0.113.7" },
      }),
    );
    const context = withTrackedRequest({ params: {} }, tracked.request, tracked);

    expect(tracked.requestDependent()).toBe(false);
    const copied = new Request(context["request"]);
    expect(copied).toBeInstanceOf(Request);
    expect(copied.headers.get("cf-connecting-ip")).toBe("203.0.113.7");
    expect(tracked.requestDependent()).toBe(true);
  });

  test("keeps an untouched application context request independent", () => {
    const tracked = trackRequestHeaderReads(new Request("https://app.test/items"));
    const context = withTrackedRequest({ params: {} }, tracked.request, tracked);

    expect(Object.keys(context)).toEqual(["params", "request"]);
    expect(tracked.requestDependent()).toBe(false);
  });

  test("reports a request carrying a body as header dependent without cloning it", async () => {
    const request = new Request("https://app.test/submit", {
      body: JSON.stringify({ ok: true }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    const tracked = trackRequestHeaderReads(request);

    expect(tracked.requestDependent()).toBe(true);
    expect(tracked.request).toBe(request);
    await expect(tracked.request.json()).resolves.toEqual({ ok: true });
  });
});
