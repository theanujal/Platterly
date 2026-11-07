export async function GET() {
  return Response.json({ status: "ok", product: "stub" }, { headers: { "cache-control": "no-store" } });
}
