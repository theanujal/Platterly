import "server-only";
import { newId, signedHeaders } from "@platterly/contract";
import { authoriseProductRequest } from "@/modules/registry/auth";
import { BillingError } from "./billing";
import { RazorpayError } from "./razorpay";

/**
 * Every billing route a product calls (docs/ops-contract.md section 8.1) goes through here: the request must be signed by the
 * product named in the URL, the answer is signed by ops, and a BillingError becomes a plain 4xx. The business has to be one the
 * product registered; the handlers check that, so another product's business always looks like "unknown_business".
 */
export async function billingRoute(request: Request, productKey: string, handler: (ctx: { rawBody: string; productKey: string }) => Promise<{ status?: number; body: unknown }>): Promise<Response> {
  const rawBody = request.method === "GET" || request.method === "HEAD" ? "" : await request.text();
  if (rawBody.length > 32 * 1024) return Response.json({ error: "body too large" }, { status: 413 });
  const auth = await authoriseProductRequest(request, productKey, rawBody);
  if ("response" in auth) return auth.response;
  const reply = (status: number, body: unknown) => {
    const text = JSON.stringify(body);
    return new Response(text, { status, headers: signedHeaders(auth.sign, newId("command"), text) });
  };
  try {
    const result = await handler({ rawBody, productKey });
    return reply(result.status ?? 200, result.body);
  } catch (error) {
    if (error instanceof BillingError) return reply(error.message === "unknown_business" || error.message === "unknown_invoice" ? 404 : 400, { error: error.message });
    if (error instanceof RazorpayError) return reply(502, { error: "Razorpay could not be reached. Please try again." });
    console.error("[billing api]", error);
    return reply(500, { error: "Something went wrong. Please try again." });
  }
}

export function parseJson(rawBody: string): unknown {
  try {
    return JSON.parse(rawBody);
  } catch {
    return undefined;
  }
}
