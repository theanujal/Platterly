import "server-only";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit/audit";
import { notify } from "@/lib/notifications/notify";
import { emailPayload, loadOrderContext } from "@/modules/notifications/triggers";
import { getChannelSettings } from "@/modules/notifications/channel-settings";
import { invoiceUrl } from "@/modules/payments/payment-links";
import { syncInvoiceStatuses } from "./invoice";

/**
 * "Send invoice" / "Send receipt": the customer gets the link to the invoice page. Goes through the
 * log-only notify() until Chunk 16 connects the email provider, so `emailActive` tells the UI
 * whether anything is really delivered yet.
 */
export async function sendInvoiceDocument(organizationId: string, invoiceId: string, actorUserId?: string) {
  const invoice = await prisma.invoice.findFirstOrThrow({ where: { id: invoiceId, organizationId } });
  const url = await invoiceUrl(organizationId, invoiceId);
  const email = await getChannelSettings(organizationId, "email");
  const context = await loadOrderContext(organizationId, invoice.orderId);
  const payload = emailPayload(context, { template: invoice.type === "RECEIPT" ? "receipt" : "invoice", number: invoice.number, amount: Number(invoice.total), url });
  const event = invoice.type === "RECEIPT" ? "receipt.sent" : "invoice.sent";
  if (invoice.customerEmail) await notify({ organizationId, channel: "EMAIL", event, recipient: { email: invoice.customerEmail }, payload: JSON.parse(JSON.stringify(payload)) });
  if (invoice.type === "INVOICE" && !invoice.sentAt) {
    await prisma.invoice.update({ where: { id: invoiceId }, data: { sentAt: new Date() } });
    await syncInvoiceStatuses(invoice.orderId);
  }
  await audit({ organizationId, actorUserId, action: event.replace(".", "_"), recordType: "Invoice", recordId: invoiceId, after: { number: invoice.number, hasEmail: !!invoice.customerEmail } });
  return { url, hasEmail: !!invoice.customerEmail, emailActive: email.active };
}

/** The receipt for a confirmed payment, sent to the customer. No-op when the payment has no receipt. */
export async function sendReceiptForPayment(organizationId: string, paymentId: string, actorUserId?: string) {
  const receipt = await prisma.invoice.findFirst({ where: { organizationId, receiptForPaymentId: paymentId } });
  if (!receipt) return null;
  return sendInvoiceDocument(organizationId, receipt.id, actorUserId);
}
