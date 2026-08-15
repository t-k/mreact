export interface CompatFixtureOutcome {
  fixtureId: string;
  ok: boolean;
}

export function assertCompatLabPassed(input: {
  labName: string;
  outputDir: string;
  results: readonly CompatFixtureOutcome[];
}): void {
  const failedFixtureIds = input.results
    .filter((result) => !result.ok)
    .map((result) => result.fixtureId);

  if (failedFixtureIds.length > 0) {
    throw new Error(
      `${input.labName} compat lab failed for ${failedFixtureIds.join(", ")}. Results: ${input.outputDir}`,
    );
  }
}
