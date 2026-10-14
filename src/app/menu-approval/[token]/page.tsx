import type { Metadata } from "next";
import { CircleCheck } from "lucide-react";
import { resolveApprovalLink, type VenueDetails } from "@/modules/menu-approvals/approval-link";
import { buildApprovalView } from "@/modules/menu-approvals/approval-view";
import { PublicShell } from "@/components/public/public-shell";
import { ProgressSteps } from "@/components/public/progress-steps";
import { FormCard } from "@/components/public/form-section";
import { ReviewFlow } from "./_components/review-flow";
import { VenueScreen, ChangesCard, type VenuePayment } from "./_components/venue-screen";
import { VENUE_TYPE_OPTIONS } from "@/modules/menu-approvals/venue-options";
import { ApprovedMenuCard } from "./_components/approved-menu-card";
import { ShareOrderCard } from "./_components/share-order-card";
import { getShareState } from "@/modules/orders/order-share";
import { generateQrCodeDataUrl } from "@/lib/secure-access/qr";
import { PriceSummary } from "./_components/price-summary";
import { PaymentInfoCard } from "./_components/payment-info-card";
import { ContactLinks } from "./_components/contact-links";
import { orderBalance } from "@/modules/payments/payment";
import { advanceAmount } from "@/modules/payments/payment-math";
import { getPaymentSettingsView } from "@/modules/payments/payment-settings";

export const metadata: Metadata = {
  title: "Review & Approve Menu — Caterly",
  robots: { index: false, follow: false },
};

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
  const [paymentSettings, money] = await Promise.all([
    getPaymentSettingsView(link.organizationId),
    link.orderId ? orderBalance(link.organizationId, link.orderId) : Promise.resolve(null),
  ]);
  const owes = money !== null && money.balance > 0;
  const canPay = owes && paymentSettings.customersCanPay;
  const advance = money ? advanceAmount(money.total, money.paid, paymentSettings.advancePercent) : 0;
  const venuePayment: VenuePayment | null = canPay && money ? { advance, balance: money.balance, advancePercent: paymentSettings.advancePercent, orderNumber: money.orderNumber } : null;

  const view = buildApprovalView(link.snapshot);
  const brand = { name: link.organizationName, logo: link.organizationLogo };

  if (link.stage === "REVIEW") {
    return (
      <PublicShell brand={brand} width="max-w-6xl">
        <ReviewFlow token={token} view={view} versionNumber={link.versionNumber} venue={link.venue} payment={venuePayment} />
      </PublicShell>
    );
  }

  if (link.stage === "VENUE") {
    return (
      <PublicShell brand={brand} title="Venue & Delivery Details" subtitle="Your menu has been approved! Now tell us where and how we should deliver and set up." width="max-w-6xl">
        <ProgressSteps steps={STEPS} current={1} />
        <VenueScreen token={token} view={view} initial={link.venue} payment={venuePayment} />
      </PublicShell>
    );
  }

  const shareState = link.orderId ? await getShareState(link.organizationId, link.orderId) : { allowed: false, url: null };
  const shareQr = shareState.url ? await generateQrCodeDataUrl(shareState.url) : null;

  return (
    <PublicShell brand={brand} title="Thank You!" subtitle="Your menu is final and on its way to our kitchen." width="max-w-6xl">
      <ProgressSteps steps={STEPS} current={3} />
      <div role="status" className="flex items-start gap-3 rounded-xl border border-success/30 bg-success/10 p-4" data-testid="venue-confirmation">
        <CircleCheck className="mt-0.5 size-5 shrink-0 text-success" />
        <div className="text-sm">
          <p className="font-semibold">We&apos;re starting the preparation</p>
          <p className="text-muted-foreground">
            Your menu is final and our kitchen team is getting ready. See you on {view.dateText}! You can come back to this page any time to see your menu and venue details.
          </p>
        </div>
      </div>
      {/* The wide column holds Price Summary then Venue; the narrow one the summary and side actions. Paying happens in the pop-up after the venue details (AJ, 2026-10-14). */}
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[20rem_minmax(0,1fr)]">
        <div className="order-2 flex flex-col gap-4 lg:order-1">
          <ApprovedMenuCard view={view} />
          <ChangesCard token={token}>
            <ContactLinks contact={link.organizationContact} message={`Hello, I have a question about my order${money?.orderNumber ? ` ${money.orderNumber}` : ""}.`} />
          </ChangesCard>
          {shareState.allowed && <ShareOrderCard token={token} initial={{ url: shareState.url, qr: shareQr }} />}
        </div>
        <div className="order-1 flex flex-col gap-4 lg:order-2">
          {owes && !canPay && money && <PaymentInfoCard balance={money.balance} advance={advance} orderNumber={money.orderNumber} contact={link.organizationContact} />}
          <PriceSummary rows={view.priceRows} total={view.total} isCustomMenu={view.isCustomMenu} />
          <VenueSummary venue={link.venue} />
        </div>
      </div>
    </PublicShell>
  );
}

function VenueSummary({ venue }: { venue: VenueDetails }) {
  const typeLabel = VENUE_TYPE_OPTIONS.find((o) => o.value === venue.venueType)?.label;
  const address = [venue.venueDoorNumber, venue.venueTower, venue.venueFloor].filter(Boolean).join(", ");
  const rows: [string, string | null][] = [
    ["Venue Type", typeLabel ?? null],
    ["Venue / Building Name", venue.venueBuildingName || null],
    ["Door / Tower / Floor", address || null],
    ["Complete Venue Address", venue.completeVenueAddress || null],
    ["Landmark", venue.venueLandmark || null],
    ["Contact Person", venue.venueContactName || null],
    ["Contact Number", venue.venueContactPhone || null],
    ["Loading / Access Instructions", venue.venueAccessInstructions || null],
    ["Cooking Instructions", venue.cookingInstructions || null],
    ["Gas / electric connection at venue", venue.gasElectricAvailable ? "Yes" : "No"],
    ["Cooking live counter facility", venue.liveCounterAvailable ? "Yes" : "No"],
  ];
  return (
    <FormCard className="gap-4" >
      <h2 className="text-lg font-semibold">Your Venue & Delivery Details</h2>
      <dl className="grid grid-cols-1 gap-x-8 gap-y-3 text-sm sm:grid-cols-2" data-testid="venue-summary">
        {rows
          .filter(([, value]) => value)
          .map(([label, value]) => (
            <div key={label} className="flex flex-col gap-0.5">
              <dt className="text-xs text-muted-foreground">{label}</dt>
              <dd className="font-medium whitespace-pre-line">{value}</dd>
            </div>
          ))}
      </dl>
    </FormCard>
  );
}
