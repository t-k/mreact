import { access, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { createTemporaryDirectoryOwner } from "./temporary-directories.js";

it("removes every allocated directory even when fixture initialization never completes", async () => {
  const parent = await mkdtemp(join(tmpdir(), "mreact-directory-owner-test-"));
  const owner = createTemporaryDirectoryOwner();
  try {
    const first = await owner.create(join(parent, "failed-build-"));
    await writeFile(join(first, "partial-output"), "incomplete");
    const second = await owner.create(join(parent, "retry-"));
    // A fixture may already have removed its own directory before global teardown.
    await rm(second, { recursive: true });
    await expect(owner.create(join(parent, "missing", "invalid-"))).rejects.toThrow();
    await owner.closeAll();
    await expect(access(first)).rejects.toThrow();
    await expect(access(second)).rejects.toThrow();
    await expect(access(parent)).resolves.toBeUndefined();
    await owner.closeAll();
    const third = await owner.create(join(parent, "next-run-"));
    await owner.closeAll();
    await expect(access(third)).rejects.toThrow();
  } finally {
    await owner.closeAll();
    await rm(parent, { recursive: true, force: true });
  }
});
