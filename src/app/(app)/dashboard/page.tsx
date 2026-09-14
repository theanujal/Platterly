import type { Metadata } from "next";
import { requireActiveOrganization } from "@/lib/auth/require-session";
import { prisma } from "@/lib/db";
import { slugify } from "@/modules/tenants/slug";
import { OnboardingNudgeBanner } from "./_components/onboarding-nudge-banner";
import { CustomLinkDialog } from "./_components/custom-link-dialog";
import { OrdersOverviewCard } from "./_components/orders-overview-card";
import { UpcomingOrdersCard } from "./_components/upcoming-orders-card";
import { PaymentsOverviewCard } from "./_components/payments-overview-card";
import { InventoryOverviewCard } from "./_components/inventory-overview-card";
import { OrdersCalendarWidget } from "./_components/orders-calendar-widget";
import { PublicMenuShortcutCard } from "./_components/public-menu-shortcut-card";
import { MenuCatalogShortcutCard } from "./_components/menu-catalog-shortcut-card";

export const metadata: Metadata = {
  title: "Dashboard — Platterly",
  robots: { index: false, follow: false },
};

// Minimal caterer-facing dashboard shell. Real modules (events, orders,
// kitchen, etc.) land in later chunks — this exists now so the redesigned
// signup/onboarding flow has a real place to land. Sign-out lives in the
// sidebar footer (src/components/app-shell/app-sidebar.tsx) now, not here.
export default async function DashboardPage() {
  const { organizationId } = await requireActiveOrganization();
  const organization = await prisma.organization.findUniqueOrThrow({ where: { id: organizationId } });
  const suggestedSlug = organization.name !== "Unnamed Business" ? slugify(organization.name) : undefined;

  return (
    <main className="flex flex-1 flex-col gap-6 p-6 md:p-8">
      <div>
        <h1 className="text-2xl font-semibold">Welcome back, {organization.name}</h1>
        <p className="text-sm text-muted-foreground">Here&apos;s what&apos;s happening with your catering business.</p>
      </div>
      {!organization.onboardingCompletedAt && <OnboardingNudgeBanner />}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        <OrdersOverviewCard />
        <PaymentsOverviewCard />
        <InventoryOverviewCard organizationId={organizationId} />
        <UpcomingOrdersCard />
        <OrdersCalendarWidget />
        <div className="flex flex-col gap-4">
          <MenuCatalogShortcutCard />
          <PublicMenuShortcutCard slug={organization.slug} slugChangeCount={organization.slugChangeCount} />
        </div>
      </div>
      <CustomLinkDialog suggestedSlug={suggestedSlug} defaultOpen={organization.slugChangeCount === 0} />
    </main>
  );
}
