import type { ReactNode } from "react";
import type { DomSummary } from "./dom-summary.js";

export type CompatRuntime = "react" | "compat";

export type CompatRiskTag =
  | "svg"
  | "layout-measurement"
  | "resize-observer"
  | "event-delegation"
  | "pointer-hover"
  | "pointer-click"
  | "ref"
  | "effect-timing"
  | "context"
  | "clone-element"
  | "animation"
  | "hydration";

export interface CompatInteraction {
  name: string;
  description: string;
  run:
    | "hoverChartCenter"
    | "clickChartCenter"
    | "hoverLegendFirstItem"
    | "clickLegendFirstItem"
    | "resizeViewport"
    | "waitForAnimationEnd";
}

export interface CompatFixture {
  id: string;
  library: "recharts";
  title: string;
  description: string;
  features: string[];
  coveredProps?: Record<string, string[]>;
  riskTags: CompatRiskTag[];
  viewport: { width: number; height: number };
  render: (runtime: CompatRuntime) => ReactNode;
  interactions?: CompatInteraction[];
  expectedDomSummary?: Partial<Pick<DomSummary, "barPathCount">>;
}
