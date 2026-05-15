// demo:await — server-stream target + <Await> boundary.
//
// Each chunk is printed with its elapsed time so the resolve/reject
// order is visible. The boundary with a rejecting promise demonstrates
// the `catch` renderer.
import { createServer } from "vite";
import { modularReact } from "@reckona/mreact-vite";

async function main(): Promise<void> {
  const server = await createServer({
    configFile: false,
    plugins: [modularReact({ serverOutput: "stream" })],
    appType: "custom",
    server: { middlewareMode: true, hmr: false },
    logLevel: "warn",
    optimizeDeps: { noDiscovery: true, include: [] },
  });

  try {
    const page = await server.ssrLoadModule("./src/AwaitPage.tsx");

    console.log("=== <Await> chunk-by-chunk ===");
    const start = Date.now();
    await page.App({
      append(chunk: string) {
        const elapsed = (Date.now() - start).toString().padStart(4, " ");
        console.log(`+${elapsed}ms ${JSON.stringify(chunk)}`);
      },
    });
  } finally {
    await server.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
