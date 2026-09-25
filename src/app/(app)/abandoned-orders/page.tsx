import type { Metadata } from "next";
import { ShoppingBasket, MessageCircle } from "lucide-react";
import { requireActiveOrganization, requirePermission } from "@/lib/auth/require-session";
import { prisma } from "@/lib/db";
import { canonicalUrl } from "@/lib/seo/canonical";
import { formatPhoneDisplay, whatsappDigits } from "@/lib/phone";
import { listAbandonedOrders } from "@/modules/menu-approvals/storefront-draft";
import { stepLabel, DRAFT_RETENTION_DAYS } from "@/modules/menu-approvals/storefront-draft-constants";
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

  const entries: CatalogEntry[] = drafts.map((draft) => {
    const { customer } = draft;
    const resumeUrl = canonicalUrl(`/${organization.slug}/plan/${draft.id}`);
    const message = `Hi ${customer.name}, this is ${organization.name}. We saw you started planning ${draft.eventTypeName ? `your ${draft.eventTypeName}` : "your event"} but didn't get to finish — pick up right where you left off: ${resumeUrl}`;
    const whatsappHref = `https://wa.me/${whatsappDigits(customer.phone)}?text=${encodeURIComponent(message)}`;
    const status = draft.isAbandoned ? "ABANDONED" : "ACTIVE";
    const statusBadge = <Badge variant={draft.isAbandoned ? "warning" : "info"}>{draft.isAbandoned ? "Abandoned" : "In progress"}</Badge>;
    const consentBadge = <Badge variant={customer.marketingConsent ? "success" : "neutral"}>{customer.marketingConsent ? "Offers OK" : "Order updates only"}</Badge>;
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
      card: (
        <div className="flex flex-col gap-2 p-4">
          <div className="flex items-start justify-between gap-2">
            <span className="flex items-center gap-1.5 font-medium">
              <ShoppingBasket className="size-4 text-muted-foreground" />
              {customer.name}
            </span>
            {statusBadge}
          </div>
          <span className="text-sm text-muted-foreground">{formatPhoneDisplay(customer.phone)}</span>
          <span className="text-xs text-muted-foreground">
            {draft.eventTypeName ?? "Event"} · {draft.guestCount} guests · {draft.eventDate}
          </span>
          <span className="text-xs text-muted-foreground">
            Stopped at <span className="font-medium text-foreground">{stepLabel(draft.currentStep)}</span> · {timeAgo(draft.lastActivityAt)}
          </span>
          <div className="flex flex-wrap items-center gap-2">{consentBadge}</div>
          {actions}
        </div>
      ),
      listRow: (
        <>
          <TableCell className="font-medium">{customer.name}</TableCell>
          <TableCell>{formatPhoneDisplay(customer.phone)}</TableCell>
          <TableCell className="text-muted-foreground">
            {draft.eventTypeName ?? "—"} · {draft.eventDate}
          </TableCell>
          <TableCell>{stepLabel(draft.currentStep)}</TableCell>
          <TableCell className="text-muted-foreground">{timeAgo(draft.lastActivityAt)}</TableCell>
          <TableCell>{statusBadge}</TableCell>
          <TableCell>{consentBadge}</TableCell>
          <TableCell>{actions}</TableCell>
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
        columns={["Name", "Phone", "Event", "Stopped at", "Last activity", "Status", "Consent", "Follow up"]}
        searchPlaceholder="Search abandoned orders…"
        emptyLabel="No abandoned orders — everyone who started an order has finished it."
        filterOptions={filterOptions}
        sortOptions={sortOptions}
        defaultView="list"
        pageSize={16}
      />
    </div>
  );
}
