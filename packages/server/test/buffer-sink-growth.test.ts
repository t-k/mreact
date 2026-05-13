import { describe, expect, test } from "vitest";
import { createBufferSink } from "../src/buffer-sink.js";

describe("server buffer-sink growth and edge branches", () => {
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
});
