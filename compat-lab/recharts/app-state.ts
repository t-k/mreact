import type { CompatRuntime } from "./types.js";

export function fixtureIdFromSearch(search: string, fallback: string): string {
  return new URLSearchParams(search).get("fixture") ?? fallback;
}

export function runtimeFromValue(value: unknown): CompatRuntime {
  return value === "compat" ? "compat" : "react";
}
