import type { Metadata } from "next";
import { PublicShell } from "@/components/public/public-shell";
import { generateQrCodeDataUrl } from "@/lib/secure-access/qr";
import { resolvePaymentLink } from "@/modules/payments/payment-links";
import { buildUpiUri } from "@/modules/payments/payment-settings";
import { PayClient } from "./_components/pay-client";

export const metadata: Metadata = {
  title: "Pay — Platterly",
  robots: { index: false, follow: false },
};

export default async function PayPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const link = await resolvePaymentLink(token);

  // One neutral page for every failure (wrong, expired, other kitchen, or already paid in full).
  if (!link) {
    return (
      <PublicShell brand={{ name: "Platterly", logo: null }} width="max-w-xl">
        <div className="flex flex-col items-center gap-3 rounded-xl bg-card p-8 text-center ring-1 ring-foreground/10 md:p-12">
          <h1 className="text-2xl font-semibold">This link is no longer active</h1>
          <p className="text-sm text-muted-foreground">If you have already paid, there is nothing more to do. Otherwise, please contact your caterer and they can send you a new one.</p>
        </div>
      </PublicShell>
    );
  }

  const upiUri = link.upi ? buildUpiUri(link.upi, link.amount, `Order ${link.orderNumber}`) : null;
  const qr = upiUri ? await generateQrCodeDataUrl(upiUri) : null;

  return (
    <PublicShell brand={{ name: link.businessName, logo: link.businessLogo }} width="max-w-lg">
      <PayClient
        token={token}
        amount={link.amount}
        balance={link.balance}
        orderNumber={link.orderNumber}
        eventLabel={link.eventLabel}
        customerName={link.customerName}
        type={link.type}
        razorpay={link.razorpayKeyId !== null}
        upi={upiUri && qr ? { uri: upiUri, qr, id: link.upi!.upiId } : null}
      />
    </PublicShell>
  );
}
