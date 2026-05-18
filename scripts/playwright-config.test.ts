import { describe, expect, test } from "vitest";
import { playwrightTestIgnoreForCwd } from "../playwright.config.js";

describe("playwright config", () => {
  test("does not ignore every test when the repository root is itself inside .worktrees", () => {
    const testIgnore = playwrightTestIgnoreForCwd(
      "/repo/.worktrees/hacker-news-dogfood",
    );

    expect(testIgnore).not.toContain(".worktrees/**");
    expect(testIgnore).toContain("node_modules/**");
    expect(testIgnore).toContain("test-results/**");
  });

  test("ignores nested repository worktrees from the main checkout", () => {
    expect(playwrightTestIgnoreForCwd("/repo")).toContain(".worktrees/**");
  });
});
