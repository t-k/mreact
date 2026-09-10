import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { build } from "vite";
import { expect, test } from "vitest";
import { installDevtools } from "@reckona/mreact-devtools";
import type { QueryClient } from "../src/index.js";

test.each([undefined, true, false])(
  "query instrumentation respects the client devtools define (%s)",
  async (enabled) => {
    const root = await mkdtemp(join(tmpdir(), "mreact-query-devtools-bundle-"));
    const devtools = installDevtools();
    let client: QueryClient | undefined;
    try {
      const entry = join(root, "entry.ts");
      await writeFile(
        entry,
        `export { createQueryClient } from ${JSON.stringify(resolve("packages/query/src/index.ts"))};`,
      );
      const result = await build({
        configFile: false,
        logLevel: "silent",
        ...(enabled === undefined
          ? {}
          : { define: { __MREACT_CLIENT_DEVTOOLS__: String(enabled) } }),
        build: {
          write: false,
          minify: true,
          lib: { entry, formats: ["es"] },
        },
      });
      const output = Array.isArray(result) ? result[0] : result;
      if (!("output" in output)) throw new Error("Expected a bundle output");
      const chunk = output.output.find((item) => item.type === "chunk");
      if (chunk === undefined) throw new Error("Expected a JavaScript chunk");
      for (const marker of [
        "__mreactDevtools",
        "query:update",
        "inactive-query",
        "subscription:",
      ]) {
        expect(chunk.code.includes(marker), marker).toBe(enabled !== false);
      }
      const bundled = await import(
        `data:text/javascript;base64,${Buffer.from(chunk.code).toString("base64")}`
      );
      client = bundled.createQueryClient();
      if (client === undefined) throw new Error("Expected a query client");
      const received: unknown[] = [];
      const unsubscribe = client.subscribe(["profile"], (entry) => received.push(entry.data));
      client.setQueryData(["profile"], "Ada");
      expect(client.getQueryData(["profile"])).toBe("Ada");
      expect(received).toEqual(["Ada"]);
      unsubscribe();
      expect(devtools.events().some((event) => event.type === "query:update")).toBe(
        enabled !== false,
      );
      expect(
        devtools
          .resources()
          .snapshot()
          .some((resource) => resource.kind === "inactive-query"),
      ).toBe(enabled !== false);
      client.removeQueries();
      expect(
        devtools
          .resources()
          .snapshot()
          .filter((resource) => resource.status === "live"),
      ).toEqual([]);
    } finally {
      client?.removeQueries();
      devtools.dispose();
      await rm(root, { recursive: true, force: true });
    }
  },
);
