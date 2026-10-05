import { authoriseOps, signedJson } from "@/modules/ops-link/respond";
import { listBusinessSummaries } from "@/modules/ops-link/directory";

export const dynamic = "force-dynamic";

/** GET ?cursor=&take=: a page of businesses (summaries only). */
export async function GET(request: Request) {
  const auth = await authoriseOps(request);
  if ("response" in auth) return auth.response;
  const url = new URL(request.url);
  const take = Number(url.searchParams.get("take")) || undefined;
  return signedJson(auth.config, await listBusinessSummaries({ cursor: url.searchParams.get("cursor") ?? undefined, take }));
}
