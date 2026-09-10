import { describe, expect, it } from "vitest";
import { processMayExistAfterProbeError } from "./process-supervisor.js";

describe("process presence error classification", () => {
  it("treats only ESRCH as proof of absence", () => {
    expect(processMayExistAfterProbeError({ code: "ESRCH" })).toBe(false);
    for (const error of [
      { code: "EPERM" },
      { code: "EACCES" },
      new Error("unknown"),
      undefined,
      null,
      "ESRCH",
    ])
      expect(processMayExistAfterProbeError(error)).toBe(true);
  });
});
