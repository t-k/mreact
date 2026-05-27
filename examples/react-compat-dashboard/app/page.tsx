import type { LoaderContext } from "@reckona/mreact-router";
import { getMonthlyRevenue, getSalesByProduct } from "./lib/db.js";
import RevenueChart from "./components/revenue-chart.compat.js";
import ProductPieChart from "./components/pie-chart.compat.js";

export const metadata = {
  title: "Overview — Dashboard",
};

interface DashboardData {
  monthlyRevenue: Array<{ month: string; revenue: number }>;
  productSales: Array<{ product: string; total_revenue: number; total_units: number }>;
  totalRevenue: number;
  totalUnits: number;
}

export async function loader(_context: LoaderContext): Promise<DashboardData> {
  const monthlyRevenue = getMonthlyRevenue();
  const productSales = getSalesByProduct();
  const totalRevenue = monthlyRevenue.reduce((sum, m) => sum + m.revenue, 0);
  const totalUnits = productSales.reduce((sum, p) => sum + p.total_units, 0);
  return { monthlyRevenue, productSales, totalRevenue, totalUnits };
}

export default function Page(props: { data: DashboardData }) {
  const { monthlyRevenue, productSales, totalRevenue, totalUnits } = props.data;

  return (
    <main>
      <h1>Dashboard Overview</h1>

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
          <ProductPieChart data={productSales.map(p => ({ name: p.product, value: p.total_revenue }))} />
        </div>
      </div>
    </main>
  );
}
