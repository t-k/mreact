import { PassThrough } from "node:stream";
import type { IncomingMessage, ServerResponse } from "node:http";
import { describe, expect, test } from "vitest";
import {
  bytesResponse,
  hasFastPathBody,
  htmlResponse,
  nodeRequestToWebRequest,
  sendResponse,
} from "../src/http.js";

function fakeIncomingMessage(options: {
  method?: string;
  url?: string;
  headers?: Record<string, string | string[] | undefined>;
  body?: Buffer | null;
}): IncomingMessage {
  const stream = new PassThrough();
  if (options.body !== null && options.body !== undefined) {
    stream.end(options.body);
  } else {
    stream.end();
  }
  return Object.assign(stream, {
    method: options.method,
    url: options.url,
    headers: options.headers ?? {},
  }) as unknown as IncomingMessage;
}

interface FakeServerResponse extends ServerResponse {
  __body: Buffer[];
  __emit(event: string, error?: Error): void;
  __headers: Record<string, string | number | readonly string[]>;
  __ended: boolean;
  __events: string[];
  __flushed: boolean;
  __listenerCount(event: string): number;
}

function fakeServerResponse(
  options: { writeResults?: readonly boolean[] } = {},
): FakeServerResponse {
  const headers: Record<string, string | number | readonly string[]> = {};
  const body: Buffer[] = [];
  const events: string[] = [];
  const handlers: Record<string, Array<(error?: Error) => void>> = {};
  const writeResults = [...(options.writeResults ?? [])];
  const fake = {
    statusCode: 200,
    destroyed: false,
    writableFinished: false,
    __body: body,
    __headers: headers,
    __ended: false,
    __events: events,
    __flushed: false,
    __emit(event: string, error?: Error) {
      if (event === "close") {
        this.destroyed = true;
      }
      const listeners = handlers[event]?.splice(0) ?? [];
      listeners.forEach((listener) => listener(error));
    },
    __listenerCount(event: string) {
      return handlers[event]?.length ?? 0;
    },
    setHeader(name: string, value: string | number | readonly string[]) {
      headers[name] = value;
    },
    flushHeaders() {
      this.__flushed = true;
      events.push("flushHeaders");
    },
    write(chunk: string | Uint8Array): boolean {
      events.push("write");
      body.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array));
      return writeResults.shift() ?? true;
    },
    end(chunk?: string | Uint8Array) {
      events.push("end");
      if (chunk !== undefined) {
        body.push(
          typeof chunk === "string"
            ? Buffer.from(chunk)
            : Buffer.isBuffer(chunk)
              ? chunk
              : Buffer.from(chunk),
        );
      }
      this.__ended = true;
      this.writableFinished = true;
      this.__emit("finish");
    },
    once(event: string, handler: (error?: Error) => void) {
      handlers[event] ??= [];
      handlers[event].push(handler);
      return this;
    },
    off(event: string, handler: (error?: Error) => void) {
      handlers[event] = (handlers[event] ?? []).filter((candidate) => candidate !== handler);
      return this;
    },
    removeListener(event: string, handler: (error?: Error) => void) {
      return this.off(event, handler);
    },
    destroy(_error?: Error) {
      this.__ended = true;
      this.destroyed = true;
    },
  } as unknown as FakeServerResponse;
  return fake;
}

describe("router http helpers", () => {
  test("nodeRequestToWebRequest sets method, headers, and URL", async () => {
    const incoming = fakeIncomingMessage({
      method: "GET",
      url: "/foo?bar=1",
      headers: { "x-test": "yes", "x-multi": ["a", "b"] },
    });
    const request = nodeRequestToWebRequest(incoming, "https://app.test");
    expect(request.method).toBe("GET");
    expect(request.url).toBe("https://app.test/foo?bar=1");
    expect(request.headers.get("x-test")).toBe("yes");
    expect(request.headers.get("x-multi")).toContain("a");
    expect(request.headers.get("x-multi")).toContain("b");
  });

  test.each([
    "//evil.test/echo",
    "///evil.test/echo?x=1",
    "//user@evil.test:8443/echo",
    "http://evil.test/echo",
    "\\\\evil.test/echo",
  ])("keeps the validated origin authoritative for request target %s", (target) => {
    const incoming = fakeIncomingMessage({ method: "GET", url: target });
    const request = nodeRequestToWebRequest(incoming, "https://app.test");

    expect(new URL(request.url).origin).toBe("https://app.test");
  });

  test("preserves ordinary request path queries and encoded bytes", () => {
    const incoming = fakeIncomingMessage({
      method: "GET",
      url: "/echo?x=%2Fvalue&name=a%20b",
    });
    const request = nodeRequestToWebRequest(incoming, "https://app.test");

    expect(request.url).toBe("https://app.test/echo?x=%2Fvalue&name=a%20b");
  });

  test("aborts the Request signal on premature response close and incoming abort", () => {
    for (const event of ["close", "aborted"] as const) {
      const incoming = fakeIncomingMessage({ method: "GET", url: "/" });
      const outgoing = fakeServerResponse();
      const request = nodeRequestToWebRequest(incoming, "https://app.test", outgoing);

      if (event === "close") {
        outgoing.__emit("close");
      } else {
        incoming.emit("aborted");
      }

      expect(request.signal.aborted).toBe(true);
    }
  });

  test("does not abort the Request signal after a normally finished response", () => {
    const incoming = fakeIncomingMessage({ method: "GET", url: "/" });
    const outgoing = fakeServerResponse();
    const request = nodeRequestToWebRequest(incoming, "https://app.test", outgoing);

    outgoing.end();
    outgoing.__emit("close");

    expect(request.signal.aborted).toBe(false);
    expect(incoming.listenerCount("aborted")).toBe(0);
    expect(outgoing.__listenerCount("close")).toBe(0);
    expect(outgoing.__listenerCount("error")).toBe(0);
  });

  test("sendResponse cancels a locked body when the client closes during drain", async () => {
    let cancelCalls = 0;
    const body = new ReadableStream<Uint8Array>({
      cancel() {
        cancelCalls += 1;
      },
      start(controller) {
        controller.enqueue(new TextEncoder().encode("shell"));
      },
    });
    const outgoing = fakeServerResponse({ writeResults: [false] });
    const sending = sendResponse(outgoing, new Response(body));

    await waitFor(() => outgoing.__listenerCount("drain") === 1);
    outgoing.__emit("close");
    await sending;

    expect(cancelCalls).toBe(1);
    expect(outgoing.__listenerCount("close")).toBe(0);
    expect(outgoing.__listenerCount("drain")).toBe(0);
    expect(outgoing.__listenerCount("error")).toBe(0);
  });

  test("sendResponse cancels a body when the client closes during a pending read", async () => {
    let cancelCalls = 0;
    const body = new ReadableStream<Uint8Array>({
      cancel() {
        cancelCalls += 1;
      },
      start(controller) {
        controller.enqueue(new TextEncoder().encode("shell"));
      },
    });
    const outgoing = fakeServerResponse();
    const sending = sendResponse(outgoing, new Response(body));

    await waitFor(() => outgoing.__events.includes("write"));
    outgoing.__emit("close");
    await sending;

    expect(cancelCalls).toBe(1);
    expect(outgoing.__listenerCount("close")).toBe(0);
    expect(outgoing.__listenerCount("error")).toBe(0);
  });

  test("sendResponse resumes a normally drained response without cancelling the body", async () => {
    let cancelCalls = 0;
    const body = new ReadableStream<Uint8Array>({
      cancel() {
        cancelCalls += 1;
      },
      start(controller) {
        controller.enqueue(new TextEncoder().encode("shell"));
        controller.enqueue(new TextEncoder().encode("tail"));
        controller.close();
      },
    });
    const outgoing = fakeServerResponse({ writeResults: [false, true] });
    const sending = sendResponse(outgoing, new Response(body));

    await waitFor(() => outgoing.__listenerCount("drain") === 1);
    outgoing.__emit("drain");
    await sending;

    expect(Buffer.concat(outgoing.__body).toString("utf8")).toBe("shelltail");
    expect(outgoing.__ended).toBe(true);
    expect(cancelCalls).toBe(0);
    expect(outgoing.__listenerCount("close")).toBe(0);
    expect(outgoing.__listenerCount("drain")).toBe(0);
    expect(outgoing.__listenerCount("error")).toBe(0);
  });

  test("nodeRequestToWebRequest attaches the incoming body for non-GET methods", async () => {
    const incoming = fakeIncomingMessage({
      method: "POST",
      url: "/post",
      headers: { "content-type": "text/plain" },
      body: Buffer.from("hello"),
    });
    const request = nodeRequestToWebRequest(incoming, "https://app.test");
    expect(request.method).toBe("POST");
    await expect(request.text()).resolves.toBe("hello");
  });

  test("nodeRequestToWebRequest defaults the URL path to / when incoming.url is undefined", () => {
    const incoming = fakeIncomingMessage({});
    const request = nodeRequestToWebRequest(incoming, "https://app.test");
    expect(request.url).toBe("https://app.test/");
  });

  test("nodeRequestToWebRequest defaults the method to GET when incoming.method is undefined", () => {
    const incoming = fakeIncomingMessage({});
    const request = nodeRequestToWebRequest(incoming, "https://app.test");
    expect(request.method).toBe("GET");
  });

  test("htmlResponse tags the response for the sendResponse fast path", () => {
    const response = htmlResponse("<p>hi</p>");
    expect(hasFastPathBody(response)).toBe(true);
  });

  test("bytesResponse tags the response for the sendResponse fast path", () => {
    const response = bytesResponse(new Uint8Array([1, 2, 3]));
    expect(hasFastPathBody(response)).toBe(true);
  });

  test("plain new Response() is not eligible for the fast path", () => {
    expect(hasFastPathBody(new Response("plain"))).toBe(false);
  });

  test("sendResponse writes status, headers, and body via the fast path for htmlResponse", async () => {
    const outgoing = fakeServerResponse();
    await sendResponse(
      outgoing,
      htmlResponse("<p>hi</p>", {
        status: 201,
        headers: { "x-mreact": "yes" },
      }),
    );
    expect(outgoing.statusCode).toBe(201);
    expect(outgoing.__headers["x-mreact"]).toBe("yes");
    expect(outgoing.__ended).toBe(true);
    expect(Buffer.concat(outgoing.__body).toString("utf8")).toBe("<p>hi</p>");
  });

  test("sendResponse preserves multiple Set-Cookie headers on the Node path", async () => {
    const outgoing = fakeServerResponse();
    const headers = new Headers({ "x-mreact": "yes" });
    headers.append("set-cookie", "sid=1; Path=/; HttpOnly");
    headers.append("set-cookie", "csrf=2; Path=/; SameSite=Lax");

    await sendResponse(
      outgoing,
      htmlResponse("<p>hi</p>", {
        headers,
      }),
    );

    expect(outgoing.__headers["x-mreact"]).toBe("yes");
    expect(outgoing.__headers["set-cookie"]).toEqual([
      "sid=1; Path=/; HttpOnly",
      "csrf=2; Path=/; SameSite=Lax",
    ]);
  });

  test("sendResponse takes the empty-body branch when response.body is null", async () => {
    const outgoing = fakeServerResponse();
    // 204 No Content has a null body.
    await sendResponse(outgoing, new Response(null, { status: 204 }));
    expect(outgoing.statusCode).toBe(204);
    expect(outgoing.__ended).toBe(true);
  });

  test("sendResponse falls back to the stream reader path for unmarked responses", async () => {
    const outgoing = fakeServerResponse();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("from-stream"));
        controller.close();
      },
    });
    await sendResponse(outgoing, new Response(stream));
    expect(outgoing.__ended).toBe(true);
    expect(Buffer.concat(outgoing.__body).toString("utf8")).toBe("from-stream");
  });

  test("sendResponse flushes headers before streaming the first body chunk", async () => {
    const outgoing = fakeServerResponse();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("from-stream"));
        controller.close();
      },
    });

    await sendResponse(outgoing, new Response(stream));

    expect(outgoing.__flushed).toBe(true);
    expect(outgoing.__events.slice(0, 2)).toEqual(["flushHeaders", "write"]);
  });
});

async function waitFor(predicate: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (predicate()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  throw new Error("Timed out waiting for HTTP lifecycle state.");
}
