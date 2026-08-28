import fc from "fast-check";
import { describe, expect, test } from "vitest";
import {
  __isMultipartNativeSearchSizeForTesting,
  __indexOfMultipartBytesForTesting,
  __indexOfMultipartBytesPortableForTesting,
} from "../src/multipart.js";

describe("multipart byte search", () => {
  test("keeps small searches on the portable path", () => {
    expect(__isMultipartNativeSearchSizeForTesting(511)).toBe(false);
    expect(__isMultipartNativeSearchSizeForTesting(512)).toBe(true);
  });

  test.each([
    { haystack: [], needle: [], expected: -1 },
    { haystack: [1, 2], needle: [], expected: -1 },
    { haystack: [1], needle: [1, 2], expected: -1 },
    { haystack: [1, 2, 3], needle: [1, 2], expected: 0 },
    { haystack: [9, 1, 2, 3], needle: [1, 2], expected: 1 },
    { haystack: [9, 1, 2], needle: [1, 2], expected: 1 },
    { haystack: [1, 1, 1, 2], needle: [1, 1, 2], expected: 1 },
    { haystack: [1, 2, 1, 2], needle: [1, 2], expected: 0 },
    { haystack: [1, 2, 1], needle: [1, 2, 1, 2], expected: -1 },
  ])(
    "returns the first complete match for $haystack / $needle",
    ({ haystack, needle, expected }) => {
      expect(
        __indexOfMultipartBytesForTesting(Uint8Array.from(haystack), Uint8Array.from(needle)),
      ).toBe(expected);
    },
  );

  test("matches the portable search across byte arrays and subviews", () => {
    fc.assert(
      fc.property(
        fc.uint8Array({ minLength: 512, maxLength: 2_048 }),
        fc.uint8Array({ maxLength: 80 }),
        fc.nat(16),
        (rawHaystack, needle, prefixBytes) => {
          const storage = new Uint8Array(prefixBytes + rawHaystack.length + 8);
          storage.set(rawHaystack, prefixBytes);
          const haystack = storage.subarray(prefixBytes, prefixBytes + rawHaystack.length);

          expect(__indexOfMultipartBytesForTesting(haystack, needle)).toBe(
            __indexOfMultipartBytesPortableForTesting(haystack, needle),
          );
        },
      ),
      { numRuns: 2_000, seed: 20260828 },
    );
  });

  test("uses portable semantics when Buffer is unavailable", () => {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, "Buffer");
    Reflect.deleteProperty(globalThis, "Buffer");

    try {
      const storage = new Uint8Array(540);
      const haystack = storage.subarray(7, 527);
      const needle = Uint8Array.from([1, 2, 3]);
      haystack.set(needle, 300);

      expect(__indexOfMultipartBytesForTesting(haystack, needle)).toBe(300);
    } finally {
      if (descriptor !== undefined) {
        Object.defineProperty(globalThis, "Buffer", descriptor);
      }
    }
  });

  test("matches on SharedArrayBuffer-backed subviews", () => {
    const storage = new SharedArrayBuffer(16);
    const haystack = new Uint8Array(storage, 3, 8);
    haystack.set([9, 1, 2, 1, 2, 3, 8, 7]);
    const needle = Uint8Array.from([1, 2, 3]);

    expect(__indexOfMultipartBytesForTesting(haystack, needle)).toBe(3);
    expect(__indexOfMultipartBytesPortableForTesting(haystack, needle)).toBe(3);
  });
});
