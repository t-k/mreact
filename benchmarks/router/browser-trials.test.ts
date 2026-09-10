import { createServer } from "node:http";
import { afterEach, expect, it } from "vitest";
import { measureBrowserTrial } from "./browser-trials.js";

const servers: ReturnType<typeof createServer>[] = [];
afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve, reject) => {
          server.close((error) => (error ? reject(error) : resolve()));
          server.closeAllConnections();
        }),
    ),
  );
});

async function fixture(script = "", prefix = "count: ", body?: string, pending = false) {
  const server = createServer((req, res) => {
    if (pending && req.url === "/pending") return;
    res.setHeader("content-type", "text/html");
    res.end(
      `<!doctype html><main>${body ?? `<button>${prefix}0</button>`}</main><script>${script}</script>`,
    );
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No server address");
  return { url: `http://127.0.0.1:${address.port}`, counterPrefix: prefix };
}

it.each(["text", "replace", "delayed"])(
  "records same-clock boundaries for %s updates",
  async (mode) => {
    const target = await fixture(`const b=document.querySelector('button');let n=0;b.onclick=()=>{
    const update=()=>{n++;${mode === "replace" ? "b.replaceChildren(document.createTextNode('count: '+n))" : "b.firstChild.data='count: '+n"}};
    ${mode === "delayed" ? "setTimeout(update,60)" : "update()"}
  };`);
    const trial = await measureBrowserTrial(target, "domcontentloaded", { timeoutMs: 1500 });
    expect(trial.status).toBe("completed");
    expect(trial.ssrVerified).toBe(true);
    expect(trial.first?.eventToDomMs).toBeGreaterThanOrEqual(mode === "delayed" ? 40 : 0);
    expect(trial.first?.e2eMs).toBeGreaterThanOrEqual(trial.first!.eventToDomMs);
    expect(trial.first?.domObservedMs).toBeGreaterThanOrEqual(trial.first!.dispatchMs);
    expect(trial.second?.dispatchMs).toBeGreaterThanOrEqual(trial.first!.domObservedMs);
    expect(trial.navigationToVerifiedMs).toBe(trial.first?.domObservedMs);
  },
);

it("rejects a visible counter with no handler and preserves its display measurement", async () => {
  const trial = await measureBrowserTrial(await fixture(), "domcontentloaded", { timeoutMs: 500 });
  expect(trial.status).toBe("failed");
  expect(trial.ssrVerified).toBe(true);
  expect(trial.initialContentMs).toBeGreaterThanOrEqual(0);
  expect(trial.stage).toBe("first interaction");
  expect(trial.error).toBeTruthy();
  expect(trial.failedInteraction?.dispatchMs).toBeGreaterThanOrEqual(0);
  expect(trial.failedInteraction?.actualText).toBe("count: 0");
});

it("accepts a newly created replacement counter with working subsequent interactions", async () => {
  const target = await fixture(
    `function bind(b,n){b.onclick=()=>{const next=document.createElement('button');next.textContent='count: '+(n+1);bind(next,n+1);b.replaceWith(next)}}bind(document.querySelector('button'),0)`,
  );
  const trial = await measureBrowserTrial(target, "domcontentloaded", { timeoutMs: 1500 });
  expect(trial.status).toBe("completed");
  expect(trial.second?.domObservedMs).toBeGreaterThanOrEqual(trial.first!.domObservedMs);
});

it("rejects insertion of another counter before the unchanged clicked counter", async () => {
  const target = await fixture(
    `const a=document.querySelector('button');a.onclick=()=>{const b=document.createElement('button');b.textContent='count: 1';b.onclick=()=>b.textContent='count: 2';a.before(b)}`,
  );
  const trial = await measureBrowserTrial(target, "domcontentloaded", { timeoutMs: 500 });
  expect(trial.status).toBe("failed");
  expect(trial.stage).toBe("first interaction");
});

it("does not report after-networkidle measurements when idle was never reached", async () => {
  const target = await fixture(
    "fetch('/pending');let n=0;document.querySelector('button').onclick=e=>e.target.textContent='count: '+(++n)",
    "count: ",
    undefined,
    true,
  );
  const trial = await measureBrowserTrial(target, "networkidle", { timeoutMs: 700 });
  expect(trial.status).toBe("failed");
  expect(trial.stage).toBe("network idle");
  expect(trial.networkIdleReached).toBe(false);
  expect(trial.first).toBeUndefined();
});

it("rejects client-only content in the SSR check", async () => {
  const trial = await measureBrowserTrial(
    await fixture(
      "document.querySelector('main').innerHTML='<button>count: 0</button>'",
      "count: ",
      "",
    ),
    "domcontentloaded",
    { timeoutMs: 500 },
  );
  expect(trial.status).toBe("failed");
  expect(trial.stage).toBe("SSR content");
});

it("uses explicit compat counter names", async () => {
  const target = await fixture(
    "let n=0;document.querySelector('button').onclick=e=>e.target.textContent='compat count: '+(++n)",
    "compat count: ",
  );
  expect((await measureBrowserTrial(target, "networkidle", { timeoutMs: 1500 })).status).toBe(
    "completed",
  );
});

it("does not accept another button's expected value as the clicked counter update", async () => {
  const target = await fixture("", "count: ", "<button>count: 0</button><button>count: 1</button>");
  const trial = await measureBrowserTrial(target, "domcontentloaded", { timeoutMs: 500 });
  expect(trial.status).toBe("failed");
  expect(trial.first).toBeUndefined();
});

it("rejects ambiguous initial counters", async () => {
  const trial = await measureBrowserTrial(
    await fixture("", "count: ", "<button>count: 0</button><button>count: 0</button>"),
    "domcontentloaded",
    { timeoutMs: 500 },
  );
  expect(trial.status).toBe("failed");
  expect(trial.error).toContain("strict mode");
});

it("does not mistake an existing sibling moving into the counter slot for an update", async () => {
  const target = await fixture(
    "const [a,b]=document.querySelectorAll('button');a.onclick=()=>a.remove();b.onclick=()=>b.textContent='count: 2'",
    "count: ",
    "<button>count: 0</button><button>count: 1</button>",
  );
  const trial = await measureBrowserTrial(target, "domcontentloaded", { timeoutMs: 500 });
  expect(trial.status).toBe("failed");
  expect(trial.first).toBeUndefined();
});
