import type { Metadata } from "next";
import { ShoppingBasket, MessageCircle, Phone, CalendarDays, Users } from "lucide-react";
import { requireActiveOrganization, requirePermission } from "@/lib/auth/require-session";
import { prisma } from "@/lib/db";
import { canonicalUrl } from "@/lib/seo/canonical";
import { formatPhoneDisplay, whatsappDigits } from "@/lib/phone";
import { listAbandonedOrders } from "@/modules/menu-approvals/storefront-draft";
import { stepLabel, DRAFT_RETENTION_DAYS } from "@/modules/menu-approvals/storefront-draft-constants";
import { formatEventWhen } from "@/modules/orders/order-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TableCell } from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import { CopyButton } from "@/components/ui/copy-button";
import { PageBreadcrumb } from "@/components/ui/breadcrumb";
import { CatalogBrowser, type CatalogEntry, type CatalogFilterOption, type CatalogSortOption } from "@/components/catalog/catalog-browser";

export const metadata: Metadata = {
  title: "Abandoned Orders — Platterly",
  robots: { index: false, follow: false },
};

function timeAgo(date: Date): string {
  const minutes = Math.max(1, Math.round((Date.now() - date.getTime()) / 60000));
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

// Chunk 12 — visitors who gave their contact details on the public storefront
// but never pressed Submit. They're already Leads in Customers; this is the
// follow-up list for reaching out (manually over WhatsApp today — automated
// remarketing is Chunk 21). Abandoned = idle 30+ minutes; drafts are kept 90
// days, after which only the Lead (0 orders) remains.
export default async function AbandonedOrdersPage() {
  const { organizationId } = await requireActiveOrganization();
  await requirePermission({ orders: ["view"] }, organizationId);
  const [organization, drafts] = await Promise.all([
    prisma.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { name: true, slug: true } }),
    listAbandonedOrders(organizationId, "ALL"),
  ]);
  const now = new Date();

  const entries: CatalogEntry[] = drafts.map((draft) => {
    const { customer } = draft;
    const resumeUrl = canonicalUrl(`/${organization.slug}/plan/${draft.id}`);
    const message = `Hi ${customer.name}, this is ${organization.name}. We saw you started planning ${draft.eventTypeName ? `your ${draft.eventTypeName}` : "your event"} but didn't get to finish — pick up right where you left off: ${resumeUrl}`;
    const whatsappHref = `https://wa.me/${whatsappDigits(customer.phone)}?text=${encodeURIComponent(message)}`;
    const status = draft.isAbandoned ? "ABANDONED" : "ACTIVE";
    const statusBadge = <Badge variant={draft.isAbandoned ? "warning" : "info"}>{draft.isAbandoned ? "Abandoned" : "In progress"}</Badge>;
    const consentBadge = <Badge variant={customer.marketingConsent ? "success" : "neutral"}>{customer.marketingConsent ? "Offers OK" : "Order updates only"}</Badge>;
    const eventWhen = formatEventWhen(new Date(draft.eventDate), new Date(draft.eventDate), now);
    const actions = (
      <div className="flex items-center gap-2">
        <Button render={<a href={whatsappHref} target="_blank" rel="noopener noreferrer" />} nativeButton={false} size="md" variant="outline">
          <MessageCircle /> WhatsApp
        </Button>
        <CopyButton value={resumeUrl} label="Copy link" size="md" />
      </div>
    );

    return {
      id: draft.id,
      searchText: `${customer.name} ${customer.phone} ${customer.email ?? ""} ${draft.eventTypeName ?? ""}`,
      filterValues: { state: status },
      sortValues: { recent: draft.lastActivityAt.getTime(), name: customer.name },
      // Entity Card (design system §08, Proposed — AJ approved 2026-09-27 to
      // build it here first): icon+title head with the status badge, a
      // step-progress eyebrow, the phone as meta, consent + event type as the
      // badge row, and a footer pairing guest/date info with the recency, same
      // slots the doc's Customer/Quotation example fills.
      card: (
        <div className="flex h-full flex-col gap-3 p-4">
          <div className="flex items-start justify-between gap-2">
            <span className="flex items-center gap-1.5 font-medium">
              <ShoppingBasket className="size-4 text-muted-foreground" />
              {customer.name}
            </span>
            {statusBadge}
          </div>
          <span className="text-xs text-muted-foreground">
            Stopped at <span className="font-medium text-foreground">{stepLabel(draft.currentStep)}</span>
          </span>
          <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Phone className="size-3.5 shrink-0" />
            {formatPhoneDisplay(customer.phone)}
          </span>
          <div className="flex flex-wrap items-center gap-1.5">
            {consentBadge}
            {draft.eventTypeName && <Badge variant="outline">{draft.eventTypeName}</Badge>}
          </div>
          <div className="mt-auto flex flex-col gap-3 border-t border-border pt-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium">
                {draft.guestCount} guests · {eventWhen}
              </span>
              <span className="text-xs text-muted-foreground">{timeAgo(draft.lastActivityAt)}</span>
            </div>
            {actions}
          </div>
        </div>
      ),
      // Rich list (design system §09) — a Customer cell (avatar, name, phone)
      // and an Event cell (date, event type below) merged the same way
      // Orders' list merges cells, instead of separate Name/Phone columns.
      listRow: (
        <>
          <TableCell className="px-3 py-3">
            <div className="flex items-center gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                <ShoppingBasket className="size-5" />
              </div>
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="max-w-44 truncate font-semibold">{customer.name}</span>
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Phone className="size-3.5 shrink-0" />
                  {formatPhoneDisplay(customer.phone)}
                </span>
              </div>
            </div>
          </TableCell>
          <TableCell className="px-3 py-3">
            <div className="flex items-center gap-3">
              <CalendarDays className="size-5 shrink-0 text-muted-foreground" />
              <div className="flex flex-col gap-0.5">
                <span className="text-sm font-medium whitespace-nowrap">{eventWhen}</span>
                {draft.eventTypeName && <span className="max-w-40 truncate text-xs text-muted-foreground">{draft.eventTypeName}</span>}
              </div>
            </div>
          </TableCell>
          <TableCell className="px-3 py-3">
            <span className="flex items-center gap-2 text-sm font-medium">
              <Users className="size-5 shrink-0 text-muted-foreground" />
              {draft.guestCount}
            </span>
          </TableCell>
          <TableCell className="px-3 py-3 text-sm text-muted-foreground">{stepLabel(draft.currentStep)}</TableCell>
          <TableCell className="px-3 py-3 text-sm text-muted-foreground">{timeAgo(draft.lastActivityAt)}</TableCell>
          <TableCell className="px-3 py-3">{statusBadge}</TableCell>
          <TableCell className="px-3 py-3">{consentBadge}</TableCell>
          <TableCell className="px-3 py-3">{actions}</TableCell>
        </>
      ),
    };
  });

  const filterOptions: CatalogFilterOption[] = [
    {
      key: "state",
      allLabel: "All",
      options: [
        { value: "ABANDONED", label: "Abandoned" },
        { value: "ACTIVE", label: "In progress" },
      ],
    },
  ];
  const sortOptions: CatalogSortOption[] = [{ value: "recent", label: "Most Recent", key: "recent", direction: "desc" }];

  return (
    <div className="flex flex-col gap-4 p-6 md:p-8">
      <PageBreadcrumb items={[{ label: "Dashboard", href: "/dashboard" }, { label: "Abandoned Orders" }]} />
      <div>
        <h1 className="text-2xl font-semibold">Abandoned Orders</h1>
        <p className="text-sm text-muted-foreground">
          People who started an order on your public menu link but didn&apos;t submit it. They&apos;re already saved as Leads — reach out and help them finish. Drafts are kept for {DRAFT_RETENTION_DAYS} days.
        </p>
      </div>
      <Separator />

      <CatalogBrowser
        entries={entries}
        addTile={null}
        columns={["Customer", "Event", "Guests", "Stopped at", "Last activity", "Status", "Consent", "Follow up"]}
        searchPlaceholder="Search abandoned orders…"
        emptyLabel="No abandoned orders — everyone who started an order has finished it."
        filterOptions={filterOptions}
        sortOptions={sortOptions}
        defaultView="list"
        richList
        // The default grid columns are too narrow for the WhatsApp + Copy
        // link buttons to sit side by side without clipping — same reasoning
        // as Orders' own override (CatalogBrowser's gridColumnsClassName doc).
        gridColumnsClassName="grid-cols-[repeat(auto-fill,minmax(min(19rem,100%),1fr))]"
        pageSize={16}
      />
    </div>
  );
}
