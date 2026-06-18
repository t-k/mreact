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
        "Custom edge components must render marker definitions and edge paths",
        "useNodesInitialized must report measured node state after the viewport stabilizes",
        "Selection box interaction must update selected nodes and emit onSelectionChange",
        "Keyboard deletion must remove selected edges and call edge delete callbacks",
        "NodeToolbar and EdgeToolbar portal controls must render and dispatch user actions",
        "Parent child nodes must mount with constrained extent and preserve relative positioning",
        "User pan, wheel zoom, and double click zoom gestures must update viewport state",
        "Snap grid, node extent, and auto pan drag options must commit bounded node positions",
        "Direct useStore and useStoreApi subscriptions must update with React Flow store changes",
        "useUpdateNodeInternals must refresh dynamic handle registration",
        "Connection validation and loose connection mode must reject and accept expected handle pairs",
        "onBeforeDelete must be able to cancel and modify deletion results",
        "onlyRenderVisibleElements must cull offscreen nodes without breaking visible nodes",
        "Selection drag callbacks must fire for selected node drag sequences",
        "Color mode, proOptions, and aria label configuration must apply without runtime warnings",
        "Large graph rendering must preserve node and edge counts without console issues",
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
        "react-flow-viewport-user-gestures",
        "react-flow-drag-constraints",
        "react-flow-store-hooks",
        "react-flow-dynamic-handles",
        "react-flow-connection-validation",
        "react-flow-delete-guard",
        "react-flow-visible-elements",
        "react-flow-selection-drag",
        "react-flow-appearance-a11y",
        "react-flow-large-graph",
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
    expect(statusByObligation.get("RF-VIEWPORT-GESTURE-001")).toBe("covered");
    expect(statusByObligation.get("RF-DRAG-CONSTRAINT-001")).toBe("covered");
    expect(statusByObligation.get("RF-STORE-HOOK-001")).toBe("covered");
    expect(statusByObligation.get("RF-DYNAMIC-HANDLE-001")).toBe("covered");
    expect(statusByObligation.get("RF-CONNECTION-VALIDATION-001")).toBe("covered");
    expect(statusByObligation.get("RF-DELETE-GUARD-001")).toBe("covered");
    expect(statusByObligation.get("RF-VISIBLE-ELEMENTS-001")).toBe("covered");
    expect(statusByObligation.get("RF-SELECTION-DRAG-001")).toBe("covered");
    expect(statusByObligation.get("RF-APPEARANCE-A11Y-001")).toBe("covered");
    expect(statusByObligation.get("RF-LARGE-GRAPH-001")).toBe("covered");
  });
});
