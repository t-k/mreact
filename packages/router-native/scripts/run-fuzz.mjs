import { spawn, spawnSync } from "node:child_process";
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

const signalExitCodes = { SIGINT: 130, SIGTERM: 143 };

const runCargo = (args) =>
  new Promise((resolve, reject) => {
    const child = spawn("cargo", args, {
      cwd: packageRoot,
      detached: process.platform !== "win32",
      env: fuzzEnvironment,
      stdio: "inherit",
    });
    let forwardedSignal;
    let escalationTimer;

    const signalChildTree = (signal) => {
      if (child.pid === undefined) {
        return;
      }
      try {
        if (process.platform === "win32") {
          child.kill(signal);
        } else {
          process.kill(-child.pid, signal);
        }
      } catch (error) {
        if (error.code !== "ESRCH") {
          throw error;
        }
      }
    };
    const forwardSignal = (signal) => {
      if (forwardedSignal !== undefined) {
        return;
      }
      forwardedSignal = signal;
      signalChildTree(signal);
      escalationTimer = setTimeout(() => signalChildTree("SIGKILL"), 5_000);
      escalationTimer.unref();
    };
    const onSigint = () => forwardSignal("SIGINT");
    const onSigterm = () => forwardSignal("SIGTERM");
    const finish = (result) => {
      process.off("SIGINT", onSigint);
      process.off("SIGTERM", onSigterm);
      if (escalationTimer !== undefined) {
        clearTimeout(escalationTimer);
      }
      resolve({ ...result, forwardedSignal });
    };

    process.once("SIGINT", onSigint);
    process.once("SIGTERM", onSigterm);
    child.once("error", (error) => {
      process.off("SIGINT", onSigint);
      process.off("SIGTERM", onSigterm);
      reject(error);
    });
    child.once("exit", (status, signal) => finish({ signal, status }));
  });

if (mode === "build") {
  const result = await runCargo(["+nightly", "fuzz", "build"]);
  process.exitCode =
    result.forwardedSignal === undefined
      ? (result.status ?? 1)
      : signalExitCodes[result.forwardedSignal];
} else {
  const temporaryRoot = mkdtempSync(join(tmpdir(), "mreact-fuzz-"));

  try {
    for (const target of selected) {
      const corpus = join(temporaryRoot, target);
      const seeds = join(packageRoot, "fuzz", "seeds", target);
      if (existsSync(seeds)) {
        cpSync(seeds, corpus, { recursive: true });
      }

      const result = await runCargo([
        "+nightly",
        "fuzz",
        "run",
        target,
        corpus,
        "--",
        "-max_len=4096",
        `-max_total_time=${seconds}`,
        "-timeout=5",
      ]);

      if (result.forwardedSignal !== undefined) {
        process.exitCode = signalExitCodes[result.forwardedSignal];
        break;
      }
      if (result.status !== 0) {
        process.exitCode = result.status ?? 1;
        break;
      }
    }
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
}
