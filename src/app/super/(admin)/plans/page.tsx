import Link from "next/link";
import { Crown, Gift, Pencil } from "lucide-react";
import { requireSuperAdminOrRedirect } from "../../_lib/guard";
import { prisma } from "@/lib/db";
import { listPlans } from "@/modules/subscriptions/plan";
import { ensureTrialPlan } from "@/modules/subscriptions/trial-plan";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TableCell } from "@/components/ui/table";
import { CatalogBrowser, type CatalogEntry, type CatalogSortOption } from "@/components/catalog/catalog-browser";
import { PageHeader } from "../_components/page-header";

const LIMITS = [
  ["maxUsers", "Team members"],
  ["maxOrders", "Orders"],
  ["maxEvents", "Events"],
  ["maxCustomers", "Customers"],
  ["maxMenuLinks", "Menu links"],
] as const;

const inr = (n: unknown) => `₹${Number(n).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

// Chunk 3 Group 3.3 + the 2026-10-03 redesign (design system §13): plans as cards, with their limits as readable rows.
// The Trial plan is seeded lazily here, see src/modules/subscriptions/trial-plan.ts.
export default async function PlansPage() {
  await requireSuperAdminOrRedirect();
  await ensureTrialPlan();
  const [plans, usage] = await Promise.all([listPlans(), prisma.subscription.groupBy({ by: ["subscriptionPlanId"], where: { endDate: null }, _count: { _all: true } })]);
  const caterersOn = new Map(usage.map((row) => [row.subscriptionPlanId, row._count._all]));

  const sortOptions: CatalogSortOption[] = [
    { value: "oldest", label: "Oldest First", key: "oldest" },
    { value: "name", label: "Name (A–Z)", key: "name" },
  ];

  const entries: CatalogEntry[] = plans.map((plan) => {
    const price = plan.isTrial ? "₹0" : plan.priceMonthly ? inr(plan.priceMonthly) : "—";
    const period = plan.isTrial ? `for ${plan.trialDurationDays ?? 7} days` : plan.priceMonthly ? "per month" : "";
    const count = caterersOn.get(plan.id) ?? 0;
    const status = <Badge variant={plan.isActive ? "success" : "neutral"}>{plan.isActive ? "Active" : "Inactive"}</Badge>;
    return {
      id: plan.id,
      href: `/super/plans/${plan.id}`,
      searchText: `${plan.name} ${plan.code}`,
      sortValues: { name: plan.name, oldest: plan.createdAt.getTime() },
      card: (
        <div className="flex h-full flex-col gap-4 p-5" data-testid="plan-card">
          <div className="flex items-start justify-between gap-3">
            <span className="flex min-w-0 items-center gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">{plan.isTrial ? <Gift className="size-5" /> : <Crown className="size-5" />}</span>
              <span className="truncate text-base font-semibold">{plan.name}</span>
            </span>
            {plan.isTrial ? <Badge variant="orange">Trial plan</Badge> : <Pencil className="mt-1 size-4 shrink-0 text-muted-foreground" aria-hidden />}
          </div>
          <div className="text-2xl font-semibold tabular-nums">
            {price} <span className="text-sm font-normal text-muted-foreground">{period}</span>
          </div>
          <dl className="flex flex-col">
            {LIMITS.map(([key, label]) => (
              <div key={key} className="flex items-center justify-between gap-3 border-t border-border py-2 text-sm first:border-t-0">
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="font-semibold">{plan[key] === null ? "Unlimited" : plan[key]?.toLocaleString("en-IN")}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-auto flex items-center justify-between gap-3 border-t border-border pt-3">
            {status}
            <span className="text-xs text-muted-foreground">
              {count} {count === 1 ? "caterer" : "caterers"}
            </span>
          </div>
        </div>
      ),
      listRow: (
        <>
          <TableCell className="px-3 py-3">
            <div className="flex items-center gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">{plan.isTrial ? <Gift className="size-5" /> : <Crown className="size-5" />}</span>
              <div className="flex flex-col gap-0.5">
                <span className="font-semibold">{plan.name}</span>
                <span className="text-xs text-muted-foreground">{plan.code}</span>
              </div>
              {plan.isTrial && <Badge variant="orange">Trial plan</Badge>}
            </div>
          </TableCell>
          <TableCell className="px-3 py-3 font-semibold tabular-nums">
            {price} <span className="text-xs font-normal text-muted-foreground">{period}</span>
          </TableCell>
          <TableCell className="px-3 py-3 text-sm text-muted-foreground">
            {plan.maxUsers === null ? "Unlimited" : plan.maxUsers} members · {plan.maxOrders === null ? "Unlimited" : plan.maxOrders} orders
          </TableCell>
          <TableCell className="px-3 py-3 text-sm tabular-nums">{count}</TableCell>
          <TableCell className="px-3 py-3">{status}</TableCell>
        </>
      ),
    };
  });

  return (
    <>
      <PageHeader
        crumbs={[{ label: "Catering" }, { label: "Plans" }]}
        title="Plans"
        description="What each caterer plan includes."
        action={
          <Button render={<Link href="/super/plans/new" />} nativeButton={false}>
            <Crown />
            New Plan
          </Button>
        }
      />
      <CatalogBrowser
        entries={entries}
        columns={["Plan", "Price", "Limits", "Caterers", "Status"]}
        searchPlaceholder="Search plans…"
        emptyLabel="No plans yet."
        sortOptions={sortOptions}
        richList
        defaultView="grid"
        gridColumnsClassName="grid-cols-[repeat(auto-fill,minmax(min(18rem,100%),1fr))]"
        pageSize={16}
      />
    </>
  );
}
