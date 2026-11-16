import { parseProductBillingProfileRequest, parseProductCounterRequest } from "@platterly/contract";
import { billingRoute, parseJson } from "@/modules/billing/api";
import { getProductBillingProfile, saveProductBillingProfile, setOrderCounter } from "@/modules/billing/product-billing-profile";
import { prisma } from "@/lib/db";
import { toRecord } from "@/modules/platform-list/platform-product-billing-profiles";

export const dynamic = "force-dynamic";

/** The business must be one this product registered: another product's business always looks like "unknown_business". */
const registered = async (businessId: string, productKey: string) => Boolean(await prisma.businessProduct.findUnique({ where: { businessId_productKey: { businessId, productKey } }, select: { businessId: true } }));

/** GET: this product's own billing profile for the business, or null when it has none yet (the product's Business Profile page opens with it). */
export async function GET(request: Request, { params }: { params: Promise<{ productKey: string; businessId: string }> }) {
  const { productKey, businessId } = await params;
  return billingRoute(request, productKey, async () => {
    if (!(await registered(businessId, productKey))) return { status: 404, body: { error: "unknown_business" } };
    const profile = await getProductBillingProfile(businessId, productKey);
    return { body: { profile: profile ? toRecord(profile) : null } };
  });
}

/**
 * PUT {baseVersion, fields}: the product saves its own profile (its Business Profile page). Always recorded as a change made in the product, never pushed back to it,
 * and only well-formedness is checked (the product's form has no billing contact, so the profile may stay incomplete). A stale save is 409 with the current record.
 */
export async function PUT(request: Request, { params }: { params: Promise<{ productKey: string; businessId: string }> }) {
  const { productKey, businessId } = await params;
  return billingRoute(request, productKey, async ({ rawBody }) => {
    const json = parseJson(rawBody);
    // The product's live order counter: no version, no history (it is not an edit).
    const counter = parseProductCounterRequest(json);
    if (counter) {
      if (!counter.ok) return { status: 400, body: { error: counter.error } };
      if (!(await registered(businessId, productKey))) return { status: 404, body: { error: "unknown_business" } };
      const applied = await setOrderCounter(businessId, productKey, counter.value);
      return { body: { ok: true, applied } };
    }
    const parsed = parseProductBillingProfileRequest(json && typeof json === "object" ? { ...(json as object), source: "product" } : json, { lenient: true });
    if (!parsed.ok || !parsed.value.fields) return { status: 400, body: { error: parsed.ok ? "fields are required" : parsed.error } };
    if (!(await registered(businessId, productKey))) return { status: 404, body: { error: "unknown_business" } };
    const result = await saveProductBillingProfile({ businessId, productKey, fields: parsed.value.fields, baseVersion: parsed.value.baseVersion, source: "product", editedBy: parsed.value.editedBy });
    if (result.ok) return { body: { profile: toRecord(result.profile) } };
    if (result.reason === "not_found") return { status: 404, body: { error: "unknown_business" } };
    return { status: 409, body: { error: "conflict", current: result.current ? toRecord(result.current) : null } };
  });
}
