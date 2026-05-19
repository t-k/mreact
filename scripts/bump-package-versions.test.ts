import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import {
  findVersionMismatches,
  findCreateAppDependencyRangeMismatches,
  isValidSemver,
  main,
  readVersionedPackageManifests,
  updateCreateAppDependencyRanges,
  updatePackageVersions,
} from "./bump-package-versions.mjs";

describe("package version bump script", () => {
  test("updates the root package and public workspace packages", async () => {
    const rootDir = await createFixtureWorkspace();

    const manifests = await readVersionedPackageManifests(rootDir);
    expect(manifests.map((manifest) => relativePath(rootDir, manifest.path))).toEqual([
      "package.json",
      "packages/alpha/package.json",
      "packages/beta/package.json",
    ]);

    await updatePackageVersions(manifests, "0.0.2");

    await expect(readVersion(rootDir, "package.json")).resolves.toBe("0.0.2");
    await expect(readVersion(rootDir, "packages/alpha/package.json")).resolves.toBe("0.0.2");
    await expect(readVersion(rootDir, "packages/beta/package.json")).resolves.toBe("0.0.2");
    await expect(readVersion(rootDir, "packages/private/package.json")).resolves.toBe("0.0.1");
  });

  test("updates create-mreact-app scaffold dependency ranges", async () => {
    const rootDir = await createFixtureWorkspace();

    await expect(findCreateAppDependencyRangeMismatches(rootDir, "0.0.2")).resolves.toEqual([
      {
        actual: "^0.0.1",
        path: `${join(rootDir, "packages/create-mreact-app/src/index.ts")} @reckona/mreact-auth`,
      },
      {
        actual: "^0.0.1",
        path: `${join(rootDir, "packages/create-mreact-app/src/index.ts")} @reckona/mreact-devtools`,
      },
      {
        actual: "^0.0.1",
        path: `${join(rootDir, "packages/create-mreact-app/src/index.ts")} @reckona/mreact-forms`,
      },
      {
        actual: "^0.0.1",
        path: `${join(rootDir, "packages/create-mreact-app/src/index.ts")} @reckona/mreact`,
      },
      {
        actual: "^0.0.1",
        path: `${join(rootDir, "packages/create-mreact-app/src/index.ts")} @reckona/mreact-query`,
      },
      {
        actual: "^0.0.1",
        path: `${join(
          rootDir,
          "packages/create-mreact-app/src/index.ts",
        )} @reckona/mreact-reactive-core`,
      },
      {
        actual: "^0.0.1",
        path: `${join(rootDir, "packages/create-mreact-app/src/index.ts")} @reckona/mreact-router`,
      },
    ]);

    await expect(updateCreateAppDependencyRanges(rootDir, "0.0.2")).resolves.toBe(7);

    const source = await readFile(join(rootDir, "packages/create-mreact-app/src/index.ts"), "utf8");
    expect(source).toContain('"@reckona/mreact-auth": "^0.0.2"');
    expect(source).toContain('"@reckona/mreact-devtools": "^0.0.2"');
    expect(source).toContain('"@reckona/mreact-forms": "^0.0.2"');
    expect(source).toContain('"@reckona/mreact": "^0.0.2"');
    expect(source).toContain('"@reckona/mreact-query": "^0.0.2"');
    expect(source).toContain('"@reckona/mreact-reactive-core": "^0.0.2"');
    expect(source).toContain('"@reckona/mreact-router": "^0.0.2"');
  });

  test("reports mismatches in check mode", async () => {
    const rootDir = await createFixtureWorkspace();
    const manifests = await readVersionedPackageManifests(rootDir);

    expect(findVersionMismatches(manifests, "0.0.2")).toEqual([
      {
        actual: "0.0.1",
        path: join(rootDir, "package.json"),
      },
      {
        actual: "0.0.1",
        path: join(rootDir, "packages/alpha/package.json"),
      },
      {
        actual: "0.0.1",
        path: join(rootDir, "packages/beta/package.json"),
      },
    ]);

    await expect(main(["0.0.2", "--check"], { rootDir })).rejects.toThrow(
      "Package versions are not aligned to 0.0.2",
    );
  });

  test("validates semver input", () => {
    expect(isValidSemver("0.0.2")).toBe(true);
    expect(isValidSemver("0.0.2-rc.1")).toBe(true);
    expect(isValidSemver("0.0")).toBe(false);
    expect(isValidSemver("next")).toBe(false);
  });
});

async function createFixtureWorkspace() {
  const rootDir = await mkdtemp(join(tmpdir(), "mreact-version-test-"));
  await mkdir(join(rootDir, "packages/alpha"), { recursive: true });
  await mkdir(join(rootDir, "packages/beta"), { recursive: true });
  await mkdir(join(rootDir, "packages/private"), { recursive: true });
  await mkdir(join(rootDir, "packages/create-mreact-app/src"), { recursive: true });

  await writeJson(join(rootDir, "package.json"), {
    name: "fixture-root",
    private: true,
    version: "0.0.1",
  });
  await writeJson(join(rootDir, "packages/alpha/package.json"), {
    name: "@reckona/alpha",
    version: "0.0.1",
  });
  await writeJson(join(rootDir, "packages/beta/package.json"), {
    name: "@reckona/beta",
    version: "0.0.1",
  });
  await writeJson(join(rootDir, "packages/private/package.json"), {
    name: "@reckona/private",
    private: true,
    version: "0.0.1",
  });
  await writeFile(
    join(rootDir, "packages/create-mreact-app/src/index.ts"),
    [
      "const internalPackageVersions = {",
      '  "@reckona/mreact-auth": "^0.0.1",',
      '  "@reckona/mreact-devtools": "^0.0.1",',
      '  "@reckona/mreact-forms": "^0.0.1",',
      '  "@reckona/mreact": "^0.0.1",',
      '  "@reckona/mreact-query": "^0.0.1",',
      '  "@reckona/mreact-reactive-core": "^0.0.1",',
      '  "@reckona/mreact-router": "^0.0.1",',
      "} as const;",
      "",
    ].join("\n"),
  );

  return rootDir;
}

async function readVersion(rootDir: string, path: string) {
  const packageJson = JSON.parse(await readFile(join(rootDir, path), "utf8")) as {
    version: string;
  };
  return packageJson.version;
}

async function writeJson(path: string, value: unknown) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

function relativePath(rootDir: string, path: string) {
  return path.slice(rootDir.length + 1);
}
