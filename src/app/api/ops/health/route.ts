import { authoriseOps, signedJson } from "@/modules/ops-link/respond";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await authoriseOps(request);
  if ("response" in auth) return auth.response;
  return signedJson(auth.config, { status: "ok", productKey: auth.config.productKey });
}
