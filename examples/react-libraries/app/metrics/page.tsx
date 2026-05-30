import type { LoaderContext } from "@reckona/mreact-router";
import { getMetrics } from "../lib/db.js";
import MetricsLineChart from "../components/line-chart.compat.js";

export const metadata = { title: "Metrics — Dashboard" };

interface MetricsData {
  pageViews: Array<{ date: string; value: number }>;
  conversions: Array<{ date: string; value: number }>;
}

export async function loader(_ctx: LoaderContext): Promise<MetricsData> {
  const pvRows = getMetrics("page_views");
  const convRows = getMetrics("conversions");
  return {
    pageViews: pvRows.map(r => ({ date: new Date(r.recorded_at).toLocaleDateString(), value: r.value })),
    conversions: convRows.map(r => ({ date: new Date(r.recorded_at).toLocaleDateString(), value: r.value })),
  };
}

export default function MetricsPage(props: { data: MetricsData }) {
  return (
    <main>
      <h1>Metrics</h1>

      <div class="card">
        <h2>Page Views (30 days)</h2>
        <div class="chart-container">
          <MetricsLineChart data={props.data.pageViews} color="#3b82f6" />
        </div>
      </div>

      <div class="card">
        <h2>Conversions (30 days)</h2>
        <div class="chart-container">
          <MetricsLineChart data={props.data.conversions} color="#10b981" />
        </div>
      </div>
    </main>
  );
}
