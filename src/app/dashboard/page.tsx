import type { Metadata } from "next";
import { requireActiveOrganization } from "@/lib/auth/require-session";
import { prisma } from "@/lib/db";
import { SignOutButton } from "../kitchenlogin/_components/sign-out-button";
import { OnboardingNudgeBanner } from "./_components/onboarding-nudge-banner";
import { CustomLinkDialog } from "./_components/custom-link-dialog";
import { OrdersOverviewCard } from "./_components/orders-overview-card";
import { UpcomingOrdersCard } from "./_components/upcoming-orders-card";
import { PaymentsOverviewCard } from "./_components/payments-overview-card";
import { InventoryOverviewCard } from "./_components/inventory-overview-card";
import { OrdersCalendarWidget } from "./_components/orders-calendar-widget";
import { PublicMenuShortcutCard } from "./_components/public-menu-shortcut-card";

export const metadata: Metadata = {
  title: "Dashboard — Platterly",
  robots: { index: false, follow: false },
};

// Minimal caterer-facing dashboard shell. Real modules (events, orders,
// kitchen, etc.) land in later chunks — this exists now so the redesigned
// signup/onboarding flow has a real place to land.
export default async function DashboardPage() {
  const { organizationId } = await requireActiveOrganization();
  const organization = await prisma.organization.findUniqueOrThrow({ where: { id: organizationId } });

  return (
    <main className="flex flex-1 flex-col gap-6 p-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Welcome, {organization.name}</h1>
          <p className="text-sm text-muted-foreground">Your catering business dashboard.</p>
        </div>
        <SignOutButton />
      </div>
      {!organization.onboardingCompletedAt && <OnboardingNudgeBanner />}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        <OrdersOverviewCard />
        <UpcomingOrdersCard />
        <PaymentsOverviewCard />
        <InventoryOverviewCard />
        <OrdersCalendarWidget />
        <PublicMenuShortcutCard slug={organization.slug} />
      </div>
      <CustomLinkDialog currentSlug={organization.slug} defaultOpen={organization.slugChangeCount === 0} />
    </main>
  );
}
