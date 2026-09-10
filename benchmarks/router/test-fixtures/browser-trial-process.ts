import assert from "node:assert/strict";
import { createServer } from "node:http";
import { measureBrowserTrial } from "../browser-trials.js";

const server = createServer((_request, response) => {
  response.setHeader("content-type", "text/html");
  response.end(
    "<!doctype html><button>count: 0</button><script>let n=0;window.addEventListener('click',e=>{e.stopImmediatePropagation();e.target.textContent='count: '+(++n)},true)</script>",
  );
});
await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
try {
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No server address");
  const trial = await measureBrowserTrial(
    { url: `http://127.0.0.1:${address.port}`, counterPrefix: "count: " },
    "domcontentloaded",
    { timeoutMs: 1000 },
  );
  assert.equal(trial.status, "completed", trial.error);
  console.log("verified tsx browser trial");
} finally {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
    server.closeAllConnections();
  });
}
