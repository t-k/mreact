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
  | "pointer-interaction";

export interface ReactFlowInteraction {
  name: string;
  description: string;
  run: "clickFirstNode" | "clickFitView";
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
  transform: string;
  classes: string[];
  consoleMessages: string[];
}
