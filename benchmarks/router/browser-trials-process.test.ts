import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { expect, it } from "vitest";

it("runs serialized browser observation through the production tsx loader", async () => {
  const result = await promisify(execFile)(
    process.execPath,
    [
      "--import",
      "tsx",
      fileURLToPath(new URL("./test-fixtures/browser-trial-process.ts", import.meta.url)),
    ],
    { timeout: 15000 },
  );
  expect(result.stdout).toContain("verified tsx browser trial");
}, 20000);
