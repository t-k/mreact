export type CoverageStatus =
  | "untracked"
  | "fixture_only"
  | "vrt_covered"
  | "interaction_covered"
  | "known_diff"
  | "known_tolerance"
  | "blocked"
  | "fixed";

export interface RechartsCoverageRow {
  obligationId: string;
  feature: string;
  risk: string;
  fixtureId: string;
  vrt: boolean;
  interaction: boolean;
  status: CoverageStatus;
}

export const rechartsCoverageLedger: RechartsCoverageRow[] = [
  {
    obligationId: "RC-BAR-001",
    feature: "BarChart + Bar + XAxis/YAxis + CartesianGrid",
    risk: "SVG and layout measurement",
    fixtureId: "recharts-bar-basic",
    vrt: true,
    interaction: false,
    status: "vrt_covered",
  },
  {
    obligationId: "RC-TIP-001",
    feature: "LineChart + Tooltip hover",
    risk: "Pointer event delegation and state update",
    fixtureId: "recharts-line-tooltip-hover",
    vrt: true,
    interaction: true,
    status: "fixed",
  },
  {
    obligationId: "RC-AREA-001",
    feature: "AreaChart + Legend",
    risk: "Context propagation and cloneElement",
    fixtureId: "recharts-area-legend",
    vrt: true,
    interaction: false,
    status: "vrt_covered",
  },
  {
    obligationId: "RC-PIE-001",
    feature: "PieChart + Pie + Cell + Label",
    risk: "SVG path and label rendering",
    fixtureId: "recharts-pie-cell-label",
    vrt: true,
    interaction: false,
    status: "vrt_covered",
  },
  {
    obligationId: "RC-RESP-001",
    feature: "ResponsiveContainer resize",
    risk: "ResizeObserver and layout measurement",
    fixtureId: "recharts-responsive-resize",
    vrt: true,
    interaction: true,
    status: "interaction_covered",
  },
  {
    obligationId: "RC-COMPOSED-001",
    feature: "ComposedChart + ReferenceLine",
    risk: "Mixed chart composition",
    fixtureId: "recharts-composed-reference",
    vrt: true,
    interaction: false,
    status: "vrt_covered",
  },
  {
    obligationId: "RC-SCATTER-001",
    feature: "ScatterChart + Scatter + ZAxis + ErrorBar + ReferenceArea + ReferenceDot + Brush",
    risk: "Point rendering, scale mapping, error bar composition, and brush rendering",
    fixtureId: "recharts-scatter-error-brush",
    vrt: true,
    interaction: true,
    status: "interaction_covered",
  },
  {
    obligationId: "RC-POLAR-001",
    feature: "RadarChart + Radar + RadialBarChart + RadialBar + polar axes",
    risk: "Polar coordinate layout and legend/tooltip context",
    fixtureId: "recharts-polar-radar-radial",
    vrt: true,
    interaction: false,
    status: "fixed",
  },
  {
    obligationId: "RC-HIERARCHY-001",
    feature: "Treemap + Sankey + SunburstChart + FunnelChart + Funnel",
    risk: "Hierarchy layout, flow layout, number-axis funnel composition, and tooltip context",
    fixtureId: "recharts-hierarchy-flow",
    vrt: true,
    interaction: false,
    status: "vrt_covered",
  },
  {
    obligationId: "RC-SHAPES-001",
    feature: "Surface + Layer + Text + default content + primitive shapes",
    risk: "Standalone SVG component rendering and presentation props",
    fixtureId: "recharts-shape-primitives",
    vrt: true,
    interaction: false,
    status: "vrt_covered",
  },
  {
    obligationId: "RC-CUSTOM-001",
    feature: "CartesianAxis + Customized + LabelList",
    risk: "Direct axis rendering, chart context injection, and custom overlay rendering",
    fixtureId: "recharts-axis-customized",
    vrt: true,
    interaction: false,
    status: "vrt_covered",
  },
  {
    obligationId: "RC-ANIMATION-001",
    feature: "Animation lifecycle and animated transitions",
    risk: "Timing-sensitive animation state and browser capture determinism",
    fixtureId: "recharts-animation-lifecycle",
    vrt: true,
    interaction: false,
    status: "vrt_covered",
  },
  {
    obligationId: "RC-SYNC-001",
    feature: "Synchronized categorical charts via syncId",
    risk: "Cross-chart event propagation and tooltip synchronization",
    fixtureId: "recharts-synced-tooltips",
    vrt: true,
    interaction: true,
    status: "fixed",
  },
  {
    obligationId: "RC-PROPS-001",
    feature: "Cartesian prop matrix for chart, axis, grid, legend, tooltip, and series props",
    risk: "High-use Recharts props changing rendered SVG, tooltip, and legend output",
    fixtureId: "recharts-cartesian-props-matrix",
    vrt: true,
    interaction: true,
    status: "interaction_covered",
  },
  {
    obligationId: "RC-INTERACTION-PROPS-001",
    feature: "Tooltip trigger/content/default state and Legend event props",
    risk: "Event handler propagation, custom render callbacks, and controlled tooltip state",
    fixtureId: "recharts-interaction-props-matrix",
    vrt: true,
    interaction: true,
    status: "interaction_covered",
  },
];
