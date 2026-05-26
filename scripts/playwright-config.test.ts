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

  test("does not ignore every test when the repository root is itself inside Claude Code worktrees", () => {
    const testIgnore = playwrightTestIgnoreForCwd(
      "/repo/.claude/worktrees/hacker-news-dogfood",
    );

    expect(testIgnore).not.toContain(".claude/worktrees/**");
    expect(testIgnore).toContain("node_modules/**");
    expect(testIgnore).toContain("test-results/**");
  });

  test("ignores nested repository worktrees from the main checkout", () => {
    expect(playwrightTestIgnoreForCwd("/repo")).toContain(".worktrees/**");
  });

  test("ignores nested Claude worktrees from the main checkout", () => {
    expect(playwrightTestIgnoreForCwd("/repo")).toContain(".claude/worktrees/**");
  });
});
