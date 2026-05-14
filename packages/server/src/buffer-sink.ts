// Node 専用 buffer sink — issue 050 の対応。
//
// `createStringSink` (cross-runtime, string accumulator) と並べて、
// Node の `Buffer` を直接 accumulate する sink を提供する。HTTP response
// body へ `response.write(buffer)` で直接渡すと string → UTF-8 encode の
// cost を 1 回にまとめられる利点がある。
//
// 注: Cloudflare Workers / Deno など `Buffer` を持たない runtime では
// import 時に runtime error になる。cross-runtime ポータビリティが必要な
// callsite は `@reckona/mreact-server` 本体の `createStringSink` を使う。
//
// tsconfig は `lib: ES2022 + DOM`, `types: []` なので `@types/node` に
// 依存しないよう、`Buffer` の最小型を本 file 内で declare する。

interface NodeBuffer extends Uint8Array {
  toString(encoding?: string, start?: number, end?: number): string;
  write(input: string, offset: number, encoding?: string): number;
  copy(target: NodeBuffer, targetStart?: number, sourceStart?: number, sourceEnd?: number): number;
  subarray(start?: number, end?: number): NodeBuffer;
}

interface BufferConstructor {
  from(input: string, encoding?: string): NodeBuffer;
  from(input: ArrayBufferLike | ArrayLike<number>): NodeBuffer;
  alloc(size: number): NodeBuffer;
  allocUnsafe(size: number): NodeBuffer;
  byteLength(input: string, encoding?: string): number;
  isBuffer(input: unknown): input is NodeBuffer;
}

declare const Buffer: BufferConstructor;

export interface BufferSink {
  append(chunk: string | NodeBuffer): void;
  toBuffer(): NodeBuffer;
  toString(): string;
  size(): number;
}

export interface BufferSinkOptions {
  /**
   * Initial backing buffer size (UTF-8 bytes). The buffer grows
   * geometrically as needed. Default: 8192.
   */
  initialSize?: number;
  /**
   * Growth multiplier when the backing buffer needs to expand.
   * Default: 2.
   */
  growthFactor?: number;
}

/**
 * Creates a Node-only buffer sink with a single pre-allocated growing
 * backing `Buffer`. UTF-8 encoding happens in-place at the current write
 * offset, avoiding per-chunk Buffer allocation and a final concat.
 *
 * Compared to `Buffer.concat`-style implementations, this trades a small
 * amount of headroom memory for ~5-10x throughput on small chunks
 * (see docs/benchmarks/2026-05-12-server-sink-strategy.md).
 */
/**
 * A streaming-flavored Node buffer sink used by
 * `renderToReadableStream`. Coalesces successive `append(chunk)` calls
 * into a single backing `Buffer`, then hands the buffer to a consumer
 * callback either on demand (`flush()`) or automatically once the
 * accumulated UTF-8 byte length crosses a threshold.
 *
 * The contract:
 * - Each call to `flush()` (or an auto-flush triggered from within
 *   `append`) delivers **exactly one** non-empty Buffer to the
 *   consumer. Empty buffers are never delivered — callers do not
 *   need to filter them out.
 * - The delivered Buffer is exclusively owned by the consumer; the
 *   sink will not mutate it afterwards. Internally we allocate a
 *   fresh backing Buffer per epoch, so handing off a `subarray` view
 *   is safe with no copy.
 *
 * Issue 084: motivated by the streaming SSR throughput gap to
 * marko-run (mreact was at 0.66x marko's ops/sec because the previous
 * implementation paid a `TextEncoder.encode` + Web Streams
 * `controller.enqueue` round-trip per `sink.append()` call).
 */
export interface StreamingBufferSink {
  append(chunk: string): void;
  flush(): void;
  size(): number;
}

export interface StreamingBufferSinkOptions {
  /** UTF-8 byte threshold that triggers an automatic flush from inside
   *  `append`. Default 8 KiB (one common TCP segment payload). */
  flushThreshold?: number;
  /** Initial backing buffer size; same semantics as `BufferSinkOptions`. */
  initialSize?: number;
  /** Consumer hook — invoked at most once per `flush()` (manual or
   *  automatic), and only with a non-empty Buffer. */
  onFlush(buffer: NodeBuffer): void;
}

export function createStreamingBufferSink(
  options: StreamingBufferSinkOptions,
): StreamingBufferSink {
  const flushThreshold = options.flushThreshold ?? 8192;
  const initialSize = options.initialSize ?? flushThreshold;
  let inner = createBufferSink({ initialSize });
  const emitAndReset = () => {
    const buf = inner.toBuffer();
    inner = createBufferSink({ initialSize });
    options.onFlush(buf);
  };
  return {
    append(chunk) {
      if (chunk === "") return;
      inner.append(chunk);
      if (inner.size() >= flushThreshold) {
        emitAndReset();
      }
    },
    flush() {
      if (inner.size() === 0) return;
      emitAndReset();
    },
    size() {
      return inner.size();
    },
  };
}

export function createBufferSink(options: BufferSinkOptions = {}): BufferSink {
  const initialSize = options.initialSize ?? 8192;
  const growthFactor = options.growthFactor ?? 2;
  let buffer = Buffer.allocUnsafe(initialSize);
  let offset = 0;

  function ensure(requiredBytes: number): void {
    const required = offset + requiredBytes;

    if (required <= buffer.length) {
      return;
    }

    let newCapacity = buffer.length === 0 ? initialSize : buffer.length;

    while (newCapacity < required) {
      newCapacity = Math.ceil(newCapacity * growthFactor);
    }

    const grown = Buffer.allocUnsafe(newCapacity);
    buffer.copy(grown, 0, 0, offset);
    buffer = grown;
  }

  return {
    append(chunk) {
      if (typeof chunk === "string") {
        // Reserve worst-case byte length (4 bytes/char) up front so we
        // can encode in a single `write()` call without a measurement
        // pass; the actual encoded length is returned by `write()`.
        const upperBound = chunk.length * 4;
        ensure(upperBound);
        offset += buffer.write(chunk, offset, "utf8");
        return;
      }

      ensure(chunk.length);
      chunk.copy(buffer, offset);
      offset += chunk.length;
    },
    toBuffer() {
      return buffer.subarray(0, offset);
    },
    toString() {
      return buffer.toString("utf8", 0, offset);
    },
    size() {
      return offset;
    },
  };
}
