import { createServer } from "node:http";
import { gzipSync } from "node:zlib";
import { afterEach, describe, expect, it } from "vitest";
import { measureRouteJavaScriptGzipBytePhases } from "./browser-probes.js";

const servers: Array<{ close: () => Promise<void> }> = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));
});

describe("router browser probes", () => {
  it("separates script bytes needed before interaction from idle-settled bytes", async () => {
    const mainScript = `const button = document.querySelector("button");
button.disabled = false;
button.addEventListener("click", () => {
  button.textContent = "count: 1";
});
setTimeout(() => {
  const script = document.createElement("script");
  script.src = "/idle.js";
  document.head.append(script);
}, 150);`;
    const idleScript = `globalThis.__idleLoaded = true;${"x".repeat(1000)}`;
    const url = await startScriptFixture({
      "/": `<!doctype html><button type="button" disabled>count: 0</button><script src="/main.js"></script>`,
      "/main.js": mainScript,
      "/idle.js": idleScript,
    });

    const result = await measureRouteJavaScriptGzipBytePhases(url, { assertInteractive: true });

    expect(result.beforeInteractionBytes).toBe(gzipSync(Buffer.from(mainScript)).length);
    expect(result.afterIdleBytes).toBe(
      gzipSync(Buffer.from(mainScript)).length + gzipSync(Buffer.from(idleScript)).length,
    );
  }, 20_000);

  it("does not count click-triggered scripts as bytes before interaction", async () => {
    const mainScript = `const button = document.querySelector("button");
button.disabled = false;
button.addEventListener("click", () => {
  const script = document.createElement("script");
  script.src = "/click.js";
  script.addEventListener("load", () => {
    button.textContent = "count: 1";
  });
  document.head.append(script);
});`;
    const clickScript = `globalThis.__clickLoaded = true;${"y".repeat(1000)}`;
    const url = await startScriptFixture({
      "/": `<!doctype html><button type="button" disabled>count: 0</button><script src="/main.js"></script>`,
      "/main.js": mainScript,
      "/click.js": clickScript,
    });

    const result = await measureRouteJavaScriptGzipBytePhases(url, { assertInteractive: true });

    expect(result.beforeInteractionBytes).toBe(gzipSync(Buffer.from(mainScript)).length);
    expect(result.afterIdleBytes).toBe(
      gzipSync(Buffer.from(mainScript)).length + gzipSync(Buffer.from(clickScript)).length,
    );
  }, 20_000);
});

async function startScriptFixture(routes: Record<string, string>): Promise<string> {
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    const body = routes[url.pathname];
    if (body === undefined) {
      response.writeHead(404);
      response.end("not found");
      return;
    }
    response.writeHead(200, {
      "content-type": url.pathname.endsWith(".js")
        ? "text/javascript; charset=utf-8"
        : "text/html; charset=utf-8",
    });
    response.end(body);
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });

  servers.push({
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error === undefined ? resolve() : reject(error)));
      }),
  });

  const address = server.address();
  if (typeof address !== "object" || address === null) {
    throw new Error("script fixture did not bind a TCP port");
  }

  return `http://127.0.0.1:${address.port}`;
}
