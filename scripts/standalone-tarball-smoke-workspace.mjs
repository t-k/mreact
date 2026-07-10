import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export async function withStandaloneSmokeWorkspace(callback, options = {}) {
  const temporaryDirectory = options.temporaryDirectory ?? tmpdir();
  const smokeDir = await mkdtemp(join(temporaryDirectory, "mreact-standalone-tarball-smoke-"));
  const workspace = {
    appDir: join(smokeDir, "app"),
    packDir: join(smokeDir, "packages"),
    smokeDir,
  };

  try {
    return await callback(workspace);
  } finally {
    await rm(smokeDir, { force: true, recursive: true });
  }
}
