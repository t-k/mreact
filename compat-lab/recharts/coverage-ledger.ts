export type CoverageStatus =
  | "untracked"
  | "fixture_only"
  | "vrt_covered"
  | "interaction_covered"
  | "known_diff"
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
    status: "interaction_covered",
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
    feature: "ScatterChart + ZAxis",
    risk: "Point rendering and scale mapping",
    fixtureId: "unassigned",
    vrt: false,
    interaction: false,
    status: "untracked",
  },
  {
    obligationId: "RC-BRUSH-001",
    feature: "Brush range selection",
    risk: "Pointer drag state and controlled range",
    fixtureId: "unassigned",
    vrt: false,
    interaction: false,
    status: "untracked",
  },
];
