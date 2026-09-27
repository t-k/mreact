import { request as httpRequest } from "node:http";
import { describe, expect, test } from "vitest";
import { resolveNodeRequestProtocol, startNodeRequestServer } from "../src/node-server.js";

describe("Node request server helper", () => {
  test.each([
    [{ encrypted: true, forwardedProto: undefined, trustForwardedProto: false }, "https"],
    [{ encrypted: true, forwardedProto: "http", trustForwardedProto: true }, "https"],
    [{ encrypted: false, forwardedProto: "https", trustForwardedProto: false }, "http"],
    [{ encrypted: false, forwardedProto: " HTTPS ", trustForwardedProto: true }, "https"],
    [{ encrypted: false, forwardedProto: "https, http", trustForwardedProto: true }, "https"],
    [{ encrypted: false, forwardedProto: "http, https", trustForwardedProto: true }, "http"],
    [{ encrypted: false, forwardedProto: "ftp", trustForwardedProto: true }, "http"],
    [{ encrypted: false, forwardedProto: undefined, trustForwardedProto: true }, "http"],
  ] as const)("resolves request protocol from explicit trust inputs", (options, expected) => {
    expect(resolveNodeRequestProtocol(options)).toBe(expected);
  });

  test("serves requests through the provided render callback and closes cleanly", async () => {
    const server = await startNodeRequestServer({
      port: 0,
      async render(request) {
        return new Response(new URL(request.url).pathname, {
          headers: { "content-type": "text/plain; charset=utf-8" },
        });
      },
    });

    try {
      const response = await fetch(`${server.url}/from-helper`);

      expect(response.status).toBe(200);
      await expect(response.text()).resolves.toBe("/from-helper");
    } finally {
      await server.close();
    }
  });

  test("trusts forwarded proto only when explicitly enabled", async () => {
    const observed: string[] = [];
    const server = await startNodeRequestServer({
      port: 0,
      trustForwardedProto: true,
      async render(request) {
        observed.push(request.url);
        return new Response("ok");
      },
    });

    try {
      await fetch(server.url, { headers: { "x-forwarded-proto": "https" } });
      expect(observed).toEqual([server.url.replace("http:", "https:") + "/"]);
    } finally {
      await server.close();
    }
  });

  test("starts processing a POST body before its remaining bytes arrive", async () => {
    let firstChunkSeen!: (chunk: string) => void;
    const firstChunk = new Promise<string>((resolve) => {
      firstChunkSeen = resolve;
    });
    const server = await startNodeRequestServer({
      port: 0,
      async render(request) {
        const reader = request.body?.getReader();
        if (reader === undefined) throw new Error("Missing request body");
        const first = await reader.read();
        if (first.done) throw new Error("Missing first request chunk");
        firstChunkSeen(new TextDecoder().decode(first.value));
        const second = await reader.read();
        return new Response(second.done ? "missing tail" : new TextDecoder().decode(second.value));
      },
    });
    const client = httpRequest(`${server.url}/upload`, {
      method: "POST",
      headers: { "content-length": "11" },
    });
    const response = new Promise<{ body: string; status: number | undefined }>(
      (resolve, reject) => {
        client.on("response", (incoming) => {
          let body = "";
          incoming.setEncoding("utf8");
          incoming.on("data", (chunk: string) => {
            body += chunk;
          });
          incoming.on("end", () => resolve({ body, status: incoming.statusCode }));
          incoming.on("error", reject);
        });
        client.on("error", reject);
      },
    );
    void response.catch(() => {});
    let timeout: ReturnType<typeof setTimeout> | undefined;

    try {
      client.write("prefix");
      expect(
        await Promise.race([
          firstChunk,
          new Promise<never>((_, reject) => {
            timeout = setTimeout(() => reject(new Error("POST prefix was buffered")), 1000);
          }),
        ]),
      ).toBe("prefix");
      client.end("after");
      await expect(response).resolves.toEqual({ body: "after", status: 200 });
    } finally {
      clearTimeout(timeout);
      client.destroy();
      await server.close();
    }
  });
});
