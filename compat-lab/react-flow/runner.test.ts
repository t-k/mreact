import { describe, expect, test } from "vitest";
import {
  createRunId,
  emptyDomSummary,
  parseRunnerArgs,
  selectFixturesForRun,
  summariesMatch,
} from "./runner.js";

describe("React Flow compat runner", () => {
  test("parses fixture and headed flags", () => {
    expect(parseRunnerArgs(["--fixture", "react-flow-basic-canvas", "--headed"])).toEqual({
      fixtureId: "react-flow-basic-canvas",
      headed: true,
    });
  });

  test("defaults to all fixtures in headless mode", () => {
    expect(parseRunnerArgs([])).toEqual({
      fixtureId: undefined,
      headed: false,
    });
  });

  test("selects a focused fixture by id", () => {
    expect(
      selectFixturesForRun({ fixtureId: "react-flow-custom-node-handles", headed: false }).map(
        (fixture) => fixture.id,
      ),
    ).toEqual(["react-flow-custom-node-handles"]);
  });

  test("throws for an unknown fixture id", () => {
    expect(() => selectFixturesForRun({ fixtureId: "missing-fixture", headed: false })).toThrow(
      "Unknown React Flow compat fixture: missing-fixture",
    );
  });

  test("creates a run id with a React Flow suffix", () => {
    expect(createRunId(new Date("2026-06-18T03:04:05.000Z"), 1781751845000)).toBe(
      "2026-06-18-1781751845000-react-flow",
    );
  });

  test("compares DOM summaries by stable React Flow observables", () => {
    const base = {
      ...emptyDomSummary(),
      nodeCount: 2,
      edgePathCount: 1,
      handleCount: 3,
      controlButtonCount: 3,
      miniMapCount: 1,
      panelText: ["Selected: source"],
      nodeText: ["Source selected", "Processor"],
      selectedNodeText: "source",
      transform: "translate(10px, 20px) scale(1)",
      classes: ["react-flow__node", "react-flow__edge"],
    };

    expect(summariesMatch(base, { ...base })).toBe(true);
    expect(summariesMatch(base, { ...base, edgePathCount: 0 })).toBe(false);
    expect(summariesMatch(base, { ...base, selectedNodeText: "none" })).toBe(false);
  });
});
