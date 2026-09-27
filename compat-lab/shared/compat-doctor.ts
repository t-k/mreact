import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

export type CompatLabName = "recharts" | "radix" | "react-flow" | "ui-primitives";
export type CompatDoctorVerdict = "passed" | "failed" | "unverified";

export interface CompatDoctorFixture {
  id: string;
  title: string;
  description: string;
  interactions?: readonly { name: string }[];
  packageName?: string;
  library?: string;
}

export interface CompatDoctorResult {
  fixtureId: string;
  ok: boolean;
  pixelDiffRatio: number;
  error?: string;
}

export interface CompatDoctorReportV1 {
  schemaVersion: 1;
  runId: string;
  lab: CompatLabName;
  environment: {
    mreactVersion: string;
    browser: { name: "chromium"; version: string };
  };
  fixtures: readonly {
    fixtureId: string;
    scenario: { title: string; description: string; interactions: readonly string[] };
    library: { packageName: string; version: string };
    verdicts: {
      clientRender: CompatDoctorVerdict;
      clientScenario: CompatDoctorVerdict;
      ssr: CompatDoctorVerdict;
      hydration: CompatDoctorVerdict;
      bundle: CompatDoctorVerdict;
    };
    evidence: { resultsFile: "results.json"; pixelDiffRatio?: number };
  }[];
}

interface ResolvedFixture extends CompatDoctorFixture {
  packageName: string;
}

export interface BuildCompatDoctorReportInput {
  runId: string;
  lab: CompatLabName;
  browserVersion: string;
  mreactVersion: string;
  packageVersions: Readonly<Record<string, string>>;
  fixtures: readonly ResolvedFixture[];
  results: readonly CompatDoctorResult[];
}

export function buildCompatDoctorReport(input: BuildCompatDoctorReportInput): CompatDoctorReportV1 {
  const resultsById = new Map(input.results.map((result) => [result.fixtureId, result]));

  return {
    schemaVersion: 1,
    runId: input.runId,
    lab: input.lab,
    environment: {
      mreactVersion: input.mreactVersion,
      browser: { name: "chromium", version: input.browserVersion },
    },
    fixtures: input.fixtures.map((fixture) => {
      const result = resultsById.get(fixture.id);
      if (result === undefined) {
        throw new Error(`Missing Compat Doctor result for fixture ${fixture.id}`);
      }
      const version = input.packageVersions[fixture.packageName];
      if (typeof version !== "string" || version.length === 0) {
        throw new Error(`Missing installed package version for ${fixture.packageName}`);
      }

      return {
        fixtureId: fixture.id,
        scenario: {
          title: fixture.title,
          description: fixture.description,
          interactions: (fixture.interactions ?? []).map((interaction) => interaction.name),
        },
        library: { packageName: fixture.packageName, version },
        verdicts: {
          clientRender: result.error === undefined ? "passed" : "unverified",
          clientScenario: result.error === undefined && result.ok ? "passed" : "failed",
          ssr: "unverified",
          hydration: "unverified",
          bundle: "unverified",
        },
        evidence: {
          resultsFile: "results.json",
          ...(result.error === undefined && Number.isFinite(result.pixelDiffRatio)
            ? { pixelDiffRatio: result.pixelDiffRatio }
            : {}),
        },
      };
    }),
  };
}

export function radixPackageNameForFixture(
  fixtureId: string,
  packageNames: readonly string[],
): string {
  const candidates = packageNames
    .filter((name) => name.startsWith("@radix-ui/react-"))
    .filter((name) => fixtureId.startsWith(`radix-${name.slice("@radix-ui/react-".length)}-`))
    .sort((left, right) => right.length - left.length);
  const packageName = candidates[0];
  if (packageName === undefined) {
    throw new Error(`Unknown Radix package for fixture ${fixtureId}`);
  }
  return packageName;
}

export interface WriteCompatDoctorReportInput {
  repoRoot: string;
  outputDir: string;
  runId: string;
  lab: CompatLabName;
  browserVersion: string;
  fixtures: readonly CompatDoctorFixture[];
  results: readonly CompatDoctorResult[];
}

export async function writeCompatDoctorReport(input: WriteCompatDoctorReportInput): Promise<void> {
  const rootPackage = JSON.parse(await readFile(join(input.repoRoot, "package.json"), "utf8")) as {
    version?: string;
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  if (typeof rootPackage.version !== "string" || rootPackage.version.length === 0) {
    throw new Error("Missing mreact version in root package.json");
  }
  const candidateNames = [
    ...Object.keys(rootPackage.dependencies ?? {}),
    ...Object.keys(rootPackage.devDependencies ?? {}),
  ];
  const fixtures = input.fixtures.map(
    (fixture): ResolvedFixture => ({
      ...fixture,
      packageName: fixturePackageName(fixture, candidateNames),
    }),
  );
  const packageVersions: Record<string, string> = {};
  for (const packageName of new Set(fixtures.map((fixture) => fixture.packageName))) {
    const packageJson = JSON.parse(
      await readFile(join(input.repoRoot, "node_modules", packageName, "package.json"), "utf8"),
    ) as { version?: string };
    if (typeof packageJson.version !== "string" || packageJson.version.length === 0) {
      throw new Error(`Missing installed package version for ${packageName}`);
    }
    packageVersions[packageName] = packageJson.version;
  }

  const report = buildCompatDoctorReport({
    runId: input.runId,
    lab: input.lab,
    browserVersion: input.browserVersion,
    mreactVersion: rootPackage.version,
    packageVersions,
    fixtures,
    results: input.results,
  });
  await mkdir(input.outputDir, { recursive: true });
  await writeFile(
    join(input.outputDir, "compat-doctor.json"),
    `${JSON.stringify(report, null, 2)}\n`,
  );
}

function fixturePackageName(fixture: CompatDoctorFixture, packageNames: readonly string[]): string {
  if (fixture.packageName !== undefined) {
    return fixture.packageName;
  }
  if (fixture.library === "recharts") {
    return "recharts";
  }
  if (fixture.library === "radix-ui") {
    return radixPackageNameForFixture(fixture.id, packageNames);
  }
  throw new Error(`Missing package name for Compat Doctor fixture ${fixture.id}`);
}
