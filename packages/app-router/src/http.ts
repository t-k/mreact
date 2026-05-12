import type { ServerResponse } from "node:http";
import type { IncomingMessage } from "node:http";
import { Readable } from "node:stream";

export function nodeRequestToWebRequest(
  incoming: IncomingMessage,
  origin: string,
): Request {
  const method = incoming.method ?? "GET";
  const headers = new Headers();

  for (const [name, value] of Object.entries(incoming.headers)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        headers.append(name, item);
      }
      continue;
    }

    if (value !== undefined) {
      headers.set(name, value);
    }
  }

  const init: RequestInit & { duplex?: "half" } = {
    headers,
    method,
  };

  if (method !== "GET" && method !== "HEAD") {
    init.body = Readable.toWeb(incoming) as ReadableStream<Uint8Array>;
    init.duplex = "half";
  }

  return new Request(new URL(incoming.url ?? "/", origin), init);
}

/**
 * WeakMap-backed marker holding the underlying body for Response objects
 * that mreact built from a known-shape body (string / Buffer /
 * Uint8Array). When `sendResponse` sees this marker, it bypasses the
 * `ReadableStream → reader.read()` pump and writes the body directly to
 * the Node HTTP socket.
 *
 * A WeakMap is used instead of a Symbol property to avoid forcing a
 * hidden-class transition on the Response — Response is a global host
 * object whose IC chain is shared, and adding own properties slows down
 * subsequent `response.headers` / `response.body` accesses.
 *
 * Measured savings (Node 24 / Linux x64, minimal page bench): ~10-15μs/req
 * vs the stream path. See docs/issues/054.
 */
const rawBodyByResponse = new WeakMap<Response, string | Uint8Array>();

/**
 * Constructs a Response whose body is a single string (the common HTML
 * render result). Equivalent to `new Response(html, init)` but tagged so
 * `sendResponse` can take its string fast path.
 */
export function htmlResponse(html: string, init?: ResponseInit): Response {
  const response = new Response(html, init);
  rawBodyByResponse.set(response, html);
  return response;
}

/**
 * Constructs a Response whose body is raw bytes (e.g., pre-rendered HTML
 * already encoded, or static assets). Tagged so `sendResponse` writes the
 * bytes directly without going through the stream reader.
 */
export function bytesResponse(bytes: Uint8Array, init?: ResponseInit): Response {
  const response = new Response(bytes as BodyInit, init);
  rawBodyByResponse.set(response, bytes);
  return response;
}

export async function sendResponse(
  outgoing: ServerResponse,
  response: Response,
): Promise<void> {
  outgoing.statusCode = response.status;
  response.headers.forEach((value, key) => outgoing.setHeader(key, value));

  if (response.body === null) {
    outgoing.end();
    return;
  }

  // Fast path: when the Response was constructed via `htmlResponse` /
  // `bytesResponse` (i.e., mreact knows the underlying body shape), skip
  // the Response→ReadableStream→reader pump and write directly.
  const rawBody = rawBodyByResponse.get(response);
  if (rawBody !== undefined) {
    outgoing.end(rawBody);
    return;
  }

  const reader = response.body.getReader();

  try {
    while (true) {
      const result = await reader.read();

      if (result.done) {
        outgoing.end();
        return;
      }

      if (!outgoing.write(result.value)) {
        await new Promise<void>((resolve) => outgoing.once("drain", resolve));
      }
    }
  } catch (error) {
    outgoing.destroy(error instanceof Error ? error : new Error(String(error)));
  } finally {
    reader.releaseLock();
  }
}
