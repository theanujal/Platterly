import "server-only";
import { checkBillingProfile, type Buyer } from "@platterly/contract";
import type { Session } from "@/lib/session";
import { billingAccess } from "./billing-rights";
import { fetchOpsBillingProfile, type OpsReadFailure } from "./ops-catalogue";
import { saveOpsBillingProfile, type CheckoutFailure } from "./ops-checkout";
import { readBuyer } from "./purchase";

/**
 * The Account's Billing details page (F12.2.1): the signed-in person's own business's saved billing details, read from and saved through Ops. Only the business's
 * active Admin may read or change them (`billingAccess`); the business is never named by the request. Ops holds the details and checks them again on save.
 */
export type ProfileFailure = "not_signed_in" | "no_business" | "not_admin" | "bad_request" | OpsReadFailure | "not_found" | CheckoutFailure;
export type ProfileView = { businessName: string; buyer: Buyer | null; updatedAt: string | null };
export type ProfileResult = { ok: true; answer: ProfileView } | { ok: false; reason: ProfileFailure; message?: string; fields?: Record<string, string> };

const refusal = (status: "unauthenticated" | "no_business" | "not_admin"): { ok: false; reason: ProfileFailure } => ({ ok: false, reason: status === "unauthenticated" ? "not_signed_in" : status });

export async function loadMyBillingProfile(session: Session | null): Promise<ProfileResult> {
  const access = await billingAccess(session);
  if (access.status !== "ok") return refusal(access.status);
  const got = await fetchOpsBillingProfile(access.businessId);
  // A business Ops has no record of yet simply has no saved details.
  if (!got.ok) return got.reason === "not_found" ? { ok: true, answer: { businessName: access.businessName, buyer: null, updatedAt: null } } : { ok: false, reason: got.reason };
  return { ok: true, answer: { businessName: access.businessName, buyer: got.answer.profile, updatedAt: got.answer.updatedAt } };
}

export async function saveMyBillingProfile(session: Session | null, input: unknown): Promise<ProfileResult> {
  const access = await billingAccess(session);
  if (access.status !== "ok" || !session) return refusal(access.status === "ok" ? "unauthenticated" : access.status);
  const base = readBuyer(input);
  const o = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const contact = (value: unknown, max: number) => (typeof value === "string" ? value.trim().slice(0, max) || null : null);
  const buyer = { ...(base.ok ? base.buyer : { name: "", addressLine1: null, addressLine2: null, city: null, state: null, postalCode: null, country: null, gstin: null }), contactName: contact(o.contactName, 120), contactEmail: contact(o.contactEmail, 160), contactPhone: contact(o.contactPhone, 20) };
  const fields = { ...(base.ok ? {} : base.fields), ...checkBillingProfile(buyer) } as Record<string, string>;
  if (Object.keys(fields).length) return { ok: false, reason: "bad_request", fields };
  const got = await saveOpsBillingProfile({ businessId: access.businessId, buyer, editedBy: session.userId });
  if (!got.ok) return got;
  return { ok: true, answer: { businessName: access.businessName, buyer: got.answer.profile, updatedAt: got.answer.updatedAt } };
}

/** The same answer for the page and the API: which HTTP status a failure is. */
export const profileStatus = (reason: ProfileFailure): number =>
  reason === "not_signed_in" ? 401 : reason === "not_admin" ? 403 : reason === "no_business" ? 409 : reason === "bad_request" ? 422 : reason === "rejected" ? 400 : reason === "unknown_business" || reason === "not_found" ? 404 : reason === "not_configured" ? 503 : 502;
