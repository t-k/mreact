// /api/time — route handler.
//
// Method-specific named exports (GET / POST) are picked up by the
// router. Methods with no named export fall through to ALL, and ALL
// itself falls through to `default`. Route handlers take a standard
// Request and return a standard Response.

export function GET(request: Request): Response {
  const url = new URL(request.url);
  return Response.json({
    framework: "mreact",
    ok: true,
    now: new Date().toISOString(),
    asked: {
      pathname: url.pathname,
      method: request.method,
      query: Object.fromEntries(url.searchParams.entries()),
    },
  });
}

export async function POST(request: Request): Promise<Response> {
  const body = await request.text();
  return Response.json({
    framework: "mreact",
    echoed: body,
    receivedAt: new Date().toISOString(),
  });
}

// Any HTTP method without a dedicated export (PUT / DELETE / PATCH / …)
// falls through to ALL. This sample echoes the method back so you can
// observe the fallback.
export function ALL(request: Request): Response {
  return Response.json({
    framework: "mreact",
    handler: "ALL",
    method: request.method,
    note: "No method-specific handler exported; ALL fallback caught this.",
  });
}
