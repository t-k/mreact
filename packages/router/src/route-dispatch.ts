export function pageRouteMethodResponse(method: string): Response | undefined {
  if (method === "GET" || method === "HEAD") {
    return undefined;
  }

  if (method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: { allow: "GET, HEAD, OPTIONS" },
    });
  }

  return new Response("Method Not Allowed", {
    status: 405,
    headers: { allow: "GET, HEAD, OPTIONS" },
  });
}
