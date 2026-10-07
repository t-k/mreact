import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

const workflow = readFileSync(join(process.cwd(), ".github/workflows/publish.yml"), "utf8");
const step = workflow.split("      - name: Publish packages\n")[1]!;
const script = step.split("        run: |\n")[1]!.replace(/^          /gm, "");

describe("publish workflow security", () => {
  test("uses environment variables for dispatch inputs and limits OIDC to publishing", () => {
    expect(script).not.toContain("${{ inputs.");
    expect(step).toContain("NPM_DIST_TAG: ${{ inputs.tag }}");
    expect(step).toContain("NPM_DRY_RUN: ${{ inputs.dry_run }}");
    expect(step).toContain("NPM_DISABLE_PROVENANCE: ${{ inputs.disable_provenance }}");
    expect(workflow.split("jobs:\n")[0]).not.toContain("id-token: write");
    expect(workflow.split("  publish:\n")[1]).toContain("      id-token: write");
    for (const match of workflow.matchAll(/uses: (actions\/[^@\s]+)@(\S+)/g)) {
      expect(match[2], match[1]).toMatch(/^[0-9a-f]{40}$/);
    }
  });

  function run(tag: string, ref = "v0.0.228", dryRun = "false", disableProvenance = "false") {
    const dir = mkdtempSync(join(tmpdir(), "mreact-publish-script-"));
    const output = join(dir, "args");
    writeFileSync(
      join(dir, "node"),
      '#!/bin/bash\nprintf "%s\\n" "$@" > "$PROBE_OUTPUT"\nprintf "provenance=%s\\n" "$NPM_CONFIG_PROVENANCE" >> "$PROBE_OUTPUT"\n',
      { mode: 0o755 },
    );
    const inputs: Record<string, string> = {
      tag,
      dry_run: dryRun,
      disable_provenance: disableProvenance,
    };
    const expanded = script.replace(
      /\$\{\{ inputs\.(\w+) }}/g,
      (_match, input: string) => inputs[input] ?? "",
    );
    const result = spawnSync("bash", ["-e", "-c", expanded], {
      cwd: dir,
      env: {
        ...process.env,
        PATH: `${dir}:${process.env.PATH}`,
        PROBE_OUTPUT: output,
        GITHUB_REF_NAME: ref,
        NPM_DIST_TAG: tag,
        NPM_DRY_RUN: dryRun,
        NPM_DISABLE_PROVENANCE: disableProvenance,
        NPM_CONFIG_PROVENANCE: "true",
      },
      encoding: "utf8",
    });
    return { dir, output, result };
  }

  test.each([
    ["", "v0.0.228", "latest"],
    ["", "v0.0.229-rc.1", "next"],
    ["canary-2", "main", "canary-2"],
    ["beta.1", "main", "beta.1"],
  ])("selects the expected dist-tag from %j and %s", (tag, ref, expected) => {
    const { dir, output, result } = run(tag!, ref!);
    try {
      expect(result.status, result.stderr).toBe(0);
      expect(readFileSync(output, "utf8").split("\n").slice(0, 3)).toEqual([
        "scripts/publish-packages.mjs",
        "--tag",
        expected,
      ]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("preserves dry-run and provenance recovery options", () => {
    const { dir, output, result } = run("next", "main", "true", "true");
    try {
      expect(result.status, result.stderr).toBe(0);
      const args = readFileSync(output, "utf8");
      expect(args).toContain("--dry-run\n--skip-existing-check\n");
      expect(args).toContain("provenance=false\n");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test.each(["$(touch injected)", 'x"; touch injected; #', "--tag", "bad tag", "bad/tag", "x\ny"])(
    "rejects unsafe dist-tag %j without executing it or publishing",
    (tag) => {
      const { dir, output, result } = run(tag);
      try {
        expect(existsSync(join(dir, "injected"))).toBe(false);
        expect(result.status).not.toBe(0);
        expect(existsSync(output)).toBe(false);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    },
  );
});
