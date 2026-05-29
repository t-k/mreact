import { createInterface, emitKeypressEvents, type Key } from "node:readline";

/**
 * Minimal, dependency-free interactive prompts built on Node's `node:readline`.
 *
 * All functions accept `input`/`output` streams so they can be driven by
 * in-memory streams (e.g. `PassThrough`) in tests without mocking.
 */

interface PromptStreamControls {
  isTTY?: boolean;
  pause?: () => void;
  resume?: () => void;
  setRawMode?: (mode: boolean) => void;
}

type PromptReadable = NodeJS.ReadableStream & PromptStreamControls;
type PromptWritable = NodeJS.WritableStream;

export interface TextOptions {
  defaultValue: string;
  input?: PromptReadable;
  message: string;
  output?: PromptWritable;
}

export interface SelectChoice<T> {
  hint?: string;
  label: string;
  value: T;
}

export interface SelectOptions<T> {
  choices: ReadonlyArray<SelectChoice<T>>;
  initialIndex?: number;
  input?: PromptReadable;
  message: string;
  output?: PromptWritable;
}

/** Create the error used to signal that the user aborted a prompt (Ctrl+C). */
export function promptCancelledError(): Error {
  const error = new Error("Prompt cancelled.");
  (error as Error & { code?: string }).code = "PROMPT_CANCELLED";
  return error;
}

/** Whether an unknown error originates from a cancelled prompt. */
export function isPromptCancelled(error: unknown): boolean {
  return error instanceof Error && (error as { code?: string }).code === "PROMPT_CANCELLED";
}

function clampIndex(index: number, length: number): number {
  if (length === 0) {
    return 0;
  }
  if (index < 0) {
    return 0;
  }
  if (index > length - 1) {
    return length - 1;
  }
  return index;
}

/** Free-form line input; an empty answer falls back to `defaultValue`. */
export function text(options: TextOptions): Promise<string> {
  const input = (options.input ?? process.stdin) as PromptReadable;
  const output = options.output ?? process.stdout;
  const prompt = `${options.message} (${options.defaultValue}): `;

  return new Promise<string>((resolve, reject) => {
    const rl = createInterface({ input, output });

    rl.question(prompt, (answer) => {
      rl.close();
      const trimmed = answer.trim();
      resolve(trimmed === "" ? options.defaultValue : trimmed);
    });

    rl.on("SIGINT", () => {
      rl.close();
      reject(promptCancelledError());
    });
  });
}

/** Single-choice selection navigated with the arrow keys. */
export function select<T>(options: SelectOptions<T>): Promise<T> {
  const input = (options.input ?? process.stdin) as PromptReadable;
  const output = options.output ?? process.stdout;
  const choices = options.choices;
  let index = clampIndex(options.initialIndex ?? 0, choices.length);

  return new Promise<T>((resolve, reject) => {
    emitKeypressEvents(input);
    const isRawCapable = input.isTTY === true;
    if (isRawCapable) {
      input.setRawMode?.(true);
    }
    input.resume?.();

    const cleanup = (): void => {
      input.removeListener("keypress", onKeypress);
      if (isRawCapable) {
        input.setRawMode?.(false);
      }
      input.pause?.();
    };

    function onKeypress(_value: string | undefined, key: Key | undefined): void {
      if (key === undefined) {
        return;
      }

      if (key.ctrl === true && key.name === "c") {
        cleanup();
        reject(promptCancelledError());
        return;
      }

      if (key.name === "up") {
        index = (index - 1 + choices.length) % choices.length;
        return;
      }

      if (key.name === "down") {
        index = (index + 1) % choices.length;
        return;
      }

      if (key.name === "return" || key.name === "enter") {
        cleanup();
        const choice = choices[index];
        if (choice === undefined) {
          reject(new Error("No choice available to select."));
          return;
        }
        resolve(choice.value);
      }
    }

    input.on("keypress", onKeypress);
    output.write(`${options.message}\n`);
  });
}
