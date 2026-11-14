import "server-only";
import { prisma } from "@/lib/db";
import { createRazorpayCustomer, type PlatformRazorpay } from "./razorpay";
import { BillingError } from "./billing-error";

/**
 * The business's customer in Platterly's Razorpay account, made the first time a payment method is needed and then reused
 * (docs/payment-methods-design.md). Razorpay lists a customer's saved methods only when authorisations carry its id.
 */
export async function ensureRazorpayCustomer(businessId: string, creds: PlatformRazorpay, fetchImpl: typeof fetch = fetch): Promise<string> {
  const saved = await prisma.razorpayCustomer.findUnique({ where: { businessId } });
  if (saved) return saved.customerId;
  const business = await prisma.business.findUniqueOrThrow({ where: { id: businessId }, select: { name: true, ownerEmail: true, ownerPhone: true } });
  if (!business.ownerEmail) throw new BillingError("Add the owner's email address before saving a payment method.");
  if (!business.ownerPhone) throw new BillingError("Add the owner's mobile number before saving a payment method.");
  const { id } = await createRazorpayCustomer(creds, { name: business.name, email: business.ownerEmail, contact: business.ownerPhone, businessId }, fetchImpl);
  // Two first calls at once each make a customer; Razorpay returns the same one for the same contact, and the first saved row wins.
  return (await prisma.razorpayCustomer.upsert({ where: { businessId }, create: { businessId, customerId: id }, update: {} })).customerId;
}
