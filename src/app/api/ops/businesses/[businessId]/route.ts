import { authoriseOps, signedJson } from "@/modules/ops-link/respond";
import { getBusinessSummary } from "@/modules/ops-link/directory";

export const dynamic = "force-dynamic";

/** GET: one business's summary and usage counts (what ops's detail page shows). */
export async function GET(request: Request, { params }: { params: Promise<{ businessId: string }> }) {
  const auth = await authoriseOps(request);
  if ("response" in auth) return auth.response;
  const { businessId } = await params;
  const summary = await getBusinessSummary(businessId);
  if (!summary) return signedJson(auth.config, { error: "unknown_business" }, 404);
  return signedJson(auth.config, summary);
}
