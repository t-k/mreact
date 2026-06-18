import type { ReactNode } from "react";

export type CompatRuntime = "react" | "compat";

export type ReactFlowRiskTag =
  | "svg-edge-rendering"
  | "layout-measurement"
  | "viewport-transform"
  | "context-store"
  | "custom-node"
  | "handle-registration"
  | "controlled-state"
  | "pointer-interaction"
  | "node-drag"
  | "connection"
  | "edge-reconnect"
  | "node-resize"
  | "keyboard-interaction"
  | "viewport-hook"
  | "custom-edge"
  | "edge-label-renderer"
  | "node-initialization"
  | "selection-interaction"
  | "edge-delete"
  | "toolbar-portal"
  | "parent-child";

export interface ReactFlowInteraction {
  name: string;
  description: string;
  run:
    | "clickFirstNode"
    | "clickFitView"
    | "dragFirstNode"
    | "connectSourceToTargetByClick"
    | "clickReconnectEdgeButton"
    | "dragResizeHandle"
    | "pressDeleteKey"
    | "clickViewportButton"
    | "dragSelectionBox"
    | "pressDeleteEdgeKey"
    | "clickToolbarButtons";
}

export interface ReactFlowFixture {
  id: string;
  packageName: "@xyflow/react";
  title: string;
  description: string;
  features: string[];
  riskTags: ReactFlowRiskTag[];
  viewport: { width: number; height: number };
  render: (runtime: CompatRuntime) => ReactNode;
  interactions?: ReactFlowInteraction[];
}

export interface ReactFlowDomSummary {
  nodeCount: number;
  edgePathCount: number;
  handleCount: number;
  controlButtonCount: number;
  miniMapCount: number;
  panelText: string[];
  nodeText: string[];
  selectedNodeText: string;
  edgeLabelText: string[];
  positionText: string[];
  resizeText: string[];
  deletedText: string[];
  viewportText: string[];
  edgePortalText: string[];
  initializedText: string[];
  selectionText: string[];
  toolbarText: string[];
  parentChildText: string[];
  transform: string;
  classes: string[];
  consoleMessages: string[];
}
