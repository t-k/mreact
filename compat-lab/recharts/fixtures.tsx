import type { ReactNode } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Brush,
  CartesianAxis,
  CartesianGrid,
  Cell,
  ComposedChart,
  Cross,
  Curve,
  Customized,
  DefaultLegendContent,
  DefaultTooltipContent,
  Dot,
  ErrorBar,
  Funnel,
  FunnelChart,
  Label,
  LabelList,
  Layer,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Polygon,
  Radar,
  RadarChart,
  RadialBar,
  RadialBarChart,
  Rectangle,
  ReferenceArea,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Sankey,
  Scatter,
  ScatterChart,
  Sector,
  SunburstChart,
  Surface,
  Symbols,
  Text,
  Tooltip,
  Trapezoid,
  Treemap,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";
import type { CompatFixture } from "./types.js";

const monthlyRevenue = [
  { month: "Jan", revenue: 12400, units: 340 },
  { month: "Feb", revenue: 18200, units: 430 },
  { month: "Mar", revenue: 16100, units: 390 },
  { month: "Apr", revenue: 22400, units: 520 },
  { month: "May", revenue: 25100, units: 610 },
  { month: "Jun", revenue: 23800, units: 570 },
];

const dailyMetrics = [
  { date: "06-01", views: 1200, conversions: 42 },
  { date: "06-02", views: 1450, conversions: 51 },
  { date: "06-03", views: 1320, conversions: 48 },
  { date: "06-04", views: 1680, conversions: 64 },
  { date: "06-05", views: 1740, conversions: 70 },
  { date: "06-06", views: 1810, conversions: 73 },
];

const productSales = [
  { name: "Core", value: 4200 },
  { name: "Forms", value: 3100 },
  { name: "Router", value: 2600 },
  { name: "Compat", value: 1900 },
];

const colors = ["#2563eb", "#059669", "#d97706", "#dc2626"];

const scatterData = [
  { x: 80, y: 120, z: 120, error: [15, 20] },
  { x: 130, y: 180, z: 180, error: [20, 18] },
  { x: 190, y: 150, z: 160, error: [12, 16] },
  { x: 240, y: 230, z: 210, error: [18, 22] },
  { x: 310, y: 260, z: 260, error: [16, 20] },
];

const polarData = [
  { subject: "Build", value: 120, fill: "#2563eb" },
  { subject: "Runtime", value: 98, fill: "#059669" },
  { subject: "Router", value: 86, fill: "#d97706" },
  { subject: "Compat", value: 99, fill: "#dc2626" },
  { subject: "Docs", value: 72, fill: "#7c3aed" },
];

const treemapData = [
  { name: "React", size: 48, fill: "#bfdbfe" },
  { name: "Compat", size: 36, fill: "#bbf7d0" },
  { name: "Router", size: 28, fill: "#fed7aa" },
  { name: "Forms", size: 18, fill: "#fecaca" },
];

const sankeyData = {
  nodes: [{ name: "Input" }, { name: "Runtime" }, { name: "SVG" }, { name: "Report" }],
  links: [
    { source: 0, target: 1, value: 12 },
    { source: 1, target: 2, value: 8 },
    { source: 1, target: 3, value: 4 },
  ],
};

const sunburstData = {
  name: "mreact",
  children: [
    { name: "react", value: 20, fill: "#bfdbfe" },
    { name: "compat", value: 16, fill: "#bbf7d0" },
    {
      name: "router",
      children: [
        { name: "build", value: 10, fill: "#fed7aa" },
        { name: "client", value: 8, fill: "#fecaca" },
      ],
    },
  ],
};

const funnelData = [
  { name: "Visits", value: 1000, fill: "#2563eb" },
  { name: "Trials", value: 620, fill: "#059669" },
  { name: "Users", value: 280, fill: "#d97706" },
];

function ChartFrame(props: { children: ReactNode }) {
  return <div className="chart-frame">{props.children}</div>;
}

export const rechartsFixtures: CompatFixture[] = [
  {
    id: "recharts-bar-basic",
    library: "recharts",
    title: "Basic bar chart",
    description: "BarChart with Bar, XAxis, YAxis, and CartesianGrid.",
    features: ["BarChart", "Bar", "XAxis", "YAxis", "CartesianGrid"],
    coveredProps: {
      BarChart: ["width", "height", "data"],
      Bar: ["dataKey", "fill", "isAnimationActive"],
      XAxis: ["dataKey"],
      CartesianGrid: ["strokeDasharray"],
    },
    riskTags: ["svg", "layout-measurement"],
    viewport: { width: 960, height: 640 },
    render: () => (
      <ChartFrame>
        <BarChart width={720} height={360} data={monthlyRevenue}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="month" />
          <YAxis />
          <Bar dataKey="revenue" fill="#2563eb" isAnimationActive={false} />
        </BarChart>
      </ChartFrame>
    ),
  },
  {
    id: "recharts-line-tooltip-hover",
    library: "recharts",
    title: "Line chart tooltip hover",
    description: "LineChart with Tooltip and a hover interaction.",
    features: ["LineChart", "Line", "XAxis", "YAxis", "Tooltip"],
    coveredProps: {
      LineChart: ["width", "height", "data"],
      Line: ["type", "dataKey", "stroke", "isAnimationActive"],
      XAxis: ["dataKey"],
    },
    riskTags: ["svg", "pointer-hover", "event-delegation", "effect-timing"],
    viewport: { width: 960, height: 640 },
    interactions: [
      {
        name: "hover-chart-center",
        description: "Move the pointer to the center of the chart surface.",
        run: "hoverChartCenter",
      },
    ],
    render: () => (
      <ChartFrame>
        <LineChart width={720} height={360} data={dailyMetrics}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="date" />
          <YAxis />
          <Tooltip />
          <Line type="monotone" dataKey="views" stroke="#2563eb" isAnimationActive={false} />
        </LineChart>
      </ChartFrame>
    ),
  },
  {
    id: "recharts-area-legend",
    library: "recharts",
    title: "Area chart legend",
    description: "AreaChart with Legend and two series.",
    features: ["AreaChart", "Area", "Legend", "XAxis", "YAxis"],
    coveredProps: {
      AreaChart: ["width", "height", "data"],
      Area: ["type", "dataKey", "stroke", "fill", "isAnimationActive"],
      XAxis: ["dataKey"],
    },
    riskTags: ["svg", "context", "clone-element"],
    viewport: { width: 960, height: 640 },
    render: () => (
      <ChartFrame>
        <AreaChart width={720} height={360} data={dailyMetrics}>
          <XAxis dataKey="date" />
          <YAxis />
          <Legend />
          <Area
            type="monotone"
            dataKey="views"
            stroke="#2563eb"
            fill="#bfdbfe"
            isAnimationActive={false}
          />
          <Area
            type="monotone"
            dataKey="conversions"
            stroke="#059669"
            fill="#bbf7d0"
            isAnimationActive={false}
          />
        </AreaChart>
      </ChartFrame>
    ),
  },
  {
    id: "recharts-pie-cell-label",
    library: "recharts",
    title: "Pie chart cells and labels",
    description: "PieChart with Cell colors and a center Label.",
    features: ["PieChart", "Pie", "Cell", "Label", "Tooltip"],
    coveredProps: {
      PieChart: ["width", "height"],
      Pie: ["data", "dataKey", "nameKey", "cx", "cy", "outerRadius", "isAnimationActive"],
      Cell: ["fill"],
      Label: ["value", "position"],
    },
    riskTags: ["svg", "clone-element"],
    viewport: { width: 960, height: 640 },
    render: () => (
      <ChartFrame>
        <PieChart width={720} height={360}>
          <Pie
            data={productSales}
            dataKey="value"
            nameKey="name"
            cx="50%"
            cy="50%"
            outerRadius={120}
            isAnimationActive={false}
          >
            <Label value="Revenue" position="center" />
            {productSales.map((_, index) => (
              <Cell key={colors[index]} fill={colors[index] ?? "#64748b"} />
            ))}
          </Pie>
          <Tooltip />
        </PieChart>
      </ChartFrame>
    ),
  },
  {
    id: "recharts-responsive-resize",
    library: "recharts",
    title: "Responsive container resize",
    description: "ResponsiveContainer reacts to viewport changes.",
    features: ["ResponsiveContainer", "BarChart", "Bar"],
    coveredProps: {
      ResponsiveContainer: ["width", "height"],
      BarChart: ["data"],
      Bar: ["dataKey", "fill", "isAnimationActive"],
      XAxis: ["dataKey"],
    },
    riskTags: ["resize-observer", "layout-measurement", "svg"],
    viewport: { width: 960, height: 640 },
    interactions: [
      {
        name: "resize-viewport",
        description: "Resize the viewport and capture the responsive chart again.",
        run: "resizeViewport",
      },
    ],
    render: () => (
      <ChartFrame>
        <div className="responsive-box">
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={monthlyRevenue}>
              <XAxis dataKey="month" />
              <YAxis />
              <Bar dataKey="units" fill="#059669" isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </ChartFrame>
    ),
  },
  {
    id: "recharts-composed-reference",
    library: "recharts",
    title: "Composed chart reference line",
    description: "ComposedChart with Bar, Line, and ReferenceLine.",
    features: ["ComposedChart", "Bar", "Line", "ReferenceLine", "XAxis", "YAxis"],
    coveredProps: {
      ComposedChart: ["width", "height", "data"],
      Bar: ["dataKey", "fill", "isAnimationActive"],
      Line: ["type", "dataKey", "stroke", "isAnimationActive"],
      ReferenceLine: ["y", "stroke", "label"],
      XAxis: ["dataKey"],
    },
    riskTags: ["svg", "context", "layout-measurement"],
    viewport: { width: 960, height: 640 },
    render: () => (
      <ChartFrame>
        <ComposedChart width={720} height={360} data={monthlyRevenue}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="month" />
          <YAxis />
          <ReferenceLine y={20000} stroke="#dc2626" label="Target" />
          <Bar dataKey="revenue" fill="#93c5fd" isAnimationActive={false} />
          <Line type="monotone" dataKey="revenue" stroke="#1d4ed8" isAnimationActive={false} />
        </ComposedChart>
      </ChartFrame>
    ),
  },
  {
    id: "recharts-scatter-error-brush",
    library: "recharts",
    title: "Scatter chart with error bars and brush",
    description: "ScatterChart with Scatter, ZAxis, ErrorBar, ReferenceArea, ReferenceDot, and Brush.",
    features: [
      "ScatterChart",
      "Scatter",
      "ZAxis",
      "ErrorBar",
      "ReferenceArea",
      "ReferenceDot",
      "Brush",
      "XAxis",
      "YAxis",
      "CartesianGrid",
    ],
    coveredProps: {
      ScatterChart: ["width", "height", "data"],
      Scatter: ["name", "data", "fill", "isAnimationActive"],
      ZAxis: ["dataKey", "range"],
      ErrorBar: ["dataKey", "direction", "width", "stroke"],
      ReferenceArea: ["x1", "x2", "y1", "y2", "stroke", "fill"],
      ReferenceDot: ["x", "y", "r", "fill", "stroke"],
      Brush: ["dataKey", "height", "travellerWidth"],
      LabelList: ["dataKey", "position"],
      XAxis: ["dataKey", "type", "name"],
      YAxis: ["dataKey", "type", "name"],
      CartesianGrid: ["strokeDasharray"],
    },
    riskTags: ["svg", "layout-measurement", "event-delegation"],
    viewport: { width: 960, height: 640 },
    interactions: [
      {
        name: "hover-chart-center",
        description: "Move the pointer to the center of the scatter chart surface.",
        run: "hoverChartCenter",
      },
    ],
    render: () => (
      <ChartFrame>
        <ScatterChart width={720} height={360} data={scatterData}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="x" type="number" name="x" />
          <YAxis dataKey="y" type="number" name="y" />
          <ZAxis dataKey="z" range={[80, 260]} />
          <ReferenceArea x1={120} x2={260} y1={130} y2={240} stroke="#94a3b8" fill="#e2e8f0" />
          <ReferenceDot x={190} y={150} r={5} fill="#dc2626" stroke="none" />
          <Tooltip />
          <Scatter name="Samples" data={scatterData} fill="#2563eb" isAnimationActive={false}>
            <ErrorBar dataKey="error" direction="y" width={4} stroke="#0f172a" />
            <LabelList dataKey="z" position="top" />
          </Scatter>
          <Brush dataKey="x" height={24} travellerWidth={8} />
        </ScatterChart>
      </ChartFrame>
    ),
  },
  {
    id: "recharts-polar-radar-radial",
    library: "recharts",
    title: "Polar radar and radial bars",
    description: "RadarChart and RadialBarChart with polar axes and grid.",
    features: [
      "RadarChart",
      "Radar",
      "RadialBarChart",
      "RadialBar",
      "PolarGrid",
      "PolarAngleAxis",
      "PolarRadiusAxis",
      "Legend",
      "Tooltip",
    ],
    coveredProps: {
      RadarChart: ["width", "height", "data", "outerRadius"],
      Radar: ["name", "dataKey", "stroke", "fill", "fillOpacity", "isAnimationActive"],
      RadialBarChart: [
        "width",
        "height",
        "innerRadius",
        "outerRadius",
        "data",
        "startAngle",
        "endAngle",
      ],
      RadialBar: ["dataKey", "background", "legendType", "isAnimationActive"],
      PolarAngleAxis: ["dataKey"],
    },
    riskTags: ["svg", "context", "layout-measurement", "clone-element"],
    viewport: { width: 960, height: 720 },
    interactions: [
      {
        name: "wait-for-layout-settle",
        description: "Wait for post-mount legend and chart measurement updates to settle.",
        run: "waitForAnimationEnd",
      },
    ],
    render: () => (
      <ChartFrame>
        <div className="split-chart-row">
          <RadarChart width={360} height={320} data={polarData} outerRadius={110}>
            <PolarGrid />
            <PolarAngleAxis dataKey="subject" />
            <PolarRadiusAxis />
            <Radar
              name="Compatibility"
              dataKey="value"
              stroke="#2563eb"
              fill="#bfdbfe"
              fillOpacity={0.65}
              isAnimationActive={false}
            />
            <Legend />
            <Tooltip />
          </RadarChart>
          <RadialBarChart
            width={320}
            height={320}
            innerRadius="20%"
            outerRadius="90%"
            data={polarData}
            startAngle={90}
            endAngle={-270}
          >
            <RadialBar dataKey="value" background legendType="circle" isAnimationActive={false} />
            <Legend />
            <Tooltip />
          </RadialBarChart>
        </div>
      </ChartFrame>
    ),
  },
  {
    id: "recharts-hierarchy-flow",
    library: "recharts",
    title: "Hierarchy and flow charts",
    description: "Treemap, Sankey, SunburstChart, and FunnelChart.",
    features: ["Treemap", "Sankey", "SunburstChart", "FunnelChart", "Funnel", "Tooltip"],
    coveredProps: {
      Treemap: ["width", "height", "data", "dataKey", "nameKey", "isAnimationActive"],
      Sankey: ["width", "height", "data", "nodePadding", "nodeWidth"],
      SunburstChart: [
        "width",
        "height",
        "data",
        "dataKey",
        "innerRadius",
        "outerRadius",
        "fill",
        "stroke",
      ],
      FunnelChart: ["width", "height"],
      Funnel: ["dataKey", "data", "isAnimationActive"],
      Cell: ["fill"],
    },
    riskTags: ["svg", "layout-measurement", "event-delegation"],
    viewport: { width: 1080, height: 840 },
    interactions: [
      {
        name: "wait-for-layout-settle",
        description: "Wait for post-mount hierarchy and funnel layout updates to settle.",
        run: "waitForAnimationEnd",
      },
    ],
    render: () => (
      <ChartFrame>
        <div className="grid-chart-panel">
          <Treemap
            width={330}
            height={220}
            data={treemapData}
            dataKey="size"
            nameKey="name"
            isAnimationActive={false}
          />
          <Sankey width={330} height={220} data={sankeyData} nodePadding={24} nodeWidth={14}>
            <Tooltip />
          </Sankey>
          <SunburstChart
            width={330}
            height={220}
            data={sunburstData}
            dataKey="value"
            innerRadius={12}
            outerRadius={95}
            fill="#93c5fd"
            stroke="#ffffff"
          />
          <FunnelChart width={330} height={220}>
            <Tooltip />
            <Funnel dataKey="value" data={funnelData} isAnimationActive={false}>
              {funnelData.map((entry) => (
                <Cell key={entry.name} fill={entry.fill} />
              ))}
            </Funnel>
          </FunnelChart>
        </div>
      </ChartFrame>
    ),
  },
  {
    id: "recharts-shape-primitives",
    library: "recharts",
    title: "Standalone shape primitives",
    description: "Surface, Layer, Text, default content components, and primitive SVG shapes.",
    features: [
      "Surface",
      "Layer",
      "DefaultLegendContent",
      "DefaultTooltipContent",
      "Text",
      "Sector",
      "Curve",
      "Rectangle",
      "Polygon",
      "Dot",
      "Cross",
      "Symbols",
      "Trapezoid",
    ],
    coveredProps: {
      Surface: ["width", "height", "title", "desc"],
      Text: ["x", "y", "fill"],
      Sector: ["cx", "cy", "innerRadius", "outerRadius", "startAngle", "endAngle", "fill"],
      Curve: ["type", "points", "stroke", "fill"],
      Rectangle: ["x", "y", "width", "height", "radius", "fill"],
      Polygon: ["points", "fill"],
      Dot: ["cx", "cy", "r", "fill"],
      Cross: ["x", "y", "width", "height", "stroke"],
      Symbols: ["type", "cx", "cy", "size", "fill"],
      Trapezoid: ["x", "y", "upperWidth", "lowerWidth", "height", "fill"],
      DefaultLegendContent: ["payload"],
      DefaultTooltipContent: ["label", "payload"],
    },
    riskTags: ["svg", "clone-element"],
    viewport: { width: 960, height: 640 },
    render: () => (
      <ChartFrame>
        <div className="primitive-content-row">
          <Surface width={420} height={300} title="Shape primitive surface" desc="Standalone shapes">
            <Layer>
              <Text x={20} y={28} fill="#0f172a" fontSize={16}>
                Shape primitives
              </Text>
              <Sector cx={80} cy={105} innerRadius={28} outerRadius={54} startAngle={30} endAngle={300} fill="#bfdbfe" />
              <Curve
                type="monotone"
                points={[
                  { x: 150, y: 145 },
                  { x: 190, y: 80 },
                  { x: 230, y: 140 },
                ]}
                stroke="#2563eb"
                fill="none"
              />
              <Rectangle x={260} y={68} width={70} height={56} radius={8} fill="#bbf7d0" />
              <Polygon points={[{ x: 65, y: 190 }, { x: 110, y: 240 }, { x: 22, y: 240 }]} fill="#fed7aa" />
              <Dot cx={175} cy={218} r={12} fill="#dc2626" />
              <Cross x={235} y={198} width={34} height={34} stroke="#7c3aed" />
              <Symbols type="diamond" cx={322} cy={216} size={380} fill="#0f766e" />
              <Trapezoid x={350} y={80} upperWidth={44} lowerWidth={72} height={58} fill="#f472b6" />
            </Layer>
          </Surface>
          <div className="default-content-panel">
            <DefaultLegendContent
              payload={[
                { value: "React", type: "line", color: "#2563eb" },
                { value: "Compat", type: "rect", color: "#059669" },
              ]}
            />
            <DefaultTooltipContent
              label="Tooltip"
              payload={[
                { name: "React", value: 120, color: "#2563eb" },
                { name: "Compat", value: 118, color: "#059669" },
              ]}
            />
          </div>
        </div>
      </ChartFrame>
    ),
  },
  {
    id: "recharts-axis-customized",
    library: "recharts",
    title: "Cartesian axis and customized overlays",
    description: "Direct CartesianAxis rendering and Customized overlay inside a chart.",
    features: ["CartesianAxis", "Customized", "LabelList", "LineChart", "Line", "XAxis", "YAxis"],
    coveredProps: {
      Surface: ["width", "height"],
      CartesianAxis: ["x", "y", "width", "height", "orientation", "ticks", "stroke"],
      LineChart: ["width", "height", "data"],
      Line: ["type", "dataKey", "stroke", "isAnimationActive"],
      XAxis: ["dataKey"],
      LabelList: ["dataKey", "position"],
      Customized: ["component"],
    },
    riskTags: ["svg", "context", "clone-element"],
    viewport: { width: 960, height: 640 },
    render: () => (
      <ChartFrame>
        <div className="primitive-content-row">
          <Surface width={260} height={260}>
            <CartesianAxis
              x={40}
              y={210}
              width={180}
              height={30}
              orientation="bottom"
              ticks={[
                { coordinate: 40, value: "A" },
                { coordinate: 130, value: "B" },
                { coordinate: 220, value: "C" },
              ]}
              stroke="#475569"
            />
          </Surface>
          <LineChart width={420} height={260} data={dailyMetrics}>
            <XAxis dataKey="date" />
            <YAxis />
            <Line type="monotone" dataKey="views" stroke="#2563eb" isAnimationActive={false}>
              <LabelList dataKey="views" position="top" />
            </Line>
            <Customized
              component={() => (
                <g>
                  <text x={300} y={36} fill="#0f172a" fontSize={14}>
                    Custom overlay
                  </text>
                </g>
              )}
            />
          </LineChart>
        </div>
      </ChartFrame>
    ),
  },
  {
    id: "recharts-synced-tooltips",
    library: "recharts",
    title: "Synchronized line chart tooltips",
    description: "Two LineChart instances connected with syncId and activated by hover.",
    features: ["LineChart", "Line", "XAxis", "YAxis", "Tooltip"],
    coveredProps: {
      LineChart: ["width", "height", "data", "syncId"],
      Line: ["type", "dataKey", "stroke", "isAnimationActive"],
      XAxis: ["dataKey"],
      CartesianGrid: ["strokeDasharray"],
    },
    riskTags: ["svg", "pointer-hover", "event-delegation", "context", "effect-timing"],
    viewport: { width: 960, height: 640 },
    interactions: [
      {
        name: "hover-chart-center",
        description: "Move the pointer to the center of the first synchronized chart.",
        run: "hoverChartCenter",
      },
    ],
    render: () => (
      <ChartFrame>
        <div className="split-chart-row">
          <LineChart width={360} height={280} data={dailyMetrics} syncId="daily-metrics">
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="date" />
            <YAxis />
            <Tooltip />
            <Line type="monotone" dataKey="views" stroke="#2563eb" isAnimationActive={false} />
          </LineChart>
          <LineChart width={360} height={280} data={dailyMetrics} syncId="daily-metrics">
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="date" />
            <YAxis />
            <Tooltip />
            <Line
              type="monotone"
              dataKey="conversions"
              stroke="#059669"
              isAnimationActive={false}
            />
          </LineChart>
        </div>
      </ChartFrame>
    ),
  },
  {
    id: "recharts-animation-lifecycle",
    library: "recharts",
    title: "Animated bar chart lifecycle",
    description: "BarChart with a short explicit animation duration and post-animation capture.",
    features: ["BarChart", "Bar", "XAxis", "YAxis", "Tooltip"],
    coveredProps: {
      BarChart: ["width", "height", "data"],
      Bar: ["dataKey", "fill", "isAnimationActive", "animationBegin", "animationDuration", "animationEasing"],
      XAxis: ["dataKey"],
    },
    riskTags: ["svg", "animation", "effect-timing"],
    viewport: { width: 960, height: 640 },
    interactions: [
      {
        name: "wait-for-animation-end",
        description: "Wait long enough for the configured chart animation to settle.",
        run: "waitForAnimationEnd",
      },
    ],
    render: () => (
      <ChartFrame>
        <BarChart width={720} height={360} data={monthlyRevenue}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="month" />
          <YAxis />
          <Tooltip />
          <Bar
            dataKey="units"
            fill="#d97706"
            isAnimationActive
            animationBegin={0}
            animationDuration={120}
            animationEasing="linear"
          />
        </BarChart>
      </ChartFrame>
    ),
  },
  {
    id: "recharts-cartesian-props-matrix",
    library: "recharts",
    title: "Cartesian props matrix",
    description: "ComposedChart fixture covering high-value axis, grid, legend, tooltip, and series props.",
    features: [
      "ComposedChart",
      "CartesianGrid",
      "XAxis",
      "YAxis",
      "Legend",
      "Tooltip",
      "Bar",
      "Line",
      "Area",
    ],
    coveredProps: {
      ComposedChart: [
        "width",
        "height",
        "data",
        "margin",
        "barCategoryGap",
        "barGap",
        "barSize",
        "maxBarSize",
        "className",
        "accessibilityLayer",
        "role",
        "tabIndex",
        "title",
        "desc",
      ],
      CartesianGrid: [
        "horizontal",
        "vertical",
        "strokeDasharray",
        "horizontalFill",
        "verticalFill",
        "syncWithTicks",
        "horizontalValues",
        "verticalValues",
      ],
      XAxis: [
        "dataKey",
        "type",
        "allowDuplicatedCategory",
        "allowDecimals",
        "tickCount",
        "axisLine",
        "tickLine",
        "tickSize",
        "tickFormatter",
        "height",
        "mirror",
        "orientation",
        "ticks",
        "padding",
        "minTickGap",
        "interval",
        "reversed",
        "angle",
        "tickMargin",
        "name",
        "unit",
        "label",
        "className",
      ],
      YAxis: [
        "yAxisId",
        "type",
        "dataKey",
        "domain",
        "allowDataOverflow",
        "includeHidden",
        "allowDecimals",
        "tickCount",
        "axisLine",
        "tickLine",
        "tickSize",
        "tickFormatter",
        "width",
        "mirror",
        "orientation",
        "padding",
        "minTickGap",
        "interval",
        "reversed",
        "tickMargin",
        "name",
        "unit",
        "label",
        "className",
      ],
      Legend: [
        "align",
        "verticalAlign",
        "layout",
        "iconSize",
        "iconType",
        "wrapperStyle",
        "formatter",
        "payloadUniqBy",
        "width",
        "height",
        "margin",
      ],
      Tooltip: [
        "allowEscapeViewBox",
        "animationDuration",
        "animationEasing",
        "cursor",
        "filterNull",
        "isAnimationActive",
        "offset",
        "reverseDirection",
        "shared",
        "trigger",
        "useTranslate3d",
        "wrapperStyle",
        "contentStyle",
        "itemStyle",
        "labelStyle",
        "separator",
      ],
      Bar: [
        "dataKey",
        "name",
        "unit",
        "stackId",
        "barSize",
        "maxBarSize",
        "minPointSize",
        "legendType",
        "background",
        "radius",
        "label",
        "isAnimationActive",
      ],
      Line: ["dataKey", "name", "unit", "yAxisId", "type", "stroke", "dot", "activeDot", "legendType", "isAnimationActive"],
      Area: ["dataKey", "name", "type", "stroke", "fill", "fillOpacity", "connectNulls", "isAnimationActive"],
    },
    riskTags: ["svg", "pointer-hover", "event-delegation", "context", "layout-measurement"],
    viewport: { width: 1080, height: 720 },
    interactions: [
      {
        name: "hover-chart-center",
        description: "Move the pointer to the center of the cartesian props matrix.",
        run: "hoverChartCenter",
      },
    ],
    render: () => (
      <ChartFrame>
        <ComposedChart
          width={820}
          height={430}
          data={monthlyRevenue}
          margin={{ top: 28, right: 60, bottom: 44, left: 28 }}
          barCategoryGap="20%"
          barGap={6}
          barSize={24}
          maxBarSize={36}
          className="props-matrix-chart"
          accessibilityLayer
          role="img"
          tabIndex={0}
          title="Cartesian props matrix"
          desc="A deterministic Recharts props matrix fixture"
        >
          <CartesianGrid
            horizontal
            vertical
            strokeDasharray="4 2"
            horizontalFill={["#f8fafc", "#ffffff"]}
            verticalFill={["#eef2ff", "#ffffff"]}
            syncWithTicks
            horizontalValues={[0, 10000, 20000, 30000]}
            verticalValues={["Jan", "Mar", "May"]}
          />
          <XAxis
            dataKey="month"
            type="category"
            allowDuplicatedCategory
            allowDecimals={false}
            tickCount={6}
            axisLine={{ stroke: "#475569" }}
            tickLine={{ stroke: "#94a3b8" }}
            tickSize={6}
            tickFormatter={(value) => String(value).toUpperCase()}
            height={58}
            mirror={false}
            orientation="bottom"
            ticks={["Jan", "Mar", "May"]}
            padding={{ left: 12, right: 12 }}
            minTickGap={4}
            interval={0}
            reversed={false}
            angle={0}
            tickMargin={8}
            name="Month"
            unit=""
            label={{ value: "Month", position: "insideBottom", offset: -10 }}
            className="props-matrix-x-axis"
          />
          <YAxis
            yAxisId="revenue"
            type="number"
            dataKey="revenue"
            domain={[0, 30000]}
            allowDataOverflow
            includeHidden
            allowDecimals={false}
            tickCount={4}
            axisLine={{ stroke: "#475569" }}
            tickLine={{ stroke: "#94a3b8" }}
            tickSize={6}
            tickFormatter={(value) => `$${Number(value) / 1000}k`}
            width={74}
            mirror={false}
            orientation="left"
            padding={{ top: 8, bottom: 8 }}
            minTickGap={4}
            interval={0}
            reversed={false}
            tickMargin={8}
            name="Revenue"
            unit="$"
            label={{ value: "Revenue", angle: -90, position: "insideLeft" }}
            className="props-matrix-y-axis"
          />
          <YAxis
            yAxisId="units"
            orientation="right"
            type="number"
            domain={[0, 700]}
            width={48}
            tickCount={4}
          />
          <Tooltip
            allowEscapeViewBox={{ x: true, y: true }}
            animationDuration={0}
            animationEasing="linear"
            cursor={{ stroke: "#64748b", strokeWidth: 1 }}
            filterNull
            isAnimationActive={false}
            offset={12}
            reverseDirection={{ x: false, y: false }}
            shared
            trigger="hover"
            useTranslate3d={false}
            wrapperStyle={{ outline: "none" }}
            contentStyle={{ borderColor: "#94a3b8", borderRadius: 4 }}
            itemStyle={{ color: "#0f172a" }}
            labelStyle={{ color: "#334155", fontWeight: 700 }}
            separator=" = "
          />
          <Legend
            align="right"
            verticalAlign="top"
            layout="vertical"
            iconSize={10}
            iconType="diamond"
            wrapperStyle={{ right: 10, top: 8 }}
            formatter={(value) => `Series ${value}`}
            payloadUniqBy
            width={150}
            height={92}
            margin={{ top: 8, right: 8, bottom: 8, left: 8 }}
          />
          <Area
            yAxisId="revenue"
            dataKey="revenue"
            name="Revenue area"
            type="monotone"
            stroke="#93c5fd"
            fill="#dbeafe"
            fillOpacity={0.45}
            connectNulls
            isAnimationActive={false}
          />
          <Bar
            yAxisId="revenue"
            dataKey="revenue"
            name="Revenue"
            unit="$"
            stackId="sales"
            barSize={24}
            maxBarSize={36}
            minPointSize={2}
            legendType="rect"
            background={{ fill: "#f8fafc" }}
            radius={[4, 4, 0, 0]}
            label={{ position: "top", fill: "#334155", formatter: (value: number) => `${value / 1000}k` }}
            fill="#2563eb"
            isAnimationActive={false}
          />
          <Line
            yAxisId="units"
            dataKey="units"
            name="Units"
            unit="u"
            type="monotone"
            stroke="#059669"
            dot={{ r: 3, strokeWidth: 1 }}
            activeDot={{ r: 5 }}
            legendType="line"
            isAnimationActive={false}
          />
        </ComposedChart>
      </ChartFrame>
    ),
  },
];
