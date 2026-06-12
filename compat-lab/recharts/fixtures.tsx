import type { ReactNode } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Label,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
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
];
