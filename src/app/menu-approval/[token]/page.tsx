import type { Metadata } from "next";
import { CircleCheck } from "lucide-react";
import { resolveApprovalLink, type VenueDetails } from "@/modules/menu-approvals/approval-link";
import { buildApprovalView } from "@/modules/menu-approvals/approval-view";
import { PublicShell } from "@/components/public/public-shell";
import { ProgressSteps } from "@/components/public/progress-steps";
import { FormCard } from "@/components/public/form-section";
import { ReviewFlow } from "./_components/review-flow";
import { VenueScreen, ChangesCard } from "./_components/venue-screen";
import { VENUE_TYPE_OPTIONS } from "@/modules/menu-approvals/venue-options";
import { ApprovedMenuCard } from "./_components/approved-menu-card";
import { PriceSummary } from "./_components/price-summary";
import { PaymentBox } from "./_components/payment-box";
import { orderBalance } from "@/modules/payments/payment";
import { advanceAmount } from "@/modules/payments/payment-math";
import { getPaymentSettingsView } from "@/modules/payments/payment-settings";

export const metadata: Metadata = {
  title: "Review & Approve Menu — Platterly",
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

  const view = buildApprovalView(link.snapshot);
  const brand = { name: link.organizationName, logo: link.organizationLogo };

  if (link.stage === "REVIEW") {
    return (
      <PublicShell brand={brand} width="max-w-6xl">
        <ReviewFlow token={token} view={view} versionNumber={link.versionNumber} venue={link.venue} />
      </PublicShell>
    );
  }

  if (link.stage === "VENUE") {
    return (
      <PublicShell brand={brand} title="Venue & Delivery Details" subtitle="Your menu has been approved! Now tell us where and how we should deliver and set up." width="max-w-6xl">
        <ProgressSteps steps={STEPS} current={1} />
        <VenueScreen token={token} view={view} initial={link.venue} />
      </PublicShell>
    );
  }

  // The menu is final: if the kitchen has set up Razorpay or UPI, the customer can pay now (or skip; the link is sent anyway).
  const [paymentSettings, money] = await Promise.all([
    getPaymentSettingsView(link.organizationId),
    link.orderId ? orderBalance(link.organizationId, link.orderId) : Promise.resolve(null),
  ]);
  const canPay = money !== null && money.balance > 0 && paymentSettings.customersCanPay;

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
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[20rem_minmax(0,1fr)]">
        <div className="flex flex-col gap-4">
          <ApprovedMenuCard view={view} />
          <PriceSummary rows={view.priceRows} total={view.total} isCustomMenu={view.isCustomMenu} />
          <ChangesCard token={token} />
        </div>
        <div className="flex flex-col gap-4">
          {canPay && money && (
            <PaymentBox
              token={token}
              advance={advanceAmount(money.total, money.paid, paymentSettings.advancePercent)}
              balance={money.balance}
              advancePercent={paymentSettings.advancePercent}
              paid={money.paid}
            />
          )}
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
