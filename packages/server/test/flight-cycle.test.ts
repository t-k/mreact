import { describe, expect, test } from "vitest";
import { fromReactFlightRows, mergeReactFlightRows } from "../src/index.js";

describe("Flight decoder cyclic chunk references", () => {
  test("direct chunk self-reference is rejected without a stack overflow", () => {
    expect(() => fromReactFlightRows(`0:"$1"\n1:"$1"`)).toThrow(
      /MR_FLIGHT_(CYCLE|TOO_DEEP)/,
    );
    expect(() => fromReactFlightRows(`0:"$1"\n1:"$1"`)).not.toThrow(
      /Maximum call stack/,
    );
  });

  test("two-chunk cycles are rejected without a stack overflow", () => {
    expect(() => fromReactFlightRows(`0:"$1"\n1:"$2"\n2:"$1"`)).toThrow(
      /MR_FLIGHT_(CYCLE|TOO_DEEP)/,
    );
  });

  test("collection chunk cycles are rejected without a stack overflow", () => {
    expect(() => fromReactFlightRows(`0:"$Q1"\n1:[["k","$2"]]\n2:[["x","$1"]]`)).toThrow(
      /MR_FLIGHT_(CYCLE|TOO_DEEP)/,
    );
  });

  test("merge promise chunk cycles are rejected without a stack overflow", () => {
    const initial = fromReactFlightRows(`0:"$@1"`);

    expect(() => mergeReactFlightRows(initial, `1:"$1"`)).toThrow(
      /MR_FLIGHT_(CYCLE|TOO_DEEP)/,
    );
  });
});
