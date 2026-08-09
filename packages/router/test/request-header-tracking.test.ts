import { describe, expect, test } from "vitest";

import { trackRequestHeaderReads } from "../src/request-header-tracking.js";

describe("request header read tracking", () => {
  test("reports no read for a request whose headers are untouched", () => {
    const tracked = trackRequestHeaderReads(
      new Request("https://app.test/items?id=1", {
        headers: { "accept-language": "ja" },
      }),
    );

    expect(new URL(tracked.request.url).pathname).toBe("/items");
    expect(tracked.request.method).toBe("GET");
    expect(tracked.readAnyHeader()).toBe(false);
  });

  test("reports a read for get, has and iteration", () => {
    const request = new Request("https://app.test/", {
      headers: { "accept-language": "ja" },
    });

    const read = trackRequestHeaderReads(request);
    expect(read.request.headers.get("accept-language")).toBe("ja");
    expect(read.readAnyHeader()).toBe(true);

    const has = trackRequestHeaderReads(request);
    expect(has.request.headers.has("accept-language")).toBe(true);
    expect(has.readAnyHeader()).toBe(true);

    const iterated = trackRequestHeaderReads(request);
    expect([...iterated.request.headers].length).toBeGreaterThan(0);
    expect(iterated.readAnyHeader()).toBe(true);

    const enumerated = trackRequestHeaderReads(request);
    enumerated.request.headers.forEach(() => undefined);
    expect(enumerated.readAnyHeader()).toBe(true);
  });

  test("records a read performed through a cloned request", () => {
    const tracked = trackRequestHeaderReads(
      new Request("https://app.test/", { headers: { "accept-language": "ja" } }),
    );

    expect(tracked.request.clone().headers.get("accept-language")).toBe("ja");
    expect(tracked.readAnyHeader()).toBe(true);
  });

  test("records a read for taking a reference to the headers", () => {
    const tracked = trackRequestHeaderReads(
      new Request("https://app.test/", { headers: { "accept-language": "ja" } }),
    );

    const headers = tracked.request.headers;

    expect(headers).toBeInstanceOf(Headers);
    expect(tracked.readAnyHeader()).toBe(true);
  });

  test("records a read for a header that is absent", () => {
    const tracked = trackRequestHeaderReads(new Request("https://app.test/"));

    expect(tracked.request.headers.get("cf-ipcountry")).toBeNull();
    expect(tracked.readAnyHeader()).toBe(true);
  });

  test("leaves the original request untracked", () => {
    const request = new Request("https://app.test/", {
      headers: { "accept-language": "ja" },
    });
    const tracked = trackRequestHeaderReads(request);

    expect(request.headers.get("accept-language")).toBe("ja");
    expect(tracked.readAnyHeader()).toBe(false);
  });

  test("keeps the tracked request usable as a real Request", async () => {
    const tracked = trackRequestHeaderReads(new Request("https://app.test/items"));

    expect(tracked.request).toBeInstanceOf(Request);
    expect(new Request(tracked.request).url).toBe("https://app.test/items");
    await expect(tracked.request.text()).resolves.toBe("");
  });

  test("reports a request carrying a body as header dependent without cloning it", async () => {
    const request = new Request("https://app.test/submit", {
      body: JSON.stringify({ ok: true }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    const tracked = trackRequestHeaderReads(request);

    expect(tracked.readAnyHeader()).toBe(true);
    expect(tracked.request).toBe(request);
    await expect(tracked.request.json()).resolves.toEqual({ ok: true });
  });
});
