// demo:string — server-string target. Boots Vite in middleware mode,
// loads StringPage.tsx through the @reckona/mreact-vite plugin compiled
// for the server-string target, and prints the returned HTML string.
import { createServer } from "vite";
import { modularReact } from "@reckona/mreact-vite";

async function main(): Promise<void> {
  const server = await createServer({
    configFile: false,
    plugins: [modularReact({ serverOutput: "string" })],
    appType: "custom",
    server: { middlewareMode: true, hmr: false },
    logLevel: "warn",
    optimizeDeps: { noDiscovery: true, include: [] },
  });

  try {
    const module = await server.ssrLoadModule("./src/StringPage.tsx");
    console.log("=== server-string output ===");
    console.log(module.App());
  } finally {
    await server.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
