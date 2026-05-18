export function GET(): Response {
  return Response.json({ app: "mreact-hacker-news", ok: true });
}
