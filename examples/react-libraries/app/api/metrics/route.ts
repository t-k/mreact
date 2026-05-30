import { getMetrics } from "../../lib/db.js";

export function GET(request: Request): Response {
  const url = new URL(request.url);
  const name = url.searchParams.get("name") ?? "page_views";
  return Response.json(getMetrics(name));
}
