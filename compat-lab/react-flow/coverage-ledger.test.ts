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
        "Dragging a node must emit controlled node position changes and preserve edge rendering",
        "Click-based handle connection must call onConnect and add a controlled edge",
        "Controlled edge reconnection must update the edge target and rerender the edge path",
        "NodeResizer must render resize handles and commit dimension changes",
        "Keyboard deletion must remove selected nodes and call delete callbacks without stale selection state",
        "React Flow viewport hooks must expose programmatic viewport updates through the compat store path",
        "Custom edge components must render marker definitions and portal-backed edge labels",
        "useNodesInitialized must report measured node state after the viewport stabilizes",
        "Selection box interaction must update selected nodes and emit onSelectionChange",
        "Keyboard deletion must remove selected edges and call edge delete callbacks",
        "NodeToolbar and EdgeToolbar portal controls must render and dispatch user actions",
        "Parent child nodes must mount with constrained extent and preserve relative positioning",
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
        "react-flow-node-drag-position",
        "react-flow-connect-on-click",
        "react-flow-controlled-reconnect",
        "react-flow-node-resizer",
        "react-flow-keyboard-delete",
        "react-flow-viewport-hooks",
        "react-flow-custom-edge-labels",
        "react-flow-nodes-initialized",
        "react-flow-selection-box",
        "react-flow-edge-keyboard-delete",
        "react-flow-node-edge-toolbar",
        "react-flow-parent-child-extent",
      ]),
    );
  });

  test("obligation ids are unique", () => {
    const ids = reactFlowCoverageLedger.map((row) => row.obligationId);

    expect(new Set(ids).size).toBe(ids.length);
  });

  test("marks deep interaction compatibility fixtures as covered", () => {
    const statusByObligation = new Map(
      reactFlowCoverageLedger.map((row) => [row.obligationId, row.status]),
    );

    expect(statusByObligation.get("RF-RECONNECT-001")).toBe("covered");
    expect(statusByObligation.get("RF-DRAG-001")).toBe("covered");
    expect(statusByObligation.get("RF-CONNECT-001")).toBe("covered");
    expect(statusByObligation.get("RF-RESIZE-001")).toBe("covered");
    expect(statusByObligation.get("RF-KEYBOARD-001")).toBe("covered");
    expect(statusByObligation.get("RF-VIEWPORT-001")).toBe("covered");
    expect(statusByObligation.get("RF-CUSTOM-EDGE-001")).toBe("covered");
    expect(statusByObligation.get("RF-NODES-INIT-001")).toBe("covered");
    expect(statusByObligation.get("RF-SELECTION-001")).toBe("covered");
    expect(statusByObligation.get("RF-EDGE-DELETE-001")).toBe("covered");
    expect(statusByObligation.get("RF-TOOLBAR-001")).toBe("covered");
    expect(statusByObligation.get("RF-PARENT-CHILD-001")).toBe("covered");
  });
});
