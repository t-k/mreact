import { afterEach, describe, expect, test } from "vitest";
import { createBufferSink, createStreamingBufferSink } from "../src/buffer-sink.js";

const originalAllocUnsafe = Buffer.allocUnsafe;

afterEach(() => {
  Buffer.allocUnsafe = originalAllocUnsafe;
});

describe("server buffer-sink growth and edge branches", () => {
  test("compacts low-utilization streaming chunks without retaining the full backing buffer", () => {
    const chunks: Uint8Array[] = [];
    const sink = createStreamingBufferSink({
      flushThreshold: 8192,
      initialSize: 8192,
      onFlush(buffer) {
        chunks.push(buffer);
      },
    });

    sink.append("x".repeat(64));
    sink.flush();

    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.byteLength).toBe(64);
    expect(chunks[0]?.buffer.byteLength).toBe(64);
  });

  test("keeps a full streaming chunk zero-copy", () => {
    const chunks: Uint8Array[] = [];
    const sink = createStreamingBufferSink({
      flushThreshold: 8192,
      initialSize: 8192,
      onFlush(buffer) {
        chunks.push(buffer);
      },
    });

    sink.append("x".repeat(8192));

    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.buffer.byteLength).toBe(8192);
  });

  test("grows the backing buffer geometrically when the initial size is exceeded", () => {
    const sink = createBufferSink({ initialSize: 4, growthFactor: 2 });
    sink.append("0123456789ABCDEF");
    expect(sink.toString()).toBe("0123456789ABCDEF");
    expect(sink.size()).toBe(16);
  });

  test("honors a custom growthFactor", () => {
    const sink = createBufferSink({ initialSize: 1, growthFactor: 3 });
    const long = "x".repeat(50);
    sink.append(long);
    expect(sink.toString()).toBe(long);
  });

  test("toBuffer returns a slice that reflects the current write offset", () => {
    const sink = createBufferSink({ initialSize: 32 });
    sink.append("ab");
    const slice = sink.toBuffer();
    expect(slice.length).toBe(2);
    expect(slice.toString("utf8")).toBe("ab");
  });

  test("ASCII appends that fit the backing buffer do not grow for worst-case UTF-8 headroom", () => {
    let allocations = 0;
    Buffer.allocUnsafe = ((size: number) => {
      allocations += 1;
      return originalAllocUnsafe(size);
    }) as typeof Buffer.allocUnsafe;
    const sink = createBufferSink({ initialSize: 8 });

    sink.append("abcdef");

    expect(sink.toString()).toBe("abcdef");
    expect(allocations).toBe(1);
  });
});
