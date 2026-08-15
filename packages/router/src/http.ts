import type { ServerResponse } from "node:http";
import type { IncomingMessage } from "node:http";
import { Readable } from "node:stream";

const rawUrlByRequest = new WeakMap<Request, string>();

export function nodeRequestToWebRequest(
  incoming: IncomingMessage,
  origin: string,
  outgoing?: ServerResponse,
): Request {
  const method = incoming.method ?? "GET";
  const rawUrl = incoming.url ?? "/";
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

  if (outgoing !== undefined) {
    init.signal = nodeRequestSignal(incoming, outgoing);
  }

  if (method !== "GET" && method !== "HEAD") {
    init.body = Readable.toWeb(incoming) as ReadableStream<Uint8Array>;
    init.duplex = "half";
  }

  const request = new Request(nodeRequestUrl(rawUrl, origin), init);
  rawUrlByRequest.set(request, rawUrl);
  return request;
}

function nodeRequestSignal(incoming: IncomingMessage, outgoing: ServerResponse): AbortSignal {
  const controller = new AbortController();
  let disposed = false;

  const dispose = (): void => {
    if (disposed) {
      return;
    }
    disposed = true;
    incoming.off("aborted", onIncomingAborted);
    outgoing.off("close", onOutgoingClose);
    outgoing.off("error", onOutgoingError);
    outgoing.off("finish", onOutgoingFinish);
  };
  const abort = (reason: Error): void => {
    controller.abort(reason);
    dispose();
  };
  const onIncomingAborted = (): void => {
    abort(new Error("The incoming HTTP request was aborted."));
  };
  const onOutgoingClose = (): void => {
    if (!outgoing.writableFinished) {
      abort(new Error("The outgoing HTTP response closed before completion."));
      return;
    }
    dispose();
  };
  const onOutgoingError = (error: Error): void => {
    abort(error);
  };
  const onOutgoingFinish = (): void => {
    dispose();
  };

  incoming.once("aborted", onIncomingAborted);
  outgoing.once("close", onOutgoingClose);
  outgoing.once("error", onOutgoingError);
  outgoing.once("finish", onOutgoingFinish);

  if (incoming.aborted) {
    onIncomingAborted();
  } else if (outgoing.destroyed && !outgoing.writableFinished) {
    onOutgoingClose();
  }

  return controller.signal;
}

function nodeRequestUrl(rawUrl: string, origin: string): URL {
  const validatedOrigin = new URL(origin).origin;
  const rootedPath = rawUrl.startsWith("/") ? rawUrl : `/${rawUrl}`;
  const requestUrl = new URL(`${validatedOrigin}${rootedPath}`);

  if (requestUrl.origin !== validatedOrigin) {
    throw new TypeError("Node request target changed the validated request origin.");
  }

  return requestUrl;
}

export function rawNodeRequestUrl(request: Request): string | undefined {
  return rawUrlByRequest.get(request);
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

/**
 * Test-only probe: returns true when the Response was constructed via
 * `htmlResponse` / `bytesResponse` and is therefore eligible for the
 * `sendResponse` raw-body fast path. Not part of the public runtime API.
 */
export function hasFastPathBody(response: Response): boolean {
  return rawBodyByResponse.has(response);
}

export async function sendResponse(
  outgoing: ServerResponse,
  response: Response,
): Promise<void> {
  outgoing.statusCode = response.status;
  const setCookieHeaders = responseSetCookieHeaders(response.headers);
  response.headers.forEach((value, key) => {
    if (key.toLowerCase() === "set-cookie" && setCookieHeaders.length > 0) {
      return;
    }
    outgoing.setHeader(key, value);
  });
  if (setCookieHeaders.length > 0) {
    outgoing.setHeader("set-cookie", setCookieHeaders);
  }

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
  const lifecycle = observeOutgoingFailure(outgoing);
  outgoing.flushHeaders();

  try {
    while (true) {
      const result = await readWithAbort(reader, lifecycle.signal);

      if (result.done) {
        outgoing.end();
        return;
      }

      if (!outgoing.write(result.value)) {
        await waitForDrain(outgoing, lifecycle.signal);
      }
    }
  } catch (error) {
    const reason = error instanceof Error ? error : new Error(String(error));
    try {
      await reader.cancel(reason);
    } catch {
      // The stream may already be errored or cancelled.
    }
    if (!outgoing.destroyed) {
      outgoing.destroy(reason);
    }
  } finally {
    lifecycle.dispose();
    reader.releaseLock();
  }
}

function observeOutgoingFailure(outgoing: ServerResponse): {
  dispose(): void;
  signal: AbortSignal;
} {
  const controller = new AbortController();
  let disposed = false;

  const dispose = (): void => {
    if (disposed) {
      return;
    }
    disposed = true;
    outgoing.off("close", onClose);
    outgoing.off("error", onError);
  };
  const abort = (reason: Error): void => {
    controller.abort(reason);
    dispose();
  };
  const onClose = (): void => {
    abort(new Error("The outgoing HTTP response closed during streaming."));
  };
  const onError = (error: Error): void => {
    abort(error);
  };

  outgoing.once("close", onClose);
  outgoing.once("error", onError);
  if (outgoing.destroyed) {
    onClose();
  }

  return { dispose, signal: controller.signal };
}

function readWithAbort(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  signal: AbortSignal,
): Promise<ReadableStreamReadResult<Uint8Array>> {
  if (signal.aborted) {
    return Promise.reject(abortReason(signal));
  }

  return new Promise((resolve, reject) => {
    const onAbort = (): void => {
      signal.removeEventListener("abort", onAbort);
      reject(abortReason(signal));
    };
    signal.addEventListener("abort", onAbort, { once: true });
    void reader.read().then(
      (result) => {
        signal.removeEventListener("abort", onAbort);
        resolve(result);
      },
      (error: unknown) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      },
    );
  });
}

function waitForDrain(outgoing: ServerResponse, signal: AbortSignal): Promise<void> {
  if (signal.aborted) {
    return Promise.reject(abortReason(signal));
  }

  return new Promise((resolve, reject) => {
    const dispose = (): void => {
      outgoing.off("drain", onDrain);
      signal.removeEventListener("abort", onAbort);
    };
    const onDrain = (): void => {
      dispose();
      resolve();
    };
    const onAbort = (): void => {
      dispose();
      reject(abortReason(signal));
    };
    outgoing.once("drain", onDrain);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

function abortReason(signal: AbortSignal): Error {
  return signal.reason instanceof Error ? signal.reason : new Error("HTTP streaming was aborted.");
}

function responseSetCookieHeaders(headers: Headers): string[] {
  const getSetCookie = (headers as Headers & { getSetCookie?: () => string[] }).getSetCookie;

  if (typeof getSetCookie === "function") {
    return getSetCookie.call(headers);
  }

  const value = headers.get("set-cookie");
  return value === null ? [] : [value];
}
