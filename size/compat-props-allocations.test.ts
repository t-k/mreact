import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { saveAllocationProfile } from "./compat-props-allocations.mjs";

const directories: string[] = [];
async function outputDirectory() {
  const directory = await mkdtemp(join(tmpdir(), "mreact-allocation-test-"));
  directories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

test("preserves the complete call tree and sample-to-node references", async () => {
  const output = await outputDirectory();
  const profile = {
    head: {
      id: 1,
      callFrame: {
        functionName: "(root)",
        scriptId: "0",
        url: "",
        lineNumber: -1,
        columnNumber: -1,
      },
      selfSize: 0,
      children: [
        {
          id: 2,
          callFrame: {
            functionName: "update",
            scriptId: "7",
            url: "http://localhost/entry.js",
            lineNumber: 0,
            columnNumber: 42,
          },
          selfSize: 65536,
          children: [],
        },
      ],
    },
    samples: [{ size: 65536, nodeId: 2, ordinal: 1 }],
  };
  const file = await saveAllocationProfile({ output, kind: "multiple", trial: 2, profile });
  expect(file).toBe("multiple-trial-2-allocations.json");
  expect(JSON.parse(await readFile(join(output, file), "utf8"))).toEqual(profile);
});

test("keeps profiles separate for each kind and trial, including empty samples", async () => {
  const output = await outputDirectory();
  for (const [kind, trial] of [
    ["single", 0],
    ["single", 1],
    ["host-commit", 0],
  ] as const) {
    await saveAllocationProfile({
      output,
      kind,
      trial,
      profile: { head: { id: trial + 1 }, samples: [] },
    });
  }
  expect((await readdir(output)).sort()).toEqual([
    "host-commit-trial-0-allocations.json",
    "single-trial-0-allocations.json",
    "single-trial-1-allocations.json",
  ]);
  for (const [kind, trial] of [
    ["single", 0],
    ["single", 1],
    ["host-commit", 0],
  ] as const) {
    const saved = JSON.parse(
      await readFile(join(output, `${kind}-trial-${trial}-allocations.json`), "utf8"),
    );
    expect(saved).toEqual({ head: { id: trial + 1 }, samples: [] });
  }
});

test("propagates write failures instead of reporting an unsaved profile", async () => {
  const output = join(await outputDirectory(), "missing");
  await expect(
    saveAllocationProfile({ output, kind: "object", trial: 0, profile: {} }),
  ).rejects.toMatchObject({ code: "ENOENT" });
});
