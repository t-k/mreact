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
  __headers: Record<string, string | number | readonly string[]>;
  __ended: boolean;
  __events: string[];
  __flushed: boolean;
}

function fakeServerResponse(): FakeServerResponse {
  const headers: Record<string, string | number | readonly string[]> = {};
  const body: Buffer[] = [];
  const events: string[] = [];
  const handlers: Record<string, Array<() => void>> = {};
  const fake = {
    statusCode: 200,
    __body: body,
    __headers: headers,
    __ended: false,
    __events: events,
    __flushed: false,
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
      return true;
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
      (handlers["finish"] ?? []).forEach((fn) => fn());
    },
    once(event: string, handler: () => void) {
      handlers[event] ??= [];
      handlers[event].push(handler);
      return this;
    },
    destroy(_error: Error) {
      this.__ended = true;
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
