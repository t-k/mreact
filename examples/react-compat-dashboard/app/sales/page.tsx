import { cell } from "@reckona/mreact-reactive-core";
import type { LoaderContext } from "@reckona/mreact-router";
import { getSales } from "../lib/db.js";

export const metadata = { title: "Sales — Dashboard" };

interface SaleData {
  id: number;
  month: string;
  product: string;
  revenue: number;
  units: number;
}

export async function loader(_ctx: LoaderContext): Promise<SaleData[]> {
  return getSales();
}

export default function SalesPage(props: { data: SaleData[] }) {
  const sales = cell(props.data);
  const month = cell("Jan");
  const product = cell("Widget A");
  const revenue = cell("");
  const units = cell("");
  const submitting = cell(false);

  async function handleAdd() {
    const rev = Number(revenue.get());
    const u = Number(units.get());
    if (isNaN(rev) || isNaN(u) || submitting.get()) return;
    submitting.set(true);
    try {
      const res = await fetch("/api/sales", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ month: month.get(), product: product.get(), revenue: rev, units: u }),
      });
      if (res.ok) {
        const fresh = await (await fetch("/api/sales")).json();
        sales.set(fresh);
        revenue.set("");
        units.set("");
      }
    } finally {
      submitting.set(false);
    }
  }

  return (
    <main>
      <h1>Sales Data</h1>

      <div class="card">
        <h2>Add Sale</h2>
        <div style="display: flex; gap: 0.5rem; flex-wrap: wrap; align-items: end;">
          <div class="form-group">
            <label>Month</label>
            <select value={month.get()} onChange={(e: Event) => month.set((e.target as HTMLSelectElement).value)}>
              {["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"].map(m => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>
          <div class="form-group">
            <label>Product</label>
            <select value={product.get()} onChange={(e: Event) => product.set((e.target as HTMLSelectElement).value)}>
              {["Widget A","Widget B","Widget C"].map(p => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>
          <div class="form-group">
            <label>Revenue</label>
            <input type="number" value={revenue.get()} onInput={(e: Event) => revenue.set((e.target as HTMLInputElement).value)} placeholder="5000" />
          </div>
          <div class="form-group">
            <label>Units</label>
            <input type="number" value={units.get()} onInput={(e: Event) => units.set((e.target as HTMLInputElement).value)} placeholder="50" />
          </div>
          <button class="btn" disabled={submitting.get()} onClick={handleAdd}>Add</button>
        </div>
      </div>

      <div class="card">
        <h2>All Sales ({sales.get().length})</h2>
        <table style="width: 100%; border-collapse: collapse;">
          <thead>
            <tr style="border-bottom: 2px solid #e5e7eb; text-align: left;">
              <th style="padding: 0.5rem;">Month</th>
              <th style="padding: 0.5rem;">Product</th>
              <th style="padding: 0.5rem;">Revenue</th>
              <th style="padding: 0.5rem;">Units</th>
            </tr>
          </thead>
          <tbody>
            {sales.get().map(s => (
              <tr key={s.id} style="border-bottom: 1px solid #f3f4f6;">
                <td style="padding: 0.5rem;">{s.month}</td>
                <td style="padding: 0.5rem;">{s.product}</td>
                <td style="padding: 0.5rem;">${s.revenue.toLocaleString()}</td>
                <td style="padding: 0.5rem;">{s.units}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
