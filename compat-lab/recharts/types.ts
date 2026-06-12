import type { ReactNode } from "react";

export type CompatRuntime = "react" | "compat";

export type CompatRiskTag =
  | "svg"
  | "layout-measurement"
  | "resize-observer"
  | "event-delegation"
  | "pointer-hover"
  | "ref"
  | "effect-timing"
  | "context"
  | "clone-element"
  | "animation"
  | "hydration";

export interface CompatInteraction {
  name: string;
  description: string;
  run: "hoverChartCenter" | "resizeViewport" | "waitForAnimationEnd";
}

export interface CompatFixture {
  id: string;
  library: "recharts";
  title: string;
  description: string;
  features: string[];
  riskTags: CompatRiskTag[];
  viewport: { width: number; height: number };
  render: (runtime: CompatRuntime) => ReactNode;
  interactions?: CompatInteraction[];
}
