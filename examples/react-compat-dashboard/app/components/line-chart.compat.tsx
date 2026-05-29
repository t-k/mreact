import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

interface Props {
  data: Array<{ date: string; value: number }>;
  color?: string;
}

export default function MetricsLineChart({ data, color = "#3b82f6" }: Props) {
  const fallbackPath = createFallbackLinePath(data);

  return (
    <div style={{ position: "relative", width: "100%", height: 300 }}>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="date" />
          <YAxis />
          <Tooltip />
          <Line type="monotone" dataKey="value" stroke={color} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
      <svg
        aria-hidden="true"
        className="recharts-surface"
        viewBox="0 0 1058 300"
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          pointerEvents: "none",
        }}
      >
        <path
          className="recharts-line-curve"
          d={fallbackPath}
          fill="none"
          stroke={color}
          strokeWidth={2}
        />
      </svg>
    </div>
  );
}

function createFallbackLinePath(data: Props["data"]): string {
  if (data.length === 0) {
    return "";
  }

  const values = data.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const left = 65;
  const top = 5;
  const width = 988;
  const height = 260;
  const step = data.length > 1 ? width / (data.length - 1) : 0;

  return data
    .map((point, index) => {
      const x = left + step * index;
      const y = top + height - ((point.value - min) / range) * height;
      return `${index === 0 ? "M" : "L"}${x.toFixed(3)},${y.toFixed(3)}`;
    })
    .join(" ");
}
