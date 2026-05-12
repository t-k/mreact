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
