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
  input?: PromptReadable | undefined;
  message: string;
  output?: PromptWritable | undefined;
}

export interface SelectChoice<T> {
  hint?: string | undefined;
  label: string;
  value: T;
}

export interface SelectOptions<T> {
  choices: ReadonlyArray<SelectChoice<T>>;
  initialIndex?: number | undefined;
  input?: PromptReadable | undefined;
  message: string;
  output?: PromptWritable | undefined;
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

const CURSOR_POINTER = ">";
const CLEAR_LINE = "[2K";
const HIDE_CURSOR = "[?25l";
const SHOW_CURSOR = "[?25h";

function supportsColor(output: PromptWritable): boolean {
  return (output as { isTTY?: boolean }).isTTY === true && process.env.NO_COLOR === undefined;
}

/** Single-choice selection navigated with the arrow keys. */
export function select<T>(options: SelectOptions<T>): Promise<T> {
  const input = (options.input ?? process.stdin) as PromptReadable;
  const output = options.output ?? process.stdout;
  const choices = options.choices;
  const color = supportsColor(output);
  const cyan = (value: string): string => (color ? `[36m${value}[39m` : value);
  const dim = (value: string): string => (color ? `[2m${value}[22m` : value);
  let index = clampIndex(options.initialIndex ?? 0, choices.length);

  return new Promise<T>((resolve, reject) => {
    emitKeypressEvents(input);
    const isRawCapable = input.isTTY === true;
    if (isRawCapable) {
      input.setRawMode?.(true);
    }
    input.resume?.();

    const renderChoiceLines = (): string =>
      choices
        .map((choice, choiceIndex) => {
          const active = choiceIndex === index;
          const prefix = active ? `${CURSOR_POINTER} ` : "  ";
          const label = active ? cyan(choice.label) : choice.label;
          const hint = choice.hint === undefined ? "" : ` ${dim(`(${choice.hint})`)}`;
          return `${CLEAR_LINE}${prefix}${label}${hint}`;
        })
        .join("\n");

    let rendered = false;
    const render = (): void => {
      if (rendered) {
        // Move the cursor back to the first choice line before redrawing.
        output.write(`[${choices.length}A`);
      }
      output.write(`${renderChoiceLines()}\n`);
      rendered = true;
    };

    const cleanup = (): void => {
      input.removeListener("keypress", onKeypress);
      if (isRawCapable) {
        input.setRawMode?.(false);
      }
      if (color) {
        output.write(SHOW_CURSOR);
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
        render();
        return;
      }

      if (key.name === "down") {
        index = (index + 1) % choices.length;
        render();
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
    if (color) {
      output.write(HIDE_CURSOR);
    }
    render();
  });
}
