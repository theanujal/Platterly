import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { resolveApprovalLink } from "@/modules/menu-approvals/approval-link";
import { buildApprovalView } from "@/modules/menu-approvals/approval-view";
import { PublicShell } from "@/components/public/public-shell";
import { ProgressSteps } from "@/components/public/progress-steps";
import { ReviewFlow } from "./_components/review-flow";
import { VenueScreen, ChangesCard, type VenuePayment } from "./_components/venue-screen";
import { ApprovedMenuCard, guestDetail } from "./_components/approved-menu-card";
import { ConfirmationHeader } from "./_components/confirmation-header";
import { VenueSummaryCard } from "./_components/venue-summary-card";
import { ShareOrderCard } from "./_components/share-order-card";
import { getShareState } from "@/modules/orders/order-share";
import { generateQrCodeDataUrl } from "@/lib/secure-access/qr";
import { PriceSummary } from "./_components/price-summary";
import { PaymentStatusCard } from "./_components/payment-status-card";
import { ContactLinks } from "./_components/contact-links";
import { getCustomerPaymentView, orderBalance } from "@/modules/payments/payment";
import { advanceAmount } from "@/modules/payments/payment-math";
import { getPaymentSettingsView } from "@/modules/payments/payment-settings";

// The tab names the order ("Order ORD-0002 – Kitchen name") so the customer can find it again; an order created before numbering keeps the generic title.
export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const { token } = await params;
  const link = await resolveApprovalLink(token);
  const order = link.ok && link.orderId ? await prisma.order.findFirst({ where: { id: link.orderId, organizationId: link.organizationId }, select: { orderNumber: true } }) : null;
  return {
    title: link.ok && order?.orderNumber ? `Order ${order.orderNumber} – ${link.organizationName}` : "Review & Approve Menu — Caterly",
    robots: { index: false, follow: false },
  };
}

const STEPS = ["Review & Approve", "Venue & Delivery", "Confirmation"];

// One link, three stages (2026-10-02): the menu to approve, then the venue and delivery details, then a read-only
// confirmation. It stays live after approval and ends only when the order is completed or cancelled (or the link is
// recalled, replaced or expired).
export default async function MenuApprovalPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const link = await resolveApprovalLink(token);

  // One neutral page for every failure (wrong, expired, revoked, superseded or finished) — no way to tell them apart.
  if (!link.ok) {
    return (
      <PublicShell brand={{ name: "Platterly", logo: null }} width="max-w-xl">
        <div className="flex flex-col items-center gap-3 rounded-xl bg-card p-8 text-center ring-1 ring-foreground/10 md:p-12">
          <h1 className="text-2xl font-semibold">This link is no longer active</h1>
          <p className="text-sm text-muted-foreground">
            If you&apos;ve already responded, there&apos;s nothing more to do. Otherwise, please contact your caterer — they can send you a new one.
          </p>
        </div>
      </PublicShell>
    );
  }

  // What is owed and how the customer can pay: the pop-up after the venue details, and the Payment card once confirmed.
  const [paymentSettings, money, paymentView, tokenRow] = await Promise.all([
    getPaymentSettingsView(link.organizationId),
    link.orderId ? orderBalance(link.organizationId, link.orderId) : Promise.resolve(null),
    link.orderId ? getCustomerPaymentView(link.organizationId, link.orderId) : Promise.resolve(null),
    prisma.secureAccessToken.findUnique({ where: { token }, select: { expiresAt: true } }),
  ]);
  // The last day this link works, shown on the Confirmation (it is pushed out when the customer confirms, see extendApprovedLink).
  const availableUntil = tokenRow?.expiresAt ? tokenRow.expiresAt.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata" }) : null;
  const owes = money !== null && money.balance > 0;
  const canPay = owes && paymentSettings.customersCanPay;
  const advance = money ? advanceAmount(money.total, money.paid, paymentSettings.advancePercent) : 0;
  const venuePayment: VenuePayment | null = canPay && money ? { advance, balance: money.balance, advancePercent: paymentSettings.advancePercent, orderNumber: money.orderNumber } : null;

  const orderNumber = money?.orderNumber ?? null;
  const view = buildApprovalView(link.snapshot);
  const brand = { name: link.organizationName, logo: link.organizationLogo };

  if (link.stage === "REVIEW") {
    return (
      <PublicShell brand={brand} width="max-w-7xl">
        <ReviewFlow token={token} view={view} versionNumber={link.versionNumber} venue={link.venue} venuePerEvent={link.venuePerEvent} eventVenues={link.eventVenues} payment={venuePayment} orderNumber={orderNumber} />
      </PublicShell>
    );
  }

  if (link.stage === "VENUE") {
    return (
      <PublicShell brand={brand} title="Venue & Delivery Details" subtitle="Your menu has been approved! Now tell us where and how we should deliver and set up." orderNumber={orderNumber} width="max-w-7xl">
        <ProgressSteps steps={STEPS} current={1} />
        <VenueScreen token={token} view={view} initial={link.venue} initialPerEvent={link.venuePerEvent} initialEventVenues={link.eventVenues} payment={venuePayment} orderNumber={orderNumber} />
      </PublicShell>
    );
  }

  const shareState = link.orderId ? await getShareState(link.organizationId, link.orderId) : { allowed: false, url: null };
  const shareQr = shareState.url ? await generateQrCodeDataUrl(shareState.url) : null;

  const summary = [view.eventType, view.dateText, view.guests !== null ? `${view.guests} Guests${guestDetail(view) ? ` (${guestDetail(view)})` : ""}` : null].filter(Boolean).join(" · ");
  return (
    <PublicShell brand={brand} width="max-w-6xl">
      <ConfirmationHeader orderNumber={orderNumber} summary={summary} availableUntil={availableUntil} />
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[20rem_minmax(0,1fr)]">
        <div className="order-2 flex flex-col gap-4 lg:order-1">
          <ApprovedMenuCard view={view} title="Event & Menu" />
          <ChangesCard token={token} canRequest={false}>
            <ContactLinks contact={link.organizationContact} message={`Hello, I have a question about my order${money?.orderNumber ? ` ${money.orderNumber}` : ""}.`} />
          </ChangesCard>
          {shareState.allowed && <ShareOrderCard token={token} initial={{ url: shareState.url, qr: shareQr }} />}
        </div>
        <div className="order-1 flex flex-col gap-4 lg:order-2">
          {paymentView && (paymentView.payments.length > 0 || paymentView.balance > 0) && (
            <PaymentStatusCard view={paymentView} kitchenName={link.organizationName} orderNumber={orderNumber} token={token} pay={venuePayment} contact={link.organizationContact} />
          )}
          <PriceSummary rows={view.priceRows} total={view.total} />
          <VenueSummaryCard view={view} venue={link.venue} perEvent={link.venuePerEvent ? link.eventVenues : null} />
        </div>
      </div>
    </PublicShell>
  );
}
