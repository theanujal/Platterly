import "server-only";
import { generateQrCodeDataUrl } from "@/lib/secure-access/qr";
import { resolvePaymentLink } from "@/modules/payments/payment-links";
import { buildUpiUri } from "@/modules/payments/payment-settings";

/** Everything the payment screen (PayClient) shows, for the payment page and for the pop-up that embeds it. Null when the link is not usable. */
export interface PayView {
  token: string;
  amount: number;
  balance: number;
  orderNumber: string;
  eventLabel: string;
  customerName: string;
  type: "ADVANCE" | "PARTIAL" | "FINAL";
  razorpay: boolean;
  upi: { uri: string; qr: string; id: string } | null;
  businessName: string;
  businessLogo: string | null;
}

export async function buildPayView(token: string): Promise<PayView | null> {
  const link = await resolvePaymentLink(token);
  if (!link) return null;
  const upiUri = link.upi ? buildUpiUri(link.upi, link.amount, `Order ${link.orderNumber}`) : null;
  const qr = upiUri ? await generateQrCodeDataUrl(upiUri) : null;
  return {
    token,
    amount: link.amount,
    balance: link.balance,
    orderNumber: link.orderNumber,
    eventLabel: link.eventLabel,
    customerName: link.customerName,
    type: link.type,
    razorpay: link.razorpayKeyId !== null,
    upi: upiUri && qr ? { uri: upiUri, qr, id: link.upi!.upiId } : null,
    businessName: link.businessName,
    businessLogo: link.businessLogo,
  };
}
