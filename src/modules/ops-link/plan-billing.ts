import "server-only";
import type { BillingView, PlanOffer } from "@platterly/contract";
import { prisma } from "@/lib/db";
import { opsBilling, OpsUnavailableError } from "./billing-client";
import { opsBillingOn } from "./config";

/**
 * The data behind Caterly's read-only Subscription page (docs/caterly-billing-view-plan.md, AJ 2026-11-15). Ops holds the subscription, the payments, the invoices and the
 * credit notes; Caterly asks over its signed billing client and only looks. Nothing here changes anything, and nothing is read from Caterly's own old billing rows.
 */
export type PlanBillingPage = { state: "off" } | { state: "unavailable" } | { state: "ok"; view: BillingView; plans: PlanOffer[] };

const businessIdOf = async (organizationId: string) => (await prisma.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { businessId: true } })).businessId;

export async function loadPlanBilling(organizationId: string, fetchImpl: typeof fetch = fetch): Promise<PlanBillingPage> {
  if (!opsBillingOn()) return { state: "off" };
  try {
    const businessId = await businessIdOf(organizationId);
    const [billing, plans] = await Promise.all([opsBilling<BillingView>("GET", `/businesses/${businessId}/billing`, undefined, fetchImpl), opsBilling<{ plans?: PlanOffer[] }>("GET", "/billing/plans", undefined, fetchImpl)]);
    if (billing.status !== 200) return { state: "unavailable" };
    // The plan list is only for the price and "what it includes"; the page still works without it.
    return { state: "ok", view: billing.json, plans: plans.status === 200 && Array.isArray(plans.json.plans) ? plans.json.plans : [] };
  } catch (error) {
    if (error instanceof OpsUnavailableError) return { state: "unavailable" };
    throw error;
  }
}

export type PdfResult = { ok: true; fileName: string; pdf: Buffer } | { ok: false; reason: "not_found" | "unavailable" };

/** An invoice or a credit note as a PDF from Ops (scoped by Ops to this business and product, so another kitchen's id is simply not found). */
export async function fetchBillingPdf(kind: "invoice" | "credit-note", organizationId: string, id: string, fetchImpl: typeof fetch = fetch): Promise<PdfResult> {
  if (!opsBillingOn() || !/^[A-Za-z0-9_-]{1,64}$/.test(id)) return { ok: false, reason: "not_found" };
  try {
    const businessId = await businessIdOf(organizationId);
    const path = kind === "invoice" ? `/businesses/${businessId}/billing/payments/${id}/pdf` : `/businesses/${businessId}/billing/refunds/${id}/credit-note`;
    const { status, json } = await opsBilling<{ fileName?: unknown; pdfBase64?: unknown }>("GET", path, undefined, fetchImpl);
    if (status === 404) return { ok: false, reason: "not_found" };
    if (status !== 200 || typeof json.fileName !== "string" || !/^[A-Za-z0-9._-]{1,80}$/.test(json.fileName) || typeof json.pdfBase64 !== "string") return { ok: false, reason: "unavailable" };
    const pdf = Buffer.from(json.pdfBase64, "base64");
    return pdf.subarray(0, 5).toString("latin1") === "%PDF-" ? { ok: true, fileName: json.fileName, pdf } : { ok: false, reason: "unavailable" };
  } catch (error) {
    if (error instanceof OpsUnavailableError) return { ok: false, reason: "unavailable" };
    throw error;
  }
}
