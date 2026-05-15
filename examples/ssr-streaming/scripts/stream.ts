// demo:stream — server-stream target. Prints chunks to stdout in the
// order the compiled module pushes them into the sink.
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
    const page = await server.ssrLoadModule("./src/StreamPage.tsx");
    const runtime = await server.ssrLoadModule("@reckona/mreact-server");

    console.log("=== server-stream chunks ===");
    const start = Date.now();
    await page.App({
      append(chunk: string) {
        const elapsed = (Date.now() - start).toString().padStart(4, " ");
        console.log(`+${elapsed}ms ${JSON.stringify(chunk)}`);
      },
    });

    console.log("\n=== joined output ===");
    console.log(await runtime.renderToString(page.App));
  } finally {
    await server.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
