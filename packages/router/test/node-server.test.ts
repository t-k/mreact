import { describe, expect, test } from "vitest";
import {
  resolveNodeRequestProtocol,
  startNodeRequestServer,
} from "../src/node-server.js";

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
});
