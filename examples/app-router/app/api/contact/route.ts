// POST /api/contact — accepts JSON, validates server-side, and either
// echoes the saved record (status 200) or returns a 400 with
// fieldErrors that `setServerErrors` knows how to map.

interface ContactInput {
  name?: unknown;
  email?: unknown;
  message?: unknown;
}

interface FieldErrors {
  name?: string[];
  email?: string[];
  message?: string[];
}

function validate(input: ContactInput): FieldErrors {
  const errors: FieldErrors = {};
  const name = typeof input.name === "string" ? input.name.trim() : "";
  const email = typeof input.email === "string" ? input.email.trim() : "";
  const message = typeof input.message === "string" ? input.message.trim() : "";

  if (name.length < 2) errors.name = ["Name must be at least 2 characters."];
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = ["Enter a valid email."];
  if (message.length < 10) errors.message = ["Message must be at least 10 characters."];
  if (message.length > 500) {
    errors.message = [...(errors.message ?? []), "Message must be at most 500 characters."];
  }
  // Server-only check: forbid an obvious spam keyword to demonstrate
  // that the client and server validators are not the same set.
  if (/\bspam\b/i.test(message)) {
    errors.message = [...(errors.message ?? []), "Server rejected the message."];
  }
  return errors;
}

export async function POST(request: Request): Promise<Response> {
  let payload: ContactInput;
  try {
    payload = (await request.json()) as ContactInput;
  } catch {
    return Response.json({ fieldErrors: { message: ["Invalid JSON body."] } }, { status: 400 });
  }

  const errors = validate(payload);
  if (Object.keys(errors).length > 0) {
    return Response.json({ fieldErrors: errors }, { status: 400 });
  }

  return Response.json({
    ok: true,
    saved: {
      name: String(payload.name).trim(),
      email: String(payload.email).trim(),
      message: String(payload.message).trim(),
      receivedAt: new Date().toISOString(),
    },
  });
}
