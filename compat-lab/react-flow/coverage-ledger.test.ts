import { describe, expect, test } from "vitest";
import { reactFlowCoverageLedger } from "./coverage-ledger.js";
import { reactFlowFixtures } from "./fixtures.js";

describe("React Flow coverage ledger", () => {
  test("maps every obligation to an existing fixture", () => {
    const fixtureIds = new Set(reactFlowFixtures.map((fixture) => fixture.id));

    for (const row of reactFlowCoverageLedger) {
      expect(fixtureIds.has(row.fixtureId), row.obligationId).toBe(true);
    }
  });

  test("tracks React Flow compatibility risks for the requested fixtures", () => {
    expect(reactFlowCoverageLedger.map((row) => row.risk)).toEqual(
      expect.arrayContaining([
        "Nodes, edges, Background, Controls, MiniMap, and Panel must mount under ReactFlow context",
        "SVG edge paths and marker definitions must render inside the flow viewport",
        "React Flow measurement and viewport transforms must stabilize in a fixed-size container",
        "Custom node components must receive data and render source and target handles",
        "Controlled node and edge state must update after pointer interaction",
        "fitView control interaction must update viewport state without unmounting nodes",
      ]),
    );
  });

  test("has coverage for each requested fixture", () => {
    const coveredFixtureIds = new Set(reactFlowCoverageLedger.map((row) => row.fixtureId));

    expect(coveredFixtureIds).toEqual(
      new Set([
        "react-flow-basic-canvas",
        "react-flow-custom-node-handles",
        "react-flow-controlled-interaction",
      ]),
    );
  });

  test("obligation ids are unique", () => {
    const ids = reactFlowCoverageLedger.map((row) => row.obligationId);

    expect(new Set(ids).size).toBe(ids.length);
  });
});
