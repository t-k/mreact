import { basename, resolve } from "node:path";
import {
  createMreactAppHelpText,
  createMreactAppSuccessText,
  parseCreateMreactAppCliArgs,
} from "./cli-args.js";
import { createMreactApp, upgradeMreactApp } from "./index.js";
import { isPromptCancelled } from "./prompts.js";
import { resolveCreateOptions } from "./resolve-create-options.js";

interface PromptStreamControls {
  isTTY?: boolean;
  pause?: () => void;
  resume?: () => void;
  setRawMode?: (mode: boolean) => void;
}

export interface RunCliContext {
  /** Environment used for package-manager detection. Defaults to `process.env`. */
  env?: NodeJS.ProcessEnv | undefined;
  /** Stream the interactive prompts read from. Defaults to `process.stdin`. */
  input?: (NodeJS.ReadableStream & PromptStreamControls) | undefined;
  /** Whether to run the interactive wizard for unprovided options. */
  isTTY?: boolean | undefined;
  /** Stream the interactive prompts render to. Defaults to `process.stdout`. */
  output?: NodeJS.WritableStream | undefined;
  /** Sink for error messages. Defaults to `console.error`. */
  stderr?: ((line: string) => void) | undefined;
  /** Sink for normal output. Defaults to `console.log`. */
  stdout?: ((line: string) => void) | undefined;
}

const EXIT_OK = 0;
const EXIT_ERROR = 1;
const EXIT_CANCELLED = 130;

/**
 * Run the create-mreact-app CLI and return a process exit code.
 *
 * Pulled out of the bin shim so the full flow (parse -> resolve -> scaffold)
 * is testable with in-memory streams and without touching `process`.
 */
export async function runCreateMreactAppCli(
  argv: readonly string[],
  context: RunCliContext = {},
): Promise<number> {
  const stdout = context.stdout ?? ((line: string) => console.log(line));
  const stderr = context.stderr ?? ((line: string) => console.error(line));

  try {
    const options = parseCreateMreactAppCliArgs(argv);

    if (options.help === true) {
      stdout(createMreactAppHelpText());
      return EXIT_OK;
    }

    if (options.command === "upgrade") {
      const result = await upgradeMreactApp({
        directory: resolve(options.directory ?? "."),
        dryRun: options.dryRun,
        fromVersion: options.fromVersion,
        targetVersion: options.targetVersion,
      });

      stdout(
        result.changed
          ? `Updated ${result.updatedDependencies.length} mreact dependency range(s).`
          : "No mreact dependency ranges needed updating.",
      );
      if (result.codemods.length > 0) {
        stdout(`Codemods: ${result.codemods.map((codemod) => codemod.id).join(", ")}`);
      }
      return EXIT_OK;
    }

    const resolved = await resolveCreateOptions(options, {
      env: context.env ?? process.env,
      input: context.input,
      isTTY: context.isTTY,
      output: context.output,
    });

    const result = await createMreactApp({
      deploy: resolved.deploy,
      directory: resolve(resolved.directory),
      name: basename(resolve(resolved.directory)),
      packageManager: resolved.packageManager,
      srcDir: resolved.srcDir,
      template: resolved.template,
    });

    stdout(
      createMreactAppSuccessText({
        directory: result.directory,
        displayDirectory: resolved.directory,
        packageManager: result.packageManager,
        template: result.template,
      }),
    );
    return EXIT_OK;
  } catch (error) {
    if (isPromptCancelled(error)) {
      stderr("Aborted.");
      return EXIT_CANCELLED;
    }
    stderr(error instanceof Error ? error.message : String(error));
    return EXIT_ERROR;
  }
}
