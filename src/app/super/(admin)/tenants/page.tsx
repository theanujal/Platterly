import Link from "next/link";
import { CalendarDays, Link2, Mail, ShoppingBag, UserPlus } from "lucide-react";
import { requireSuperAdminOrRedirect } from "../../_lib/guard";
import { getPlatformCounts, listCaterersOverview } from "../dashboard/queries";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TableCell } from "@/components/ui/table";
import { CatalogBrowser, type CatalogEntry, type CatalogSortOption } from "@/components/catalog/catalog-browser";
import { PageHeader } from "../_components/page-header";
import { Avatar, TenantStatusBadge, trialBadge } from "../_components/display";
import { CatererCardMenu } from "./_components/caterer-card-menu";
import { cn } from "cn";
import type { TenantStatus } from "@/generated/prisma/enums";

const longDate = (d: Date) => d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

const FILTERS: { label: string; value?: TenantStatus; count: "totalCaterers" | "activeCaterers" | "suspendedCaterers" | "deactivatedCaterers" }[] = [
  { label: "All", count: "totalCaterers" },
  { label: "Active", value: "ACTIVE", count: "activeCaterers" },
  { label: "Suspended", value: "SUSPENDED", count: "suspendedCaterers" },
  { label: "Deactivated", value: "DEACTIVATED", count: "deactivatedCaterers" },
];

function PlanBadge({ planName, trialing, trialEndsAt }: { planName: string | null; trialing: boolean; trialEndsAt: Date | null }) {
  if (!planName) return <Badge variant="neutral">No plan</Badge>;
  if (trialing) {
    const days = trialBadge(trialEndsAt);
    return <Badge variant="orange">{days ? `Trial · ${days.label}` : "Trial"}</Badge>;
  }
  return <Badge variant="info">{planName}</Badge>;
}

// Chunk 3 Group 3.2 + the 2026-10-03 redesign (design system §13): the Customers card and list pattern.
export default async function CaterersPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  await requireSuperAdminOrRedirect();
  const { status } = await searchParams;
  const activeFilter = FILTERS.find((f) => f.value === status)?.value;
  const [caterers, counts] = await Promise.all([listCaterersOverview(activeFilter ? { status: activeFilter } : undefined), getPlatformCounts()]);

  const sortOptions: CatalogSortOption[] = [
    { value: "newest", label: "Newest First", key: "newest", direction: "desc" },
    { value: "name", label: "Name (A–Z)", key: "name" },
    { value: "orders", label: "Orders (High–Low)", key: "orders", direction: "desc" },
  ];

  const entries: CatalogEntry[] = caterers.map((caterer) => ({
    id: caterer.id,
    href: `/super/tenants/${caterer.id}`,
    // The card has a 3-dot menu of its own, so it carries a stretched link instead of being wrapped in one.
    cardOwnsLink: true,
    searchText: `${caterer.name} ${caterer.slug} ${caterer.ownerName} ${caterer.email ?? ""}`,
    sortValues: { name: caterer.name, orders: caterer.orders, newest: caterer.createdAt.getTime() },
    card: (
      <div className="relative flex h-full flex-col gap-4 p-5" data-testid="caterer-card">
        <div className="flex items-start gap-4">
          <Avatar name={caterer.name} size="lg" />
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="flex items-start justify-between gap-2">
              <Link href={`/super/tenants/${caterer.id}`} className="truncate text-base font-semibold after:absolute after:inset-0 after:content-['']">
                {caterer.name}
              </Link>
              <span className="relative z-10 -mt-1 -mr-1 shrink-0">
                <CatererCardMenu tenantId={caterer.id} name={caterer.name} status={caterer.status} />
              </span>
            </span>
            <span className="flex items-center gap-2 text-sm text-muted-foreground">
              <Link2 className="size-4 shrink-0" />
              <span className="truncate font-mono text-[13px]">{caterer.slug}</span>
            </span>
            {caterer.email && (
              <span className="flex items-center gap-2 text-sm text-muted-foreground">
                <Mail className="size-4 shrink-0" />
                <span className="truncate">{caterer.email}</span>
              </span>
            )}
            <div className="mt-1 flex flex-wrap gap-1.5">
              <TenantStatusBadge status={caterer.status} />
              <PlanBadge planName={caterer.planName} trialing={caterer.trialing} trialEndsAt={caterer.trialEndsAt} />
            </div>
          </div>
        </div>
        <div className="mt-auto grid grid-cols-2 divide-x divide-border border-t border-border pt-4">
          <div className="flex items-center gap-3 pr-3">
            <ShoppingBag className="size-5 shrink-0 text-muted-foreground" />
            <div className="flex flex-col">
              <span className="text-xs text-muted-foreground">Orders</span>
              <span className="text-base font-semibold tabular-nums">{caterer.orders}</span>
            </div>
          </div>
          <div className="flex items-center gap-3 pl-3">
            <CalendarDays className="size-5 shrink-0 text-muted-foreground" />
            <div className="flex flex-col">
              <span className="text-xs text-muted-foreground">Joined</span>
              <span className="text-sm font-semibold">{longDate(caterer.createdAt)}</span>
            </div>
          </div>
        </div>
      </div>
    ),
    listRow: (
      <>
        <TableCell className="px-3 py-3">
          <div className="flex items-center gap-3" data-testid="caterer-row">
            <Avatar name={caterer.name} size="sm" />
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="max-w-52 truncate font-semibold">{caterer.name}</span>
              <span className="max-w-52 truncate text-xs text-muted-foreground">
                {caterer.slug}
                {caterer.setupIncomplete ? " · setup incomplete" : ""}
              </span>
            </div>
          </div>
        </TableCell>
        <TableCell className="px-3 py-3">
          <div className="flex flex-col gap-0.5 text-sm text-muted-foreground">
            <span>{caterer.ownerName || "—"}</span>
            {caterer.email && <span className="max-w-52 truncate text-xs">{caterer.email}</span>}
          </div>
        </TableCell>
        <TableCell className="px-3 py-3">
          <PlanBadge planName={caterer.planName} trialing={caterer.trialing} trialEndsAt={caterer.trialEndsAt} />
        </TableCell>
        <TableCell className="px-3 py-3">
          <TenantStatusBadge status={caterer.status} />
        </TableCell>
        <TableCell className="px-3 py-3">
          <div className="flex items-center gap-2 text-sm font-medium tabular-nums">
            <ShoppingBag className="size-5 shrink-0 text-muted-foreground" />
            {caterer.orders}
          </div>
        </TableCell>
        <TableCell className="px-3 py-3">
          <div className="flex items-center gap-2 text-sm whitespace-nowrap">
            <CalendarDays className="size-5 shrink-0 text-muted-foreground" />
            {longDate(caterer.createdAt)}
          </div>
        </TableCell>
      </>
    ),
  }));

  return (
    <>
      <PageHeader
        crumbs={[{ label: "Catering" }, { label: "Caterers" }]}
        title="Caterers"
        description="Every caterer on the catering product."
        action={
          <Button render={<Link href="/super/tenants/new" />} nativeButton={false}>
            <UserPlus />
            New Caterer
          </Button>
        }
      />
      <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by status">
        {FILTERS.map((filter) => (
          <Link
            key={filter.label}
            href={filter.value ? `/super/tenants?status=${filter.value}` : "/super/tenants"}
            className={cn("flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium", activeFilter === filter.value ? "border-primary bg-accent text-primary" : "border-border bg-card hover:bg-muted")}
          >
            {filter.label}
            <span className={cn("rounded-full px-1.5 text-xs", activeFilter === filter.value ? "bg-background" : "bg-secondary text-muted-foreground")}>{counts[filter.count]}</span>
          </Link>
        ))}
      </div>
      <CatalogBrowser
        entries={entries}
        columns={["Caterer", "Owner", "Plan", "Status", "Orders", "Joined"]}
        searchPlaceholder="Search caterers by name, link or owner…"
        emptyLabel="No caterers yet."
        sortOptions={sortOptions}
        richList
        defaultView="list"
        gridColumnsClassName="grid-cols-[repeat(auto-fill,minmax(min(20rem,100%),1fr))]"
        pageSize={16}
      />
    </>
  );
}
