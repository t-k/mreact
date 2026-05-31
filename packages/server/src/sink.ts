import type { HtmlSink } from "@reckona/mreact-shared/compiler-contract";

export interface StringHtmlSink extends HtmlSink {
  bufferStrategy(): StringSinkBufferStrategy;
  drain(): Promise<void>;
  toString(): string;
}

export type StringSinkBufferStrategy = "concat" | "array-join";

export interface StringSinkOptions {
  strategy?: StringSinkBufferStrategy | "auto";
  arrayJoinThreshold?: number;
}

export type StreamRender = (sink: HtmlSink) => void | PromiseLike<void>;

const stringSinkDeferredTasks = new WeakMap<HtmlSink, PromiseLike<void>[]>();

export function createStringSink(options: StringSinkOptions = {}): StringHtmlSink {
  // Default to "concat" - V8 rope flattening yields 2-6x throughput over
  // `Array#join("")` across all measured fixture sizes (see
  // docs/benchmarks/2026-05-12-server-sink-strategy.md). "array-join" stays
  // available as opt-in for scenarios that need lower peak memory.
  const requestedStrategy = options.strategy ?? "concat";
  const arrayJoinThreshold = options.arrayJoinThreshold ?? 256;
  const deferredTasks: PromiseLike<void>[] = [];
  let strategy: StringSinkBufferStrategy = requestedStrategy === "auto"
    ? "concat"
    : requestedStrategy;
  let writeCount = 0;
  let text = "";
  const chunks: string[] = [];

  const switchConcatToArrayJoin = () => {
    if (strategy !== "concat") {
      return;
    }

    if (text !== "") {
      chunks.push(text);
      text = "";
    }
    strategy = "array-join";
  };

  const sink: StringHtmlSink = {
    append(chunk) {
      writeCount += 1;

      if (requestedStrategy === "auto" && strategy === "concat" && writeCount > arrayJoinThreshold) {
        switchConcatToArrayJoin();
      }

      if (strategy === "concat") {
        text += chunk;
        return;
      }

      chunks.push(chunk);
    },
    bufferStrategy() {
      return strategy;
    },
    defer(task) {
      deferredTasks.push(task);
    },
    async drain() {
      await Promise.all(deferredTasks);
    },
    toString() {
      if (strategy === "concat") {
        return text;
      }

      return chunks.join("");
    },
  };

  stringSinkDeferredTasks.set(sink, deferredTasks);
  return sink;
}

export function hasDeferredTasks(sink: HtmlSink): boolean {
  return (stringSinkDeferredTasks.get(sink)?.length ?? 0) > 0;
}
