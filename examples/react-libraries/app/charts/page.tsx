import type { LoaderContext } from "@reckona/mreact-router";
import { getMetrics, getMonthlyRevenue, getSalesByProduct } from "../lib/db.js";
import RevenueChart from "../components/revenue-chart.compat.js";
import ProductPieChart from "../components/pie-chart.compat.js";
import MetricsLineChart from "../components/line-chart.compat.js";

export const metadata = {
  title: "Recharts — React libraries on mreact",
};

interface RechartsData {
  monthlyRevenue: Array<{ month: string; revenue: number }>;
  productSales: Array<{ product: string; total_revenue: number; total_units: number }>;
  pageViews: Array<{ date: string; value: number }>;
  conversions: Array<{ date: string; value: number }>;
  totalRevenue: number;
  totalUnits: number;
}

export async function loader(_context: LoaderContext): Promise<RechartsData> {
  const monthlyRevenue = getMonthlyRevenue();
  const productSales = getSalesByProduct();
  const pvRows = getMetrics("page_views");
  const convRows = getMetrics("conversions");
  const totalRevenue = monthlyRevenue.reduce((sum, m) => sum + m.revenue, 0);
  const totalUnits = productSales.reduce((sum, p) => sum + p.total_units, 0);
  return {
    monthlyRevenue,
    productSales,
    pageViews: pvRows.map((r) => ({
      date: new Date(r.recorded_at).toLocaleDateString(),
      value: r.value,
    })),
    conversions: convRows.map((r) => ({
      date: new Date(r.recorded_at).toLocaleDateString(),
      value: r.value,
    })),
    totalRevenue,
    totalUnits,
  };
}

export default function Page(props: { data: RechartsData }) {
  const { monthlyRevenue, productSales, pageViews, conversions, totalRevenue, totalUnits } =
    props.data;

  return (
    <main>
      <h1>Recharts</h1>
      <p>
        SVG charts (bar, pie, line) from{" "}
        <a href="https://recharts.org" target="_blank" rel="noreferrer">Recharts</a>, fed by
        SQLite data loaded on the server. Each chart is a <code>.compat.tsx</code> client
        boundary that hydrates on its own.
      </p>

      <div class="kpi-grid">
        <div class="kpi-card">
          <div class="kpi-value">${totalRevenue.toLocaleString()}</div>
          <div class="kpi-label">Total Revenue</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-value">{totalUnits.toLocaleString()}</div>
          <div class="kpi-label">Total Units Sold</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-value">{productSales.length}</div>
          <div class="kpi-label">Products</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-value">{monthlyRevenue.length}</div>
          <div class="kpi-label">Months Tracked</div>
        </div>
      </div>

      <div class="card">
        <h2>Monthly Revenue</h2>
        <div class="chart-container">
          <RevenueChart data={monthlyRevenue} />
        </div>
      </div>

      <div class="card">
        <h2>Revenue by Product</h2>
        <div class="chart-container">
          <ProductPieChart data={productSales.map((p) => ({ name: p.product, value: p.total_revenue }))} />
        </div>
      </div>

      <div class="card">
        <h2>Page Views (30 days)</h2>
        <div class="chart-container">
          <MetricsLineChart data={pageViews} color="#3b82f6" />
        </div>
      </div>

      <div class="card">
        <h2>Conversions (30 days)</h2>
        <div class="chart-container">
          <MetricsLineChart data={conversions} color="#10b981" />
        </div>
      </div>
    </main>
  );
}
