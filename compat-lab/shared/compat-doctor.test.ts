import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { radixFixtures } from "../radix/fixtures.js";
import {
  buildCompatDoctorReport,
  radixPackageNameForFixture,
  writeCompatDoctorReport,
} from "./compat-doctor.js";

const fixture = {
  id: "recharts-line-tooltip-hover",
  title: "Line tooltip hover",
  description: "Hover the line chart and inspect the tooltip.",
  packageName: "recharts",
  interactions: [{ name: "hover chart center" }],
};

describe("Compat Doctor report", () => {
  test("records exact versions and only verified client fixture verdicts", () => {
    const report = buildCompatDoctorReport({
      runId: "run-42",
      lab: "recharts",
      browserVersion: "131.0.6778.0",
      mreactVersion: "0.0.225",
      packageVersions: { recharts: "2.15.4" },
      fixtures: [fixture],
      results: [{ fixtureId: fixture.id, ok: true, pixelDiffRatio: 0.125 }],
    });

    expect(report).toEqual({
      schemaVersion: 1,
      runId: "run-42",
      lab: "recharts",
      environment: {
        mreactVersion: "0.0.225",
        browser: { name: "chromium", version: "131.0.6778.0" },
      },
      fixtures: [
        {
          fixtureId: fixture.id,
          scenario: {
            title: fixture.title,
            description: fixture.description,
            interactions: ["hover chart center"],
          },
          library: { packageName: "recharts", version: "2.15.4" },
          verdicts: {
            clientRender: "passed",
            clientScenario: "passed",
            ssr: "unverified",
            hydration: "unverified",
            bundle: "unverified",
          },
          evidence: { resultsFile: "results.json", pixelDiffRatio: 0.125 },
        },
      ],
    });
  });

  test("reports a failed fixture without claiming SSR, hydration, or bundle coverage", () => {
    const report = buildCompatDoctorReport({
      runId: "run-failed",
      lab: "recharts",
      browserVersion: "131",
      mreactVersion: "0.0.225",
      packageVersions: { recharts: "2.15.4" },
      fixtures: [fixture],
      results: [{ fixtureId: fixture.id, ok: false, pixelDiffRatio: 1, error: "capture failed" }],
    });

    expect(report.fixtures[0]?.verdicts).toEqual({
      clientRender: "unverified",
      clientScenario: "failed",
      ssr: "unverified",
      hydration: "unverified",
      bundle: "unverified",
    });
    expect(report.fixtures[0]?.evidence).toEqual({ resultsFile: "results.json" });
    expect(JSON.stringify(report)).not.toContain("capture failed");
  });

  test("distinguishes a completed client render from a failed fixture assertion", () => {
    const { interactions: _interactions, ...fixtureWithoutInteractions } = fixture;
    const report = buildCompatDoctorReport({
      runId: "run-mismatch",
      lab: "recharts",
      browserVersion: "131",
      mreactVersion: "0.0.225",
      packageVersions: { recharts: "2.15.4" },
      fixtures: [fixtureWithoutInteractions],
      results: [{ fixtureId: fixture.id, ok: false, pixelDiffRatio: 0.25 }],
    });

    expect(report.fixtures[0]?.verdicts.clientRender).toBe("passed");
    expect(report.fixtures[0]?.verdicts.clientScenario).toBe("failed");
    expect(report.fixtures[0]?.evidence.pixelDiffRatio).toBe(0.25);
    expect(report.fixtures[0]?.scenario.interactions).toEqual([]);
  });

  test("rejects a fixture with no result or exact installed package version", () => {
    const input = {
      runId: "run-incomplete",
      lab: "recharts" as const,
      browserVersion: "131",
      mreactVersion: "0.0.225",
      packageVersions: {},
      fixtures: [fixture],
      results: [],
    };

    expect(() => buildCompatDoctorReport(input)).toThrow(/result/i);
    expect(() =>
      buildCompatDoctorReport({
        ...input,
        results: [{ fixtureId: fixture.id, ok: true, pixelDiffRatio: 0 }],
      }),
    ).toThrow(/version/i);
  });

  test("writes one versioned report in the existing per-run artifact directory", async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), "compat-doctor-test-"));
    const outputDir = join(repoRoot, "docs.local", "compat-lab", "run-42");
    await mkdir(join(repoRoot, "node_modules", "recharts"), { recursive: true });
    await writeFile(join(repoRoot, "package.json"), JSON.stringify({ version: "0.0.225" }));
    await writeFile(
      join(repoRoot, "node_modules", "recharts", "package.json"),
      JSON.stringify({ version: "2.15.4" }),
    );

    const { packageName: _packageName, ...rechartsFixture } = fixture;
    await writeCompatDoctorReport({
      repoRoot,
      outputDir,
      runId: "run-42",
      lab: "recharts",
      browserVersion: "131",
      fixtures: [{ ...rechartsFixture, library: "recharts" }],
      results: [{ fixtureId: fixture.id, ok: true, pixelDiffRatio: 0 }],
    });

    const report = JSON.parse(await readFile(join(outputDir, "compat-doctor.json"), "utf8"));
    expect(report.environment.mreactVersion).toBe("0.0.225");
    expect(report.fixtures[0].library).toEqual({ packageName: "recharts", version: "2.15.4" });
  });

  test("rejects missing version metadata from package manifests", async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), "compat-doctor-invalid-version-"));
    const outputDir = join(repoRoot, "run");
    await mkdir(join(repoRoot, "node_modules", "recharts"), { recursive: true });
    await writeFile(join(repoRoot, "package.json"), JSON.stringify({}));
    await writeFile(join(repoRoot, "node_modules", "recharts", "package.json"), "{}");
    const input = {
      repoRoot,
      outputDir,
      runId: "run",
      lab: "recharts" as const,
      browserVersion: "131",
      fixtures: [fixture],
      results: [{ fixtureId: fixture.id, ok: true, pixelDiffRatio: 0 }],
    };

    await expect(writeCompatDoctorReport(input)).rejects.toThrow(/mreact version/i);
    await writeFile(join(repoRoot, "package.json"), JSON.stringify({ version: "" }));
    await expect(writeCompatDoctorReport(input)).rejects.toThrow(/mreact version/i);
    await writeFile(join(repoRoot, "package.json"), JSON.stringify({ version: "0.0.225" }));
    await expect(writeCompatDoctorReport(input)).rejects.toThrow(/installed package version/i);
    await writeFile(join(repoRoot, "node_modules", "recharts", "package.json"), '{"version":""}');
    await expect(writeCompatDoctorReport(input)).rejects.toThrow(/installed package version/i);
  });

  test("resolves an actual Radix fixture to its installed package version", async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), "compat-doctor-radix-"));
    const outputDir = join(repoRoot, "run");
    const packageName = "@radix-ui/react-dialog";
    const radixFixture = {
      id: "radix-dialog-opens-from-trigger",
      title: "Dialog opens",
      description: "Open the dialog with its trigger.",
      library: "radix-ui",
    };
    await mkdir(join(repoRoot, "node_modules", packageName), { recursive: true });
    await writeFile(
      join(repoRoot, "package.json"),
      JSON.stringify({ version: "0.0.225", devDependencies: { [packageName]: "^1.1.15" } }),
    );
    await writeFile(
      join(repoRoot, "node_modules", packageName, "package.json"),
      JSON.stringify({ version: "1.1.15" }),
    );

    await writeCompatDoctorReport({
      repoRoot,
      outputDir,
      runId: "run",
      lab: "radix",
      browserVersion: "131",
      fixtures: [radixFixture],
      results: [{ fixtureId: radixFixture.id, ok: true, pixelDiffRatio: 0 }],
    });

    const report = JSON.parse(await readFile(join(outputDir, "compat-doctor.json"), "utf8"));
    expect(report.fixtures[0].library).toEqual({ packageName, version: "1.1.15" });
    await expect(
      writeCompatDoctorReport({
        repoRoot,
        outputDir,
        runId: "run-invalid",
        lab: "radix",
        browserVersion: "131",
        fixtures: [{ ...radixFixture, library: "unknown" }],
        results: [{ fixtureId: radixFixture.id, ok: true, pixelDiffRatio: 0 }],
      }),
    ).rejects.toThrow(/missing package name/i);
  });

  test("maps a Radix fixture to its concrete package and rejects unknown names", () => {
    const packageNames = [
      "@radix-ui/react-dialog",
      "@radix-ui/react-dropdown-menu",
      "@radix-ui/react-dialog-extended",
    ];
    expect(radixPackageNameForFixture("radix-dropdown-menu-opens-from-trigger", packageNames)).toBe(
      "@radix-ui/react-dropdown-menu",
    );
    expect(radixPackageNameForFixture("radix-dialog-opens-from-trigger", packageNames)).toBe(
      "@radix-ui/react-dialog",
    );
    expect(radixPackageNameForFixture("radix-dialog-extended-opens", packageNames)).toBe(
      "@radix-ui/react-dialog-extended",
    );
    expect(() => radixPackageNameForFixture("radix-unknown-renders", packageNames)).toThrow();
  });

  test("maps every current Radix fixture to an installed package", async () => {
    const rootPackage = JSON.parse(await readFile(join(process.cwd(), "package.json"), "utf8")) as {
      devDependencies: Record<string, string>;
    };
    const packageNames = Object.keys(rootPackage.devDependencies);

    for (const radixFixture of radixFixtures) {
      const packageName = radixPackageNameForFixture(radixFixture.id, packageNames);
      const installed = JSON.parse(
        await readFile(join(process.cwd(), "node_modules", packageName, "package.json"), "utf8"),
      ) as { version: string };
      expect(installed.version).toMatch(/^\d+\./);
    }
  });
});
