import { describe, expect, test } from "vitest";
import { createBufferSink } from "../src/buffer-sink.js";
import { createStringSink } from "../src/index.js";

describe("buffer sink", () => {
  test("produces UTF-8 buffer matching string sink output", () => {
    const stringSink = createStringSink();
    const bufferSink = createBufferSink();
    const chunks = ["<h1>", "Hello 日本語 &amp; <world>", "</h1>"];

    for (const chunk of chunks) {
      stringSink.append(chunk);
      bufferSink.append(chunk);
    }

    expect(bufferSink.toString()).toBe(stringSink.toString());
    expect(bufferSink.toBuffer().toString("utf8")).toBe(stringSink.toString());
  });

  test("size() returns the byte length of accumulated UTF-8 bytes", () => {
    const sink = createBufferSink();

    sink.append("ABC");
    sink.append("日本"); // 6 UTF-8 bytes (3 each)

    expect(sink.size()).toBe(3 + 6);
    expect(sink.toBuffer().length).toBe(3 + 6);
  });

  test("accepts mixed string and Buffer input and preserves byte order", () => {
    const sink = createBufferSink();

    sink.append("<html>");
    sink.append(Buffer.from("<body>", "utf8"));
    sink.append("</body></html>");

    expect(sink.toString()).toBe("<html><body></body></html>");
  });

  test("empty sink returns empty buffer and empty string", () => {
    const sink = createBufferSink();

    expect(sink.size()).toBe(0);
    expect(sink.toString()).toBe("");
    expect(sink.toBuffer().length).toBe(0);
  });
});
