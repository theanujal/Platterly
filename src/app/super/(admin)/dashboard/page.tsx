import Link from "next/link";
import { CalendarDays, ChefHat, Clock, Crown, Gift, Layers, Power, ShoppingBag, UserPlus, Users, CircleCheck } from "lucide-react";
import { requireSuperAdminOrRedirect } from "../../_lib/guard";
import { getPlatformCounts, getProductBreakdown, getRecentCaterers, getTrialsEndingSoon } from "./queries";
import { PRODUCTS } from "@/lib/products";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "../_components/page-header";
import { Avatar, Panel, StatTile, trialBadge } from "../_components/display";

const longDate = (d: Date) => d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

// Chunk 3 Group 3.4 + the 2026-10-03 redesign (design system §13): counts across every product, real data only.
// Revenue (MRR/ARR), churn, failed payments and usage need billing (Chunks 20, 24) and are not shown.
export default async function SuperAdminOverviewPage() {
  const session = await requireSuperAdminOrRedirect();
  const now = new Date();
  const [counts, recent, trials, products] = await Promise.all([getPlatformCounts(), getRecentCaterers(5), getTrialsEndingSoon(5), getProductBreakdown()]);

  return (
    <>
      <PageHeader crumbs={[{ label: "Overview" }]} title={`Welcome, ${session.user.name}`} description="Every product at a glance." />
      <div className="grid grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))] gap-4" data-testid="overview-stats">
        <StatTile icon={<Users />} label="Total caterers" value={counts.totalCaterers} />
        <StatTile icon={<CircleCheck />} label="Active" value={counts.activeCaterers} tone="success" />
        <StatTile icon={<UserPlus />} label="New, last 7 days" value={counts.newRegistrations7d} tone="info" />
        <StatTile icon={<Gift />} label="On trial" value={counts.trialSubscriptions} tone="warning" />
        <StatTile icon={<Crown />} label="On a paid plan" value={counts.activeSubscriptions} />
        <StatTile icon={<ShoppingBag />} label="Orders processed" value={counts.ordersProcessed} />
        <StatTile icon={<CalendarDays />} label="Events processed" value={counts.eventsProcessed} />
        <StatTile icon={<Power />} label="Suspended" value={counts.suspendedCaterers} tone="danger" />
      </div>

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Panel icon={<Users />} title="Recent caterers" action={<Link href="/super/tenants" className="text-primary hover:underline">View all</Link>}>
          {recent.length === 0 && <p className="text-sm text-muted-foreground">No caterers yet.</p>}
          <ul className="flex flex-col divide-y divide-border" data-testid="recent-caterers">
            {recent.map((caterer) => (
              <li key={caterer.id} className="py-3.5 first:pt-0 last:pb-0">
                <Link href={`/super/tenants/${caterer.id}`} className="flex items-center gap-4 text-sm hover:opacity-80">
                  <Avatar name={caterer.name} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{caterer.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      Joined {longDate(caterer.createdAt)} · {caterer.slug}
                    </span>
                  </span>
                  {caterer.planName && <Badge variant={caterer.isTrial ? "orange" : "success"}>{caterer.isTrial ? "Trial" : caterer.planName}</Badge>}
                </Link>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel icon={<Clock />} title="Trials ending soon">
          {trials.length === 0 && <p className="text-sm text-muted-foreground">No trials ending in the next 7 days.</p>}
          <ul className="flex flex-col divide-y divide-border" data-testid="ending-trials">
            {trials.map((trial) => {
              const badge = trialBadge(trial.trialEndsAt);
              return (
                <li key={trial.organizationId} className="py-3.5 first:pt-0 last:pb-0">
                  <Link href={`/super/tenants/${trial.organizationId}`} className="flex items-center gap-4 text-sm hover:opacity-80">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{trial.name}</span>
                      <span className="block text-xs text-muted-foreground">
                        Trial {trial.trialEndsAt < now ? "ended" : "ends"} {longDate(trial.trialEndsAt)}
                      </span>
                    </span>
                    {badge && <Badge variant={badge.variant}>{badge.label}</Badge>}
                  </Link>
                </li>
              );
            })}
          </ul>
        </Panel>
      </div>

      <Panel icon={<Layers />} title="Products">
        <ul className="flex flex-col gap-3" data-testid="products-panel">
          {products.map((row) => {
            const product = PRODUCTS.find((p) => p.key === row.key);
            return (
              <li key={row.key} className="flex flex-wrap items-center gap-3 rounded-lg border border-border p-4 text-sm">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <ChefHat className="size-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <Link href={product?.navItems[0].href ?? "/super/dashboard"} className="block font-semibold hover:underline">
                    {product?.label ?? row.key}
                  </Link>
                  <span className="block text-xs text-muted-foreground">{row.key}.platterly.in</span>
                </span>
                <dl className="ml-auto flex gap-5 text-right tabular-nums">
                  {[
                    ["Caterers", row.caterers],
                    ["Orders", row.orders],
                    ["Events", row.events],
                  ].map(([label, value]) => (
                    <div key={label as string}>
                      <dd className="font-semibold">{(value as number).toLocaleString("en-IN")}</dd>
                      <dt className="text-xs text-muted-foreground">{label}</dt>
                    </div>
                  ))}
                </dl>
              </li>
            );
          })}
        </ul>
      </Panel>
    </>
  );
}
