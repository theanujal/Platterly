import { parseLibraryEntryUpdate } from "@platterly/contract";
import { authoriseOps, signedJson } from "@/modules/ops-link/respond";
import { LibraryError } from "@/modules/library/apply";
import { listEntries, updateEntry } from "@/modules/library/entries";

export const dynamic = "force-dynamic";

/** GET /api/ops/library/entries?kind=FOOD_ITEM|INGREDIENT: the library's own entries, for Ops to edit (docs/ops-contract.md section 31). */
export async function GET(request: Request) {
  const auth = await authoriseOps(request);
  if ("response" in auth) return auth.response;
  const kind = new URL(request.url).searchParams.get("kind");
  if (kind !== "FOOD_ITEM" && kind !== "INGREDIENT") return signedJson(auth.config, { error: "kind must be FOOD_ITEM or INGREDIENT" }, 400);
  return signedJson(auth.config, { entries: await listEntries(kind) });
}

/** POST /api/ops/library/entries: one change to one library entry. Safe to send twice. */
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
  const parsed = parseLibraryEntryUpdate(body);
  if (!parsed.ok) return signedJson(auth.config, { error: parsed.error }, 400);
  try {
    return signedJson(auth.config, { result: await updateEntry(parsed.value) });
  } catch (error) {
    if (error instanceof LibraryError) return signedJson(auth.config, { error: error.message }, error.status);
    console.error("[library] entry update failed:", error);
    return signedJson(auth.config, { error: "failed" }, 500);
  }
}
