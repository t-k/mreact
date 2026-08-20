import { request as httpRequest, type IncomingMessage } from "node:http";
import { connect, type Socket } from "node:net";
import type { Duplex } from "node:stream";
import { describe, expect, test, vi } from "vitest";
import WebSocket, { WebSocketServer } from "ws";
import type { AppRouterLogEvent } from "../src/logger.js";
import { startNodeRequestServer } from "../src/node-server.js";
import { validateHttpUpgradeOrigin, type HttpUpgradeContext } from "../src/upgrade.js";

describe("HTTP upgrade origin validation", () => {
  test.each([
    ["HTTPS://APP.Example:443/", "https://app.example", true],
    ["https://app.example:8443", "https://app.example:8443", true],
    ["http://app.example", "https://app.example", false],
    ["https://app.example:8443", "https://app.example", false],
    ["https://app.example.evil", "https://app.example", false],
    ["https://app.example@evil.test", "https://app.example", false],
    ["null", "https://app.example", false],
    ["not an origin", "https://app.example", false],
    ["https://app.example, https://evil.test", "https://app.example", false],
  ])("validates Origin %s against %s", (origin, allowedOrigin, expected) => {
    const request = incomingRequest({ origin });

    expect(validateHttpUpgradeOrigin(request, { allowedOrigins: [allowedOrigin] }).ok).toBe(
      expected,
    );
  });

  test("rejects a missing Origin unless explicitly allowed", () => {
    const request = incomingRequest({});

    expect(validateHttpUpgradeOrigin(request, { allowedOrigins: ["https://app.example"] })).toEqual(
      { ok: false, reason: "missing-origin" },
    );
    expect(
      validateHttpUpgradeOrigin(request, {
        allowedOrigins: ["https://app.example"],
        allowMissingOrigin: true,
      }),
    ).toEqual({ ok: true, origin: undefined });
  });

  test.each([
    "https://app.example/path",
    "https://app.example?query=1",
    "https://app.example#fragment",
    "https://user@app.example",
    "ftp://app.example",
  ])("rejects invalid configured origin %s", (allowedOrigin) => {
    expect(() =>
      validateHttpUpgradeOrigin(incomingRequest({ origin: "https://app.example" }), {
        allowedOrigins: [allowedOrigin],
      }),
    ).toThrow("Invalid HTTP upgrade allowed origin");
  });
});

describe("managed HTTP upgrades", () => {
  test.each([
    [
      "synchronous",
      () => {
        throw new Error("sync upgrade failure");
      },
    ],
    [
      "asynchronous",
      async () => {
        await Promise.resolve();
        throw new Error("async upgrade failure");
      },
    ],
    [
      "non-coercible",
      () => {
        throw Object.create(null);
      },
    ],
    [
      "asynchronous non-coercible",
      async () => {
        await Promise.resolve();
        throw Object.create(null);
      },
    ],
  ])("contains %s handler failures and keeps serving HTTP", async (_name, onUpgrade) => {
    const events: AppRouterLogEvent[] = [];
    const server = await startNodeRequestServer({
      logger: {
        error(event) {
          events.push(event);
        },
      },
      onUpgrade,
      port: 0,
      render: async () => new Response("ok"),
      upgradeOriginPolicy: "unchecked",
    });

    try {
      await expect(
        openUpgrade(server.url, "/ws?token=query-secret", {
          Authorization: "Bearer header-secret",
          Cookie: "session=cookie-secret",
          Origin: "https://origin-secret.test",
        }),
      ).resolves.toMatchObject({ closed: true });
      await expect(httpText(server.url)).resolves.toBe("ok");
      await vi.waitFor(() => {
        expect(events.filter((event) => event.type === "router:upgrade:error")).toHaveLength(1);
      });
      const serialized = JSON.stringify(events);
      expect(serialized).toContain('"path":"/ws"');
      expect(serialized).not.toContain("query-secret");
      expect(serialized).not.toContain("header-secret");
      expect(serialized).not.toContain("cookie-secret");
      expect(serialized).not.toContain("origin-secret");
    } finally {
      await server.close();
    }
  });

  test("destroys explicitly declined and undecided legacy upgrades", async () => {
    const server = await startNodeRequestServer({
      onUpgrade(request, _socket, _head, context) {
        if (request.url === "/explicit") {
          return context.decline();
        }
      },
      port: 0,
      render: async () => new Response("ok"),
      upgradeOriginPolicy: "unchecked",
    });

    try {
      await expect(openUpgrade(server.url, "/explicit")).resolves.toMatchObject({ closed: true });
      await expect(openUpgrade(server.url, "/legacy-return")).resolves.toMatchObject({
        closed: true,
      });
    } finally {
      await server.close();
    }
  });

  test("preserves synchronous legacy 101 handlers", async () => {
    const server = await startNodeRequestServer({
      onUpgrade: (_request, socket) => (
        socket.write(
          "HTTP/1.1 101 Switching Protocols\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\n",
        ),
        socket.end()
      ),
      port: 0,
      render: async () => new Response("ok"),
      upgradeOriginPolicy: "unchecked",
    });

    try {
      await expect(openUpgrade(server.url, "/ws")).resolves.toMatchObject({
        closed: true,
        response: expect.stringContaining("101 Switching Protocols"),
      });
    } finally {
      await server.close();
    }
  });

  test("preserves explicitly accepted ws handshakes with delayed verification", async () => {
    const webSocketServer = new WebSocketServer({
      noServer: true,
      verifyClient(_info, done) {
        setTimeout(() => done(true), 20);
      },
    });
    const server = await startNodeRequestServer({
      onUpgrade(request, socket, head, context) {
        context.accept();
        webSocketServer.handleUpgrade(request, socket as Socket, head, (websocket) => {
          webSocketServer.emit("connection", websocket, request);
        });
      },
      port: 0,
      render: async () => new Response("ok"),
      upgradeOriginPolicy: "unchecked",
    });
    const client = new WebSocket(server.url.replace("http:", "ws:"));

    try {
      await new Promise<void>((resolve, reject) => {
        client.once("open", resolve);
        client.once("error", reject);
      });
      expect(client.readyState).toBe(WebSocket.OPEN);
    } finally {
      client.close();
      await new Promise<void>((resolve) => client.once("close", resolve));
      await server.close();
      webSocketServer.close();
    }
  });

  test("preserves legacy synchronous ws handleUpgrade ownership", async () => {
    const webSocketServer = new WebSocketServer({ noServer: true });
    const server = await startNodeRequestServer({
      onUpgrade(request, socket, head) {
        webSocketServer.handleUpgrade(request, socket as Socket, head, (websocket) => {
          webSocketServer.emit("connection", websocket, request);
        });
      },
      port: 0,
      render: async () => new Response("ok"),
      upgradeOriginPolicy: "unchecked",
    });
    const client = new WebSocket(server.url.replace("http:", "ws:"));

    try {
      await new Promise<void>((resolve, reject) => {
        client.once("open", resolve);
        client.once("error", reject);
      });
      expect(client.readyState).toBe(WebSocket.OPEN);
    } finally {
      client.close();
      await new Promise<void>((resolve) => client.once("close", resolve));
      await server.close();
      webSocketServer.close();
    }
  });

  test("times out undecided async handlers", async () => {
    const events: AppRouterLogEvent[] = [];
    const server = await startNodeRequestServer({
      logger: {
        error(event) {
          events.push(event);
        },
      },
      onUpgrade: async () => await new Promise<never>(() => {}),
      port: 0,
      render: async () => new Response("ok"),
      upgradeDecisionTimeoutMs: 20,
      upgradeOriginPolicy: "unchecked",
    });

    try {
      await expect(openUpgrade(server.url, "/pending")).resolves.toMatchObject({ closed: true });
      await vi.waitFor(() => {
        expect(events).toContainEqual(expect.objectContaining({ type: "router:upgrade:error" }));
      });
    } finally {
      await server.close();
    }
  });

  test("logs only once when a timed-out handler rejects later", async () => {
    const events: AppRouterLogEvent[] = [];
    let rejectHandler: ((error: Error) => void) | undefined;
    const server = await startNodeRequestServer({
      logger: {
        error(event) {
          events.push(event);
        },
      },
      onUpgrade: async () =>
        await new Promise<never>((_resolve, reject) => {
          rejectHandler = reject;
        }),
      port: 0,
      render: async () => new Response("ok"),
      upgradeDecisionTimeoutMs: 20,
      upgradeOriginPolicy: "unchecked",
    });

    try {
      await expect(openUpgrade(server.url, "/pending")).resolves.toMatchObject({ closed: true });
      await vi.waitFor(() => expect(events).toHaveLength(1));
      rejectHandler?.(new Error("late rejection"));
      await new Promise<void>((resolve) => setImmediate(resolve));
      expect(events).toHaveLength(1);
    } finally {
      await server.close();
    }
  });

  test("clears an undecided handler timeout when closing", async () => {
    const events: AppRouterLogEvent[] = [];
    let markHandlerStarted: (() => void) | undefined;
    const handlerStarted = new Promise<void>((resolve) => {
      markHandlerStarted = resolve;
    });
    const server = await startNodeRequestServer({
      logger: {
        error(event) {
          events.push(event);
        },
      },
      onUpgrade: async () => {
        markHandlerStarted?.();
        await new Promise<never>(() => {});
      },
      port: 0,
      render: async () => new Response("ok"),
      upgradeCloseTimeoutMs: 20,
      upgradeDecisionTimeoutMs: 20,
      upgradeOriginPolicy: "unchecked",
    });
    const upgrade = openUpgrade(server.url, "/pending");

    await handlerStarted;
    await server.close();
    await upgrade;
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(events).toEqual([]);
  });

  test("returns the settled disposition from conflicting context decisions", async () => {
    const decisions: string[] = [];
    const server = await startNodeRequestServer({
      onUpgrade(_request, socket, _head, context) {
        decisions.push(context.accept());
        decisions.push(context.decline());
        socket.end();
      },
      port: 0,
      render: async () => new Response("ok"),
      upgradeOriginPolicy: "unchecked",
    });

    try {
      await expect(openUpgrade(server.url, "/ws")).resolves.toMatchObject({ closed: true });
      expect(decisions).toEqual(["handled", "handled"]);
    } finally {
      await server.close();
    }
  });

  test("accepts legacy concise socket end handlers", async () => {
    const server = await startNodeRequestServer({
      onUpgrade: (_request, socket) => socket.end(),
      port: 0,
      render: async () => new Response("ok"),
      upgradeOriginPolicy: "unchecked",
    });

    try {
      await expect(openUpgrade(server.url, "/ws")).resolves.toMatchObject({ closed: true });
    } finally {
      await server.close();
    }
  });

  test("destroys a claimed socket when the handler later rejects", async () => {
    const events: AppRouterLogEvent[] = [];
    const server = await startNodeRequestServer({
      logger: {
        error(event) {
          events.push(event);
        },
      },
      async onUpgrade(_request, _socket, _head, context) {
        context.accept();
        await Promise.resolve();
        throw new Error("verification failed");
      },
      port: 0,
      render: async () => new Response("ok"),
      upgradeOriginPolicy: "unchecked",
    });

    try {
      await expect(openUpgrade(server.url, "/claimed-error")).resolves.toMatchObject({
        closed: true,
      });
      await vi.waitFor(() => {
        expect(events).toContainEqual(expect.objectContaining({ type: "router:upgrade:error" }));
      });
    } finally {
      await server.close();
    }
  });

  test("logs a handler rejection after the peer socket has closed", async () => {
    const events: AppRouterLogEvent[] = [];
    const server = await startNodeRequestServer({
      logger: {
        error(event) {
          events.push(event);
        },
      },
      onUpgrade: async (_request, socket) => {
        socket.destroy();
        await new Promise<void>((resolve) => setImmediate(resolve));
        throw new Error("post-close rejection");
      },
      port: 0,
      render: async () => new Response("ok"),
      upgradeOriginPolicy: "unchecked",
    });

    try {
      await expect(openUpgrade(server.url, "/closed-error")).resolves.toMatchObject({
        closed: true,
      });
      await vi.waitFor(() => {
        expect(events).toContainEqual(
          expect.objectContaining({
            error: expect.objectContaining({ message: "post-close rejection" }),
            type: "router:upgrade:error",
          }),
        );
      });
    } finally {
      await server.close();
    }
  });

  test("forces accepted upgrade sockets closed after the shutdown grace", async () => {
    let acceptedContext: HttpUpgradeContext | undefined;
    const server = await startNodeRequestServer({
      onUpgrade(_request, _socket, _head, context) {
        acceptedContext = context;
        return context.accept();
      },
      port: 0,
      render: async () => new Response("ok"),
      upgradeCloseTimeoutMs: 20,
      upgradeOriginPolicy: "unchecked",
    });
    const upgrade = openUpgrade(server.url, "/held");

    await vi.waitFor(() => expect(acceptedContext).toBeDefined());
    const close = server.close();
    expect(server.close()).toBe(close);
    await expect(close).resolves.toBeUndefined();
    await expect(upgrade).resolves.toMatchObject({ closed: true });
  });

  test("lets ordinary HTTP drain while forcing only upgrade sockets", async () => {
    let startHttp: () => void = () => {};
    let finishHttp: () => void = () => {};
    const httpStarted = new Promise<void>((resolve) => {
      startHttp = resolve;
    });
    const httpRelease = new Promise<void>((resolve) => {
      finishHttp = resolve;
    });
    let accepted = false;
    const server = await startNodeRequestServer({
      onUpgrade(_request, _socket, _head, context) {
        accepted = true;
        return context.accept();
      },
      port: 0,
      async render() {
        startHttp();
        await httpRelease;
        return new Response("drained");
      },
      upgradeCloseTimeoutMs: 100,
      upgradeOriginPolicy: "unchecked",
    });
    const upgrade = openUpgrade(server.url, "/held");
    await vi.waitFor(() => expect(accepted).toBe(true));
    const request = httpText(server.url);
    await httpStarted;

    const close = server.close();
    finishHttp();

    await expect(request).resolves.toBe("drained");
    await expect(close).resolves.toBeUndefined();
    await expect(upgrade).resolves.toMatchObject({ closed: true });
  });

  test.each([
    { upgradeCloseTimeoutMs: -1 },
    { upgradeCloseTimeoutMs: Number.POSITIVE_INFINITY },
    { upgradeDecisionTimeoutMs: Number.NaN },
    { upgradeDecisionTimeoutMs: Number.MAX_SAFE_INTEGER },
  ])("rejects invalid upgrade timeout options", async (timeouts) => {
    await expect(
      startNodeRequestServer({
        onUpgrade() {},
        port: 0,
        render: async () => new Response("ok"),
        ...timeouts,
      }),
    ).rejects.toThrow("finite non-negative safe integer");
  });

  test("rejects invalid configured origins before listening", async () => {
    await expect(
      startNodeRequestServer({
        onUpgrade() {},
        port: 0,
        render: async () => new Response("ok"),
        upgradeOriginPolicy: { allowedOrigins: ["https://app.example/path"] },
      }),
    ).rejects.toThrow("Invalid HTTP upgrade allowed origin");
  });

  test("rejects cross-origin browser upgrades before invoking the handler", async () => {
    const handler = vi.fn();
    const server = await startNodeRequestServer({
      hostname: "127.0.0.1",
      hostPolicy: "strict",
      onUpgrade: handler,
      port: 0,
      render: async () => new Response("ok"),
    });

    try {
      await expect(
        openUpgrade(server.url, "/ws", { Origin: "https://evil.test" }),
      ).resolves.toMatchObject({ closed: true });
      await expect(
        openUpgrade(server.url, "/ws", {
          Host: "evil.test",
          Origin: "https://evil.test",
        }),
      ).resolves.toMatchObject({ closed: true });
      await expect(openUpgrade(server.url, "/ws")).resolves.toMatchObject({ closed: true });
      expect(handler).not.toHaveBeenCalled();
    } finally {
      await server.close();
    }
  });

  test("contains failures while deriving the upgrade origin", async () => {
    const events: AppRouterLogEvent[] = [];
    const handler = vi.fn();
    const server = await startNodeRequestServer({
      hostPolicy: "trusted-proxy",
      logger: {
        error(event) {
          events.push(event);
        },
        warn(event) {
          events.push(event);
        },
      },
      onUpgrade: handler,
      port: 0,
      render: async () => new Response("ok"),
    });

    try {
      await expect(
        openUpgrade(server.url, "/ws", {
          Host: "app.example/invalid",
          Origin: "http://app.example",
        }),
      ).resolves.toMatchObject({ closed: true });
      await expect(httpText(server.url)).resolves.toBe("ok");
      expect(handler).not.toHaveBeenCalled();
      await vi.waitFor(() => {
        expect(events).toContainEqual(
          expect.objectContaining({ path: "/ws", type: "router:upgrade:rejected" }),
        );
      });
      expect(JSON.stringify(events)).not.toContain("app.example/invalid");
    } finally {
      await server.close();
    }
  });

  test("uses the validated request authority for wildcard binds", async () => {
    const handler = vi.fn((_request: IncomingMessage, socket: Duplex) => socket.end());
    const server = await startNodeRequestServer({
      hostname: "0.0.0.0",
      onUpgrade: handler,
      port: 0,
      render: async () => new Response("ok"),
    });
    const port = new URL(server.url).port;

    try {
      await expect(
        openUpgrade(server.url, "/ws", {
          Host: `localhost:${port}`,
          Origin: `http://localhost:${port}`,
        }),
      ).resolves.toMatchObject({ closed: true });
      expect(handler).toHaveBeenCalledOnce();
    } finally {
      await server.close();
    }
  });

  test("uses trusted forwarded protocol with the public request authority", async () => {
    const handler = vi.fn((_request: IncomingMessage, socket: Duplex) => socket.end());
    const server = await startNodeRequestServer({
      hostPolicy: "trusted-proxy",
      onUpgrade: handler,
      port: 0,
      render: async () => new Response("ok"),
      trustForwardedProto: true,
    });

    try {
      await expect(
        openUpgrade(server.url, "/ws", {
          Host: "app.example",
          Origin: "https://app.example",
          "X-Forwarded-Proto": "https",
        }),
      ).resolves.toMatchObject({ closed: true });
      expect(handler).toHaveBeenCalledOnce();
    } finally {
      await server.close();
    }
  });

  test("formats IPv6 bind authorities for default same-origin validation", async () => {
    const handler = vi.fn((_request: IncomingMessage, socket: Duplex) => socket.end());
    const server = await startNodeRequestServer({
      hostname: "::1",
      onUpgrade: handler,
      port: 0,
      render: async () => new Response("ok"),
    });

    try {
      const parsed = new URL(server.url);
      expect(parsed.hostname).toBe("[::1]");
      await expect(openUpgrade(server.url, "/ws", { Origin: server.url })).resolves.toMatchObject({
        closed: true,
      });
      expect(handler).toHaveBeenCalledOnce();
    } finally {
      await server.close();
    }
  });
});

function incomingRequest(headers: Record<string, string>): import("node:http").IncomingMessage {
  return { headers } as import("node:http").IncomingMessage;
}

function httpText(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const request = httpRequest(url, (response) => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => {
        body += chunk;
      });
      response.on("end", () => resolve(body));
    });
    request.on("error", reject);
    request.end();
  });
}

function openUpgrade(
  url: string,
  path: string,
  headers: Record<string, string> = {},
): Promise<{ closed: true; response: string }> {
  const parsed = new URL(url);

  return new Promise((resolve, reject) => {
    const socket: Socket = connect(Number(parsed.port), parsed.hostname.replace(/^\[|\]$/g, ""));
    let response = "";
    const timeout = setTimeout(() => {
      socket.destroy();
      reject(new Error("Timed out waiting for the upgrade socket to close."));
    }, 1000);

    socket.setEncoding("utf8");
    socket.on("connect", () => {
      const host = headers.Host ?? parsed.host;
      const extraHeaders = Object.entries(headers)
        .filter(([name]) => name.toLowerCase() !== "host")
        .map(([name, value]) => `${name}: ${value}\r\n`)
        .join("");
      socket.write(
        `GET ${path} HTTP/1.1\r\nHost: ${host}\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n${extraHeaders}\r\n`,
      );
    });
    socket.on("data", (chunk) => {
      response += chunk;
    });
    socket.on("close", () => {
      clearTimeout(timeout);
      resolve({ closed: true, response });
    });
    socket.on("error", (error) => {
      if ((error as NodeJS.ErrnoException).code === "ECONNRESET") {
        return;
      }
      clearTimeout(timeout);
      reject(error);
    });
  });
}
