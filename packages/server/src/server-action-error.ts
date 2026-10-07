/** Creates a private Server Action failure response and logs its details under an opaque error ID. */
export function createServerActionErrorResponse(error: unknown): Response {
  const errorId = globalThis.crypto.randomUUID();
  try {
    console.error("mreact-server: Server action failed.", { errorId, error });
  } catch {
    // Diagnostics must not prevent a private failure response.
  }
  return new Response(JSON.stringify({ ok: false, error: "Server action failed.", errorId }), {
    status: 500,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}
