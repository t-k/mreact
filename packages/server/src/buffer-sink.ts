// Node 専用 buffer sink — issue 050 の対応。
//
// `createStringSink` (cross-runtime, string accumulator) と並べて、
// Node の `Buffer` を直接 accumulate する sink を提供する。HTTP response
// body へ `response.write(buffer)` で直接渡すと string → UTF-8 encode の
// cost を 1 回にまとめられる利点がある。
//
// 注: Cloudflare Workers / Deno など `Buffer` を持たない runtime では
// import 時に runtime error になる。cross-runtime ポータビリティが必要な
// callsite は `@modular-react/server` 本体の `createStringSink` を使う。
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
