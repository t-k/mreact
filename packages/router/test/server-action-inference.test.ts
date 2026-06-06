import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import {
  __resetServerActionInferenceTypeScriptForTests,
  collectRuntimeInferredServerActions,
  hasUseServerDirectiveInSource,
} from "../src/server-action-inference.js";

describe("server action inference", () => {
  test("reuses runtime inference while imported action sources are unchanged", async () => {
    __resetServerActionInferenceTypeScriptForTests();
    const appDir = await mkdtemp(join(tmpdir(), "mreact-action-inference-cache-"));
    const pageFile = join(appDir, "page.tsx");
    const actionFile = join(appDir, "actions.ts");
    const pageSource = `import { save } from "./actions";

export default function Page() {
  return <form action={save}><button type="submit">Save</button></form>;
}`;
    await mkdir(appDir, { recursive: true });
    await writeFile(pageFile, pageSource);
    await writeFile(actionFile, `"use server";
export async function save() {}`);
    let useServerReads = 0;
    const fileSystem = {
      isUseServerFile: async (file: string) => {
        useServerReads += 1;
        return hasUseServerDirectiveInSource({
          code: await readFile(file, "utf8"),
          filename: file,
        });
      },
      resolveSourceFile: async (directory: string, source: string) => {
        const candidate = join(directory, `${source}.ts`);
        try {
          await readFile(candidate, "utf8");
          return candidate;
        } catch {
          return undefined;
        }
      },
    };

    const first = await collectRuntimeInferredServerActions({
      appDir,
      code: pageSource,
      fileSystem,
      pageFile,
    });
    const second = await collectRuntimeInferredServerActions({
      appDir,
      code: pageSource,
      fileSystem,
      pageFile,
    });

    expect(first.references.size).toBe(1);
    expect(second.references.size).toBe(1);
    expect(useServerReads).toBe(1);

    await writeFile(actionFile, `export async function save() {}`);
    await collectRuntimeInferredServerActions({
      appDir,
      code: pageSource,
      fileSystem,
      pageFile,
    });

    expect(useServerReads).toBe(2);
  });
});
