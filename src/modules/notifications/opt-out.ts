import "server-only";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit/audit";

/**
 * Customers opt out of promotional messages with the link in their emails (AJ, 2026-10-04). Promotions need
 * `marketingConsent` (the storefront tick-box), so opting out switches that off and records when. Nothing
 * promotional is sent yet (WhatsApp campaigns are Chunk 21), and the emails a customer asked for are never
 * affected. `isPromotionalEvent` is the one place a future campaign event is declared.
 */
export const isPromotionalEvent = (event: string) => event.startsWith("promotion.");

export async function getOptOutView(customerId: string) {
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    select: { name: true, marketingConsent: true, marketingOptOutAt: true, organization: { select: { name: true } } },
  });
  if (!customer) return null;
  return { kitchenName: customer.organization.name, customerName: customer.name, optedOut: customer.marketingOptOutAt !== null && !customer.marketingConsent };
}

export async function setMarketingOptOut(customerId: string, optedOut: boolean) {
  const customer = await prisma.customer.findUniqueOrThrow({ where: { id: customerId }, select: { organizationId: true } });
  await prisma.customer.update({
    where: { id: customerId },
    data: optedOut ? { marketingConsent: false, marketingOptOutAt: new Date() } : { marketingConsent: true, marketingConsentAt: new Date(), marketingOptOutAt: null },
  });
  await audit({ organizationId: customer.organizationId, action: optedOut ? "customer.marketing_opt_out" : "customer.marketing_opt_in", recordType: "Customer", recordId: customerId });
}

/** May this customer be sent promotional messages? Needs the consent tick and no opt-out. */
export async function canSendPromotions(customerId: string): Promise<boolean> {
  const c = await prisma.customer.findUnique({ where: { id: customerId }, select: { marketingConsent: true, marketingOptOutAt: true } });
  return Boolean(c?.marketingConsent) && c?.marketingOptOutAt === null;
}
