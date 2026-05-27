import { getSales, getMonthlyRevenue, getSalesByProduct, addSale } from "../../lib/db.js";

export function GET(request: Request): Response {
  const url = new URL(request.url);
  const view = url.searchParams.get("view");

  if (view === "monthly") {
    return Response.json(getMonthlyRevenue());
  }
  if (view === "by-product") {
    return Response.json(getSalesByProduct());
  }
  return Response.json(getSales());
}

export async function POST(request: Request): Promise<Response> {
  const body = await request.json();
  const { month, product, revenue, units } = body;
  if (!month || !product || typeof revenue !== "number" || typeof units !== "number") {
    return Response.json({ error: "Invalid input" }, { status: 400 });
  }
  addSale(month, product, revenue, units);
  return Response.json({ ok: true }, { status: 201 });
}
