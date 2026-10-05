import { authoriseOps, signedJson } from "@/modules/ops-link/respond";
import { buildReport } from "@/modules/ops-link/reports";

export const dynamic = "force-dynamic";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** GET /api/ops/reports/{key}?from=YYYY-MM-DD&to=YYYY-MM-DD: one platform report as a display-ready document (docs/ops-contract.md section 23). */
export async function GET(request: Request, { params }: { params: Promise<{ key: string }> }) {
  const auth = await authoriseOps(request);
  if ("response" in auth) return auth.response;
  const { key } = await params;
  const url = new URL(request.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  if ((from && !DATE.test(from)) || (to && !DATE.test(to))) return signedJson(auth.config, { error: "from and to must be YYYY-MM-DD" }, 400);
  const doc = await buildReport(key, from || null, to || null);
  if (!doc) return signedJson(auth.config, { error: "unknown_report" }, 404);
  return signedJson(auth.config, doc);
}
