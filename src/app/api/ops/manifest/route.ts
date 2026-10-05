import { authoriseOps, signedJson } from "@/modules/ops-link/respond";
import { buildManifest } from "@/modules/ops-link/manifest";

export const dynamic = "force-dynamic";

/** GET: what this product offers ops (entitlement keys, trial defaults). Signed both ways. */
export async function GET(request: Request) {
  const auth = await authoriseOps(request);
  if ("response" in auth) return auth.response;
  return signedJson(auth.config, buildManifest(auth.config.productKey));
}
