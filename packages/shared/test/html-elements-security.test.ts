import fc from "fast-check";
import { parseFragment } from "parse5";
import { describe, expect, test } from "vitest";
import { assertValidHtmlTagName } from "../src/html-elements.js";

const parameters = { numRuns: 500, seed: 20_261_007 };

describe("HTML tag grammar security properties", () => {
  test("delimiter injection is rejected at any position", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(" ", "\t", "\r", "\n", "\0", '"', "'", "/", "<", ">", "=", "\u2028"),
        fc.integer({ min: 0, max: 3 }),
        (delimiter, index) => {
          const tag = `div`.slice(0, index) + delimiter + `div`.slice(index);
          expect(() => assertValidHtmlTagName(tag)).toThrow("Invalid HTML tag name.");
        },
      ),
      parameters,
    );
  });

  test("accepted custom tag names cannot create extra elements or attributes", () => {
    fc.assert(
      fc.property(fc.nat(), fc.nat(), (left, right) => {
        const tag = `x-${left.toString(36)}-${right.toString(36)}`;
        assertValidHtmlTagName(tag);
        const fragment = parseFragment(`<${tag} data-probe="expected"></${tag}>`);
        expect(fragment.childNodes).toHaveLength(1);
        const node = fragment.childNodes[0]!;
        expect(node).toMatchObject({
          tagName: tag,
          attrs: [{ name: "data-probe", value: "expected" }],
          childNodes: [],
        });
      }),
      parameters,
    );
  });
});
