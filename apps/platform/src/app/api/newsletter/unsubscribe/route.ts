import { accountOrigin } from "@/modules/auth/config";
import { identityPool } from "@/modules/auth/identity-db";
import { applyUnsubscribe, verifyUnsubscribe } from "@/modules/newsletter/unsubscribe";

// POST /api/newsletter/unsubscribe: turns the newsletter off for the person the signed link names. No sign-in (the link is the proof). Accepts the confirm page's form and a mail
// app's one-click POST alike (both carry `u` and `t` in the form body or the query). The answer is the same whether or not the person exists.
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const url = new URL(request.url);
  const form = await request.formData().catch(() => null);
  const userId = String(form?.get("u") ?? url.searchParams.get("u") ?? "");
  const token = String(form?.get("t") ?? url.searchParams.get("t") ?? "");
  if (!verifyUnsubscribe(process.env.AUTH_SECRET ?? "", userId, token)) return Response.json({ error: "invalid_link" }, { status: 400, headers: { "cache-control": "no-store" } });
  await applyUnsubscribe(identityPool(), userId);
  // From the confirm page the browser is sent back to a plain "done" page; a mail app's one-click POST gets the JSON answer.
  if (form?.get("from") === "page") return new Response(null, { status: 303, headers: { location: `${accountOrigin()}/unsubscribe?done=1`, "cache-control": "no-store" } });
  return Response.json({ status: "ok" }, { headers: { "cache-control": "no-store" } });
}
