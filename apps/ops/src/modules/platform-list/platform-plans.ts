import "server-only";
import { CONTRACT_VERSION, isId, requestTarget, signedHeaders, verifyRequest, type PlatformBusinessBilling, type PlatformPlanCatalogue } from "@platterly/contract";
import { prisma } from "@/lib/db";
import { getBillingView, listSellablePlans } from "@/modules/billing/billing";
import { readerSecrets } from "./platform-list";

/** The plans on sale for every active product (public price information only: no business, subscription or payment data). */
export async function buildPlanCatalogue(now = new Date()): Promise<PlatformPlanCatalogue> {
  const products = await prisma.product.findMany({ where: { status: "ACTIVE" }, orderBy: { key: "asc" }, select: { key: true, name: true } });
  const out = [];
  for (const p of products) out.push({ productKey: p.key, name: p.name, plans: await listSellablePlans(p.key) });
  return { generatedAt: now.toISOString(), products: out };
}

/**
 * GET /api/platform/plans: the same scheme as the product list. Signed request in with the platform-reader secret (route-bound, 300 s window), signed
 * answer out. Anything wrong looks the same: 401. In production the request must have come through the proxy over https.
 */
export async function handlePlanCatalogueRequest(request: Request): Promise<Response> {
  const unauthorized = Response.json({ error: "unauthorized" }, { status: 401 });
  if (process.env.NODE_ENV === "production" && request.headers.get("x-forwarded-proto") !== "https") return unauthorized;
  const secrets = await readerSecrets();
  if (!secrets) return unauthorized;
  const verified = verifyRequest(secrets.accept, request.headers, "", { target: requestTarget(request.method, request.url) });
  if (!verified.ok) return unauthorized;
  if (verified.contract > CONTRACT_VERSION) return Response.json({ error: `contract ${verified.contract} is not supported` }, { status: 400 });
  const text = JSON.stringify(await buildPlanCatalogue());
  return new Response(text, { headers: { ...signedHeaders(secrets.sign, verified.id, text), "cache-control": "no-store" } });
}

/** Every product the business is linked to, with its subscription history and paid payments. Null when Ops has no such business. */
export async function buildBusinessBilling(businessId: string, now = new Date()): Promise<PlatformBusinessBilling | null> {
  const business = await prisma.business.findUnique({ where: { id: businessId }, select: { id: true } });
  if (!business) return null;
  const links = await prisma.businessProduct.findMany({ where: { businessId }, orderBy: { productKey: "asc" }, select: { productKey: true, product: { select: { name: true } } } });
  const products = [];
  for (const l of links) products.push({ productKey: l.productKey, name: l.product.name, billing: await getBillingView(businessId, l.productKey) });
  return { businessId, generatedAt: now.toISOString(), products };
}

/** GET /api/platform/businesses/{businessId}/billing: the same scheme as the plan catalogue. A bad id or an unknown business is a 404 after authentication, never before. */
export async function handleBusinessBillingRequest(request: Request, businessId: string): Promise<Response> {
  const unauthorized = Response.json({ error: "unauthorized" }, { status: 401 });
  if (process.env.NODE_ENV === "production" && request.headers.get("x-forwarded-proto") !== "https") return unauthorized;
  const secrets = await readerSecrets();
  if (!secrets) return unauthorized;
  const verified = verifyRequest(secrets.accept, request.headers, "", { target: requestTarget(request.method, request.url) });
  if (!verified.ok) return unauthorized;
  if (verified.contract > CONTRACT_VERSION) return Response.json({ error: `contract ${verified.contract} is not supported` }, { status: 400 });
  const data = isId("business", businessId) ? await buildBusinessBilling(businessId) : null;
  if (!data) return Response.json({ error: "not_found" }, { status: 404 });
  const text = JSON.stringify(data);
  return new Response(text, { headers: { ...signedHeaders(secrets.sign, verified.id, text), "cache-control": "no-store" } });
}
