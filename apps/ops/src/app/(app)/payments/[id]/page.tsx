import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { Card, PageHeader, buttonClass, formatWhen, money } from "@/components/ui";
import type { InvoiceSnapshot } from "@/modules/billing/math";
import { listRazorpayEvents } from "@/modules/billing/events";
import { PaymentLog } from "../payment-log";

export const dynamic = "force-dynamic";

const address = (p: { addressLine1: string | null; addressLine2: string | null; city: string | null; state: string | null; postalCode: string | null; country: string | null }) =>
  [p.addressLine1, p.addressLine2, [p.city, p.state, p.postalCode].filter(Boolean).join(", "), p.country].filter(Boolean);

/** One paid invoice exactly as it was frozen when the payment was confirmed. */
export default async function PaymentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const payment = await prisma.subscriptionPayment.findUnique({ where: { id }, include: { business: true, plan: true, product: true } });
  if (!payment || !payment.invoiceSnapshot) notFound();
  const snapshot = payment.invoiceSnapshot as unknown as InvoiceSnapshot;
  const ids = [
    payment.razorpaySubscriptionId && { razorpaySubscriptionId: payment.razorpaySubscriptionId },
    payment.razorpayOrderId && { razorpayOrderId: payment.razorpayOrderId },
    payment.razorpayPaymentId && { razorpayPaymentId: payment.razorpayPaymentId },
  ].filter((w) => !!w);
  const events = ids.length > 0 ? await listRazorpayEvents({ OR: ids }) : [];

  return (
    <>
      <PageHeader
        title={`Invoice ${payment.invoiceNumber}`}
        description={`${payment.business.name} · ${payment.product.name} · paid ${formatWhen(payment.paidAt)}`}
        actions={<a href={`/payments/${payment.id}/invoice`} download className={buttonClass("outline", "md")}>Download invoice</a>}
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <p className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">Seller</p>
          <p className="font-medium">{snapshot.seller.legalName ?? "—"}</p>
          {address(snapshot.seller).map((line) => <p key={line} className="text-sm text-muted-foreground">{line}</p>)}
          <p className="mt-2 text-sm">GSTIN {snapshot.seller.gstin ?? "—"} · SAC {snapshot.seller.sacCode}</p>
        </Card>
        <Card>
          <p className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">Buyer</p>
          <p className="font-medium"><Link className="hover:underline" href={`/businesses/${payment.business.id}`}>{snapshot.buyer.name}</Link></p>
          {address(snapshot.buyer).map((line) => <p key={line} className="text-sm text-muted-foreground">{line}</p>)}
          <p className="mt-2 text-sm">GSTIN {snapshot.buyer.gstin ?? "—"}</p>
        </Card>
      </div>
      <Card className="mt-4">
        <dl className="grid gap-2 text-sm">
          <div className="flex justify-between"><dt>{payment.plan.name}, {payment.interval === "ANNUAL" ? "1 year" : "30 days"} ({formatWhen(payment.periodStart)} to {formatWhen(payment.periodEnd)})</dt><dd>{money(payment.amount)}</dd></div>
          {snapshot.gst.lines.map((line) => <div key={line.label} className="flex justify-between text-muted-foreground"><dt>{line.label}</dt><dd>{money(line.amount)}</dd></div>)}
          <div className="flex justify-between border-t pt-2 font-semibold"><dt>Total</dt><dd>{money(payment.total)}</dd></div>
        </dl>
        {snapshot.seller.note ? <p className="mt-4 text-sm text-muted-foreground">{snapshot.seller.note}</p> : null}
      </Card>
      <p className="mt-4 text-xs text-muted-foreground">Razorpay order {payment.razorpayOrderId ?? "—"} · payment {payment.razorpayPaymentId ?? "—"}{payment.importedFrom ? ` · imported from ${payment.importedFrom}` : ""}</p>
      <h2 className="mb-3 mt-8 text-base font-semibold">Payment log</h2>
      <PaymentLog rows={events} />
    </>
  );
}
