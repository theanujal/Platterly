import { authoriseOps, signedJson } from "@/modules/ops-link/respond";
import { candidatesForOps } from "@/modules/library/apply";

export const dynamic = "force-dynamic";

/** GET /api/ops/library/candidates: what kitchens added that the library lacks (docs/ops-contract.md section 30). Names, category, type, unit and counts only. */
export async function GET(request: Request) {
  const auth = await authoriseOps(request);
  if ("response" in auth) return auth.response;
  return signedJson(auth.config, { candidates: await candidatesForOps() });
}
