import { createServer } from "node:http";
import { gzipSync } from "node:zlib";
import { afterEach, describe, expect, it } from "vitest";
import {
  measureBackForwardDomRestore,
  measureBackForwardRestore,
  measureHydrationIslands,
  measureRouteJavaScriptGzipBytePhases,
} from "./browser-probes.js";

const servers: Array<{ close: () => Promise<void> }> = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));
});

describe("router browser probes", () => {
  it.each([
    {
      mode: "compat remount",
      counterPrefix: "compat count: ",
      restoredCount: 0 as const,
      options: { counterPrefix: "compat count: ", expectedCountAfterBack: 0 as const },
    },
    {
      mode: "native state restore",
      counterPrefix: "count: ",
      restoredCount: 1 as const,
      options: undefined,
    },
    {
      mode: "custom-prefix permissive restore",
      counterPrefix: "compat count: ",
      restoredCount: 0 as const,
      options: { counterPrefix: "compat count: ", expectStateRestore: false },
    },
  ])(
    "checks $mode after back-forward navigation",
    async ({ counterPrefix, restoredCount, options }) => {
      const url = await startHistoryCounterFixture(counterPrefix, restoredCount);

      expect(await measureBackForwardRestore(url, options)).toBeGreaterThan(0);
    },
    20_000,
  );

  it("rejects a full document navigation in the back-forward probe", async () => {
    const url = await startScriptFixture({
      "/": `<!doctype html><button type="button" onclick="this.textContent='count: 1'">count: 0</button><a href="/details">Details</a>`,
      "/details": "<!doctype html><h1>Navigation target</h1>",
    });

    await expect(measureBackForwardRestore(url)).rejects.toThrow("full document reload");
  }, 20_000);

  it("measures asynchronous history DOM restoration inside the browser", async () => {
    const url = await startHistoryCounterFixture("count: ", 1, { backDelayMs: 30 });

    expect(await measureBackForwardDomRestore(url)).toBeGreaterThanOrEqual(25);
  }, 20_000);

  it("starts timing before a synchronous popstate handler runs", async () => {
    const url = await startHistoryCounterFixture("count: ", 1, { backBlockMs: 10 });

    expect(await measureBackForwardDomRestore(url)).toBeGreaterThanOrEqual(8);
  }, 20_000);

  it("includes delayed forward restoration in the sum", async () => {
    const url = await startHistoryCounterFixture("count: ", 1, { forwardDelayMs: 50 });

    expect(await measureBackForwardDomRestore(url)).toBeGreaterThanOrEqual(40);
  }, 20_000);

  it("waits for retained hidden routes to become visible", async () => {
    const url = await startRetainedHistoryFixture();

    expect(await measureBackForwardDomRestore(url)).toBeGreaterThanOrEqual(120);
  }, 20_000);

  it("measures the first visible route DOM before later state updates", async () => {
    const url = await startDelayedRestoredCountFixture();

    expect(await measureBackForwardDomRestore(url)).toBeLessThan(30);
  }, 20_000);

  it("reports missing browser timing state", async () => {
    const url = await startHistoryCounterFixture("count: ", 1, { dropTimingsOnForward: true });

    await expect(measureBackForwardDomRestore(url)).rejects.toThrow(
      "back-forward DOM timing was not captured for both traversals",
    );
  }, 20_000);

  it("rejects a full document navigation in the DOM restoration probe", async () => {
    const url = await startScriptFixture({
      "/": `<!doctype html><button type="button" onclick="this.textContent='count: 1'">count: 0</button><a href="/details">Details</a>`,
      "/details": "<!doctype html><h1>Navigation target</h1>",
    });

    await expect(measureBackForwardDomRestore(url)).rejects.toThrow("full document reload");
  }, 20_000);

  it.each(["last-only", "shared"])("rejects %s island interactions", async (mode) => {
    const buttons = Array.from({ length: 3 }, (_, i) => `<button>island ${i}: 0</button>`).join("");
    const script =
      mode === "last-only"
        ? "document.querySelectorAll('button')[2].onclick=e=>e.target.textContent='island 2: 1'"
        : "document.querySelectorAll('button').forEach(b=>b.onclick=()=>document.querySelectorAll('button').forEach((x,i)=>x.textContent='island '+i+': 1'))";
    const url = await startScriptFixture({
      "/": `<!doctype html>${buttons}<script>${script}</script>`,
    });
    await expect(measureHydrationIslands(url, 3, { timeoutMs: 500 })).rejects.toThrow();
  });

  it.each([3, 100])(
    "verifies all %i independent islands with ordinary clicks",
    async (count) => {
      const buttons = Array.from(
        { length: count },
        (_, i) => `<button>island ${i}: 0</button>`,
      ).join("");
      const url = await startScriptFixture({
        "/": `<!doctype html>${buttons}<script>document.querySelectorAll('button').forEach((b,i)=>b.onclick=()=>b.textContent='island '+i+': 1')</script>`,
      });
      expect(await measureHydrationIslands(url, count, { timeoutMs: 1000 })).toBeGreaterThan(0);
    },
    15_000,
  );
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

async function startHistoryCounterFixture(
  counterPrefix: string,
  restoredCount: 0 | 1,
  options: {
    backDelayMs?: number;
    backBlockMs?: number;
    forwardDelayMs?: number;
    dropTimingsOnForward?: boolean;
  } = {},
): Promise<string> {
  return startScriptFixture({
    "/": `<!doctype html><main id="app"></main><script>
const app = document.getElementById("app");
const prefix = ${JSON.stringify(counterPrefix)};
const restoredCount = ${restoredCount};
const backDelayMs = ${options.backDelayMs ?? 0};
const backBlockMs = ${options.backBlockMs ?? 0};
const forwardDelayMs = ${options.forwardDelayMs ?? 0};
const dropTimingsOnForward = ${options.dropTimingsOnForward === true};
let homeVisits = 0;
function showHome() {
  const count = homeVisits++ === 0 ? 0 : restoredCount;
  const decoys = homeVisits > 1 ? (restoredCount === 0 ? '<button type="button">' + prefix + count + ' stale</button>' : '') + '<button type="button">Other action</button>' : '';
  app.innerHTML = decoys + '<button id="counter" type="button">' + prefix + count + '</button><a href="/details">Details</a>';
  app.querySelector("#counter").addEventListener("click", (event) => {
    event.currentTarget.textContent = prefix + (count + 1);
  });
  app.querySelector("a").addEventListener("click", (event) => {
    event.preventDefault();
    history.pushState({}, "", "/details");
    showDetails();
  });
}

function showDetails() { app.innerHTML = '<h1>Navigation target</h1>'; }
addEventListener("popstate", () => {
  if (location.pathname === "/details") {
    if (dropTimingsOnForward) delete globalThis.__mreactBackForwardDomTimings;
    if (forwardDelayMs > 0) setTimeout(showDetails, forwardDelayMs);
    else showDetails();
    return;
  }
  if (backDelayMs > 0) { setTimeout(showHome, backDelayMs); return; }
  const end = performance.now() + backBlockMs;
  while (performance.now() < end) {}
  showHome();
});
showHome();
</script>`,
  });
}

async function startRetainedHistoryFixture(): Promise<string> {
  return startScriptFixture({
    "/": `<!doctype html><main id="home"><button type="button">count: 0</button><a href="/details">Details</a></main><main id="details" hidden><h1>Navigation target</h1></main><script>
const home = document.getElementById("home");
const details = document.getElementById("details");
document.querySelector("button").addEventListener("click", (event) => { event.currentTarget.textContent = "count: 1"; });
document.querySelector("a").addEventListener("click", (event) => {
  event.preventDefault();
  history.pushState({}, "", "/details");
  home.hidden = true;
  details.hidden = false;
});
addEventListener("popstate", () => {
  setTimeout(() => {
    home.hidden = location.pathname === "/details";
    details.hidden = !home.hidden;
  }, 70);
});
</script>`,
  });
}

async function startDelayedRestoredCountFixture(): Promise<string> {
  return startScriptFixture({
    "/": `<!doctype html><main id="app"></main><script>
const app = document.getElementById("app");
function showHome(count) {
  app.innerHTML = '<button type="button">count: ' + count + '</button><a href="/details">Details</a>';
  app.querySelector("button").addEventListener("click", (event) => { event.currentTarget.textContent = "count: 1"; });
  app.querySelector("a").addEventListener("click", (event) => {
    event.preventDefault();
    history.pushState({}, "", "/details");
    app.innerHTML = '<h1>Navigation target</h1>';
  });
}
addEventListener("popstate", () => {
  if (location.pathname === "/details") { app.innerHTML = '<h1>Navigation target</h1>'; return; }
  showHome(0);
  setTimeout(() => { app.querySelector("button").textContent = "count: 1"; }, 70);
});
showHome(0);
</script>`,
  });
}
