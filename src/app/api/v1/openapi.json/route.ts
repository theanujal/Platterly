import { buildOpenApi } from "@/modules/api/openapi";

/** The API's own description (OpenAPI 3). Public: it says how the API works and carries no data and no secrets. */
export async function GET() {
  return new Response(JSON.stringify(buildOpenApi(), null, 2), { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "public, max-age=300" } });
}
