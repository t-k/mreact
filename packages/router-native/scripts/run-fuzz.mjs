import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const targets = [
  "decode_flight_base64",
  "decode_flight_rows",
  "flight_roundtrip",
  "merge_flight_rows_semantics",
];
const mode = process.argv[2] ?? "smoke";
const requestedTarget = process.argv[3];
const seconds = Number(process.argv[4] ?? (mode === "smoke" ? 10 : 300));

if (!Number.isSafeInteger(seconds) || seconds < 1 || seconds > 86_400) {
  throw new Error("fuzz duration must be an integer from 1 to 86400 seconds");
}

if (!["build", "smoke", "campaign"].includes(mode)) {
  throw new Error("fuzz mode must be build, smoke, or campaign");
}

const selected = mode === "smoke" ? targets : [requestedTarget];
if (mode === "campaign" && (requestedTarget === undefined || !targets.includes(requestedTarget))) {
  throw new Error(`campaign target must be one of: ${targets.join(", ")}`);
}

const fuzzEnvironment = { ...process.env };
if (process.platform === "darwin") {
  const resolveXcodeTool = (tool) => {
    const result = spawnSync("/usr/bin/xcrun", ["--find", tool], { encoding: "utf8" });
    if (result.status !== 0) {
      throw new Error(`xcrun could not locate ${tool}`);
    }
    return result.stdout.trim();
  };
  const clang = resolveXcodeTool("clang");
  fuzzEnvironment.CC = clang;
  fuzzEnvironment.CXX = resolveXcodeTool("clang++");
  fuzzEnvironment.CARGO_TARGET_AARCH64_APPLE_DARWIN_LINKER = clang;
  fuzzEnvironment.CARGO_TARGET_X86_64_APPLE_DARWIN_LINKER = clang;
  fuzzEnvironment.SDKROOT = spawnSync("/usr/bin/xcrun", ["--show-sdk-path"], {
    encoding: "utf8",
  }).stdout.trim();
}

if (mode === "build") {
  const result = spawnSync("cargo", ["+nightly", "fuzz", "build"], {
    cwd: packageRoot,
    env: fuzzEnvironment,
    stdio: "inherit",
  });
  process.exitCode = result.status ?? 1;
} else {
  const temporaryRoot = mkdtempSync(join(tmpdir(), "mreact-fuzz-"));

  try {
    for (const target of selected) {
      const corpus = join(temporaryRoot, target);
      const seeds = join(packageRoot, "fuzz", "seeds", target);
      if (existsSync(seeds)) {
        cpSync(seeds, corpus, { recursive: true });
      }

      const result = spawnSync(
        "cargo",
        [
          "+nightly",
          "fuzz",
          "run",
          target,
          corpus,
          "--",
          "-max_len=4096",
          `-max_total_time=${seconds}`,
          "-timeout=5",
        ],
        { cwd: packageRoot, env: fuzzEnvironment, stdio: "inherit" },
      );

      if (result.status !== 0) {
        process.exitCode = result.status ?? 1;
        break;
      }
    }
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
}
