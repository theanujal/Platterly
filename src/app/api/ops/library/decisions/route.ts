import { parseLibraryDecision } from "@platterly/contract";
import { authoriseOps, signedJson } from "@/modules/ops-link/respond";
import { applyDecision, LibraryError } from "@/modules/library/apply";

export const dynamic = "force-dynamic";

/** POST /api/ops/library/decisions: a reviewer's answer for one candidate (docs/ops-contract.md section 30). Safe to send twice. */
export async function POST(request: Request) {
  const auth = await authoriseOps(request);
  if ("response" in auth) return auth.response;
  if (auth.rawBody.length > 8_000) return signedJson(auth.config, { error: "too_large" }, 413);
  let body: unknown;
  try {
    body = JSON.parse(auth.rawBody);
  } catch {
    return signedJson(auth.config, { error: "invalid_json" }, 400);
  }
  const parsed = parseLibraryDecision(body);
  if (!parsed.ok) return signedJson(auth.config, { error: parsed.error }, 400);
  try {
    return signedJson(auth.config, { result: await applyDecision(parsed.value) });
  } catch (error) {
    if (error instanceof LibraryError) return signedJson(auth.config, { error: error.message }, error.status);
    console.error("[library] decision failed:", error);
    return signedJson(auth.config, { error: "failed" }, 500);
  }
}
