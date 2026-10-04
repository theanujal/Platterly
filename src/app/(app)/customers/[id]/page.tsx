import type { Metadata } from "next";
import { VISIT_SOURCE_LABEL } from "@/modules/storefront-visits/visit-math";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, CalendarDays, ChevronRight, Leaf, Drumstick, Mail, Phone, ShoppingBag, User } from "lucide-react";
import { cn } from "cn";
import { requireActiveOrganization, requirePermission, hasPermission } from "@/lib/auth/require-session";
import { prisma } from "@/lib/db";
import { canonicalUrl } from "@/lib/seo/canonical";
import { getCustomer } from "@/modules/customers/customer";
import { listAbandonedOrders } from "@/modules/menu-approvals/storefront-draft";
import { stepLabel } from "@/modules/menu-approvals/storefront-draft-constants";
import { formatAmountExact, getGuestCount } from "@/modules/orders/order-card";
import { formatPhoneDisplay } from "@/lib/phone";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { STATUS_ICON as ORDER_STATUS_ICON, STATUS_LABEL as ORDER_STATUS_LABEL, STATUS_VARIANT as ORDER_STATUS_VARIANT } from "../../orders/_components/order-display";
import { STATUS_ICON as QUOTE_STATUS_ICON, STATUS_LABEL as QUOTE_STATUS_LABEL, STATUS_VARIANT as QUOTE_STATUS_VARIANT } from "../../quotations/_components/quotation-display";
import { EditCustomerDialog } from "../_components/edit-customer-dialog";
import { CustomerNotes, type NoteRow } from "../_components/customer-notes";
import { listCustomerNotes } from "@/modules/customers/customer-notes";
import { DeleteCustomerButton } from "../_components/delete-customer-button";
import { CustomerAvatar, CustomerStatusBadge, buildMenuMessageHref, formatLastOrder } from "../_components/customer-display";
import { DetailTabs, FilterableRows, type FilterableRow } from "../_components/customer-detail-client";
import type { CustomerFormValues } from "../_components/customer-form";
import { WhatsAppIcon } from "@/components/icons/whatsapp-icon";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Customer — Platterly",
  robots: { index: false, follow: false },
};

const LEAD_SOURCE_LABEL: Record<string, string> = {
  STOREFRONT: "Public Menu Link",
  MANUAL_ENTRY: "Manual Entry",
  REFERRAL: "Referral",
  WEBSITE: "Website",
  SOCIAL_MEDIA: "Social Media",
  ADVERTISEMENT: "Advertisement",
  COLD_CALL: "Cold Call",
  NETWORKING: "Networking",
  OTHER: "Other",
};

const ACTIVITY_DOT = {
  customer: "bg-info",
  order: "bg-tone-orange",
  quotation: "bg-tone-violet",
  draft: "bg-tone-teal",
  note: "bg-tone-pink",
} as const;

function formatWhen(date: Date): string {
  const day = date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  const time = date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return `${day}, ${time}`;
}

function formatDay(date: Date | null): string {
  return date ? date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—";
}

function Stat({ caption, children }: { caption: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className="text-xs text-muted-foreground">{caption}</span>
      <span className="truncate text-sm font-semibold">{children}</span>
    </div>
  );
}

function RowShell({ href, icon, children }: { href?: string; icon: React.ReactNode; children: React.ReactNode }) {
  const body = (
    <div className="flex items-center gap-4 rounded-xl bg-card p-4 ring-1 ring-foreground/10 transition-colors hover:bg-muted/40">
      <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">{icon}</div>
      <div className="grid min-w-0 flex-1 grid-cols-2 items-center gap-x-4 gap-y-3 @2xl:grid-cols-[minmax(0,1.3fr)_repeat(3,minmax(0,1fr))_auto]">{children}</div>
      {href && <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden />}
    </div>
  );
  return href ? (
    <Link href={href} className="block">
      {body}
    </Link>
  ) : (
    body
  );
}

/** Chunk 22: where a storefront lead first came from (their first journey that has a recorded visit). */
async function loadArrival(organizationId: string, customerId: string, showIp: boolean) {
  const draft = await prisma.storefrontDraft.findFirst({ where: { organizationId, customerId, visitId: { not: null } }, orderBy: { createdAt: "asc" }, select: { visitId: true } });
  if (!draft?.visitId) return null;
  const visit = await prisma.storefrontVisit.findFirst({ where: { id: draft.visitId, organizationId } });
  if (!visit) return null;
  const label = VISIT_SOURCE_LABEL[visit.source];
  return { text: visit.sourceDetail && visit.sourceDetail !== label.toLowerCase() ? `${label} (${visit.sourceDetail})` : label, ip: showIp ? visit.ipAddress : null };
}

export default async function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { organizationId } = await requireActiveOrganization();
  await requirePermission({ customers: ["view"] }, organizationId);
  const canSeeIp = await hasPermission({ tenant: ["view"] }, organizationId);
  const arrival = await loadArrival(organizationId, id, canSeeIp);
  const [customer, canEdit, canDelete, organization, orders, quotations, allDrafts, customerNotes] = await Promise.all([
    getCustomer(organizationId, id),
    hasPermission({ customers: ["edit"] }, organizationId),
    hasPermission({ customers: ["delete"] }, organizationId),
    prisma.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { name: true, slug: true, slugChangeCount: true } }),
    prisma.order.findMany({ where: { organizationId, customerId: id }, include: { eventType: { select: { name: true } } }, orderBy: { createdAt: "desc" } }),
    prisma.quotation.findMany({ where: { organizationId, customerId: id }, include: { eventType: { select: { name: true } } }, orderBy: { createdAt: "desc" } }),
    listAbandonedOrders(organizationId, "ALL"),
    listCustomerNotes(organizationId, id),
  ]);
  const noteRows: NoteRow[] = customerNotes.map((n) => ({ id: n.id, body: n.body, authorName: n.authorName, createdAt: n.createdAt.toISOString(), updatedAt: n.updatedAt.toISOString() }));
  if (!customer) notFound();
  const drafts = allDrafts.filter((draft) => draft.customer.id === id);

  const initialValues: CustomerFormValues = {
    name: customer.name,
    phone: customer.phone,
    email: customer.email ?? "",
    notes: customer.notes ?? "",
    isActive: customer.isActive,
    isEnquiry: customer.isEnquiry,
    leadSource: customer.leadSource ?? "MANUAL_ENTRY",
  };
  const menuUrl = organization.slugChangeCount > 0 ? canonicalUrl(`/${organization.slug}`) : null;
  const menuHref = buildMenuMessageHref(customer, organization.name, menuUrl);

  const orderRows: FilterableRow[] = orders.map((order) => {
    const StatusIcon = ORDER_STATUS_ICON[order.status];
    const total = Number(order.total);
    const guests = getGuestCount(order);
    const isVeg = order.menuPreference === "VEGETARIAN";
    return {
      id: order.id,
      searchText: `${order.orderNumber ?? ""} ${order.eventType?.name ?? ""}`,
      status: order.status,
      node: (
        <RowShell href={`/orders/${order.id}`} icon={<User className="size-5" />}>
          <div className="flex min-w-0 flex-col">
            <span className="font-semibold whitespace-nowrap text-primary">{order.orderNumber ?? "Order"}</span>
            <span className="text-xs text-muted-foreground">{formatDay(order.eventStartDate)}</span>
          </div>
          <Stat caption="Event Type">{order.eventType?.name ?? "—"}</Stat>
          <Stat caption="Guests">{guests ?? "—"}</Stat>
          <Stat caption="Total">{total > 0 ? formatAmountExact(total) : "—"}</Stat>
          <div className="flex flex-wrap items-center gap-2">
            {order.menuPreference && (
              <span className={cn("flex items-center gap-1 text-xs font-medium", isVeg ? "text-success" : "text-destructive")}>
                {isVeg ? <Leaf className="size-3.5" /> : <Drumstick className="size-3.5" />}
                {isVeg ? "Veg" : "Non-Veg"}
              </span>
            )}
            <Badge variant={ORDER_STATUS_VARIANT[order.status]}>
              <StatusIcon data-icon="inline-start" />
              {ORDER_STATUS_LABEL[order.status]}
            </Badge>
          </div>
        </RowShell>
      ),
    };
  });
  const orderStatusOptions = [...new Set(orders.map((o) => o.status))].map((value) => ({ value, label: ORDER_STATUS_LABEL[value] }));

  const quotationRows: FilterableRow[] = quotations.map((quotation) => {
    const StatusIcon = QUOTE_STATUS_ICON[quotation.status];
    const total = Number(quotation.total);
    return {
      id: quotation.id,
      searchText: quotation.eventType?.name ?? "",
      status: quotation.status,
      node: (
        <RowShell href={`/quotations/${quotation.id}`} icon={<User className="size-5" />}>
          <div className="flex min-w-0 flex-col">
            <span className="font-semibold">Quotation</span>
            <span className="text-xs text-muted-foreground">Created {formatDay(quotation.createdAt)}</span>
          </div>
          <Stat caption="Event Type">{quotation.eventType?.name ?? "—"}</Stat>
          <Stat caption="Event Date">{formatDay(quotation.eventStartDate)}</Stat>
          <Stat caption="Total">{total > 0 ? formatAmountExact(total) : "—"}</Stat>
          <Badge variant={QUOTE_STATUS_VARIANT[quotation.status]}>
            <StatusIcon data-icon="inline-start" />
            {QUOTE_STATUS_LABEL[quotation.status]}
          </Badge>
        </RowShell>
      ),
    };
  });
  const quotationStatusOptions = [...new Set(quotations.map((q) => q.status))].map((value) => ({ value, label: QUOTE_STATUS_LABEL[value] }));

  const draftRows: FilterableRow[] = drafts.map((draft) => {
    const state = draft.isExpired ? "EXPIRED" : draft.isAbandoned ? "ABANDONED" : "IN_PROGRESS";
    const badge =
      state === "EXPIRED" ? <Badge variant="neutral">Expired</Badge> : state === "ABANDONED" ? <Badge variant="warning">Abandoned</Badge> : <Badge variant="info">In progress</Badge>;
    return {
      id: draft.id,
      searchText: `${draft.eventTypeName ?? ""} ${stepLabel(draft.currentStep)}`,
      status: state,
      node: (
        <RowShell icon={<ShoppingBag className="size-5" />}>
          <div className="flex min-w-0 flex-col">
            <span className="font-semibold">{draft.eventTypeName ?? "Event"}</span>
            <span className="text-xs text-muted-foreground">Last active {formatDay(draft.lastActivityAt)}</span>
          </div>
          <Stat caption="Event Date">{formatDay(new Date(draft.eventDate))}</Stat>
          <Stat caption="Guests">{draft.guestCount}</Stat>
          <Stat caption="Stopped at">{stepLabel(draft.currentStep)}</Stat>
          {badge}
        </RowShell>
      ),
    };
  });

  const activity = [
    { key: "customer", kind: "customer" as const, title: "Customer added", at: customer.createdAt },
    ...orders.map((o) => ({ key: `o-${o.id}`, kind: "order" as const, title: `Order ${o.orderNumber ?? ""} created`.replace("  ", " "), at: o.createdAt })),
    ...quotations.map((q) => ({ key: `q-${q.id}`, kind: "quotation" as const, title: "Quotation created", at: q.createdAt })),
    ...customerNotes.map((n) => ({ key: `n-${n.id}`, kind: "note" as const, title: `${n.authorName} added a note`, at: n.createdAt })),
    ...drafts.map((d) => ({ key: `d-${d.id}`, kind: "draft" as const, title: "Started an order on the public menu link", at: d.lastActivityAt })),
  ].sort((a, b) => b.at.getTime() - a.at.getTime());

  const activityList = (items: typeof activity) => (
    <ol className="flex flex-col">
      {items.map((entry, index) => (
        <li key={entry.key} className="relative flex gap-3 pb-5 last:pb-0">
          {index < items.length - 1 && <span className="absolute top-4 left-[5px] h-full w-px bg-border" aria-hidden />}
          <span className={cn("mt-1.5 size-2.5 shrink-0 rounded-full", ACTIVITY_DOT[entry.kind])} />
          <div className="flex min-w-0 flex-col">
            <span className="text-sm font-medium">{entry.title}</span>
            <span className="text-xs text-muted-foreground">{formatWhen(entry.at)}</span>
          </div>
        </li>
      ))}
    </ol>
  );

  const tabs = [
    {
      key: "orders",
      label: "Orders",
      count: orders.length,
      content: <FilterableRows title="Orders" rows={orderRows} statusOptions={orderStatusOptions} searchPlaceholder="Search orders…" emptyLabel="No orders yet for this customer." />,
    },
    {
      key: "quotations",
      label: "Quotations",
      count: quotations.length,
      content: <FilterableRows title="Quotations" rows={quotationRows} statusOptions={quotationStatusOptions} searchPlaceholder="Search quotations…" emptyLabel="No quotations yet for this customer." />,
    },
    {
      key: "abandoned",
      label: "Abandoned Orders",
      count: drafts.length,
      content: (
        <FilterableRows
          title="Abandoned Orders"
          rows={draftRows}
          statusOptions={[
            { value: "IN_PROGRESS", label: "In progress" },
            { value: "ABANDONED", label: "Abandoned" },
            { value: "EXPIRED", label: "Expired" },
          ]}
          searchPlaceholder="Search abandoned orders…"
          emptyLabel="No unfinished orders from the public menu link."
        />
      ),
    },
    {
      key: "notes",
      label: "Notes",
      content: (
        <Card>
          <CardContent className="flex flex-col gap-3">
            <h2 className="text-xl font-semibold">Notes</h2>
            <CustomerNotes customerId={customer.id} notes={noteRows} canEdit={canEdit} idPrefix="tab" />
          </CardContent>
        </Card>
      ),
    },
    { key: "activity", label: "Activity", content: <Card><CardContent className="flex flex-col gap-4"><h2 className="text-xl font-semibold">Activity</h2>{activityList(activity)}</CardContent></Card> },
  ];

  return (
    <div className="flex flex-col gap-6 p-6 md:p-8">
      <Link href="/customers" className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground hover:underline">
        <ArrowLeft className="size-4" />
        Back to Customers
      </Link>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex min-w-0 flex-col gap-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex min-w-0 items-start gap-5">
              <CustomerAvatar name={customer.name} className="size-[76px] text-2xl" />
              <div className="flex min-w-0 flex-col gap-2">
                <div className="flex flex-wrap items-center gap-3">
                  <h1 className="text-3xl font-semibold">{customer.name}</h1>
                  <CustomerStatusBadge status={customer.status} />
                  {!customer.isActive && <Badge variant="neutral">Inactive</Badge>}
                </div>
                <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-muted-foreground">
                  <a href={`tel:${customer.phone}`} className="flex items-center gap-2 hover:text-foreground">
                    <Phone className="size-4" />
                    {formatPhoneDisplay(customer.phone)}
                  </a>
                  {customer.email && (
                    <a href={`mailto:${customer.email}`} className="flex items-center gap-2 hover:text-foreground">
                      <Mail className="size-4" />
                      {customer.email}
                    </a>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-muted-foreground">
                  <span className="flex items-center gap-2">
                    <CalendarDays className="size-4" />
                    {customer.status === "CUSTOMER" ? "Customer" : "Lead"} Since <span className="font-medium text-foreground">{formatLastOrder(customer.createdAt)}</span>
                  </span>
                  <span className="flex items-center gap-2">
                    <ShoppingBag className="size-4" />
                    Total Orders <span className="font-medium text-foreground">{orders.length}</span>
                  </span>
                  {arrival && (
                    <span className="flex items-center gap-2" data-testid="customer-arrival">
                      Arrived from <span className="font-medium text-foreground">{arrival.text}</span>
                      {arrival.ip && <span className="text-xs">IP {arrival.ip}</span>}
                    </span>
                  )}
                  {customer.isEnquiry && (
                    <span className="flex items-center gap-2">
                      Lead source <Badge variant="outline">{LEAD_SOURCE_LABEL[customer.leadSource ?? ""] ?? "—"}</Badge>
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button
                className="bg-[#25D366] text-white hover:bg-[#1FAD54]"
                disabled={!menuHref}
                title={menuHref ? undefined : "Claim your public menu link first (Settings → Integration)"}
                render={menuHref ? <a href={menuHref} target="_blank" rel="noreferrer" /> : undefined}
                nativeButton={!menuHref}
              >
                <WhatsAppIcon className="size-5" />
                Send Menu on WhatsApp
              </Button>
              {canEdit && <EditCustomerDialog customerId={customer.id} name={customer.name} initialValues={initialValues} triggerStyle="header" />}
              {canDelete && <DeleteCustomerButton customerId={customer.id} name={customer.name} />}
            </div>
          </div>

          <DetailTabs tabs={tabs} />
        </div>

        <aside className="flex flex-col gap-4">
          <Card>
            <CardContent className="flex flex-col gap-4">
              <h2 className="text-lg font-semibold">Recent Activity</h2>
              {activityList(activity.slice(0, 4))}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="flex flex-col gap-3">
              <h2 className="text-lg font-semibold">Notes</h2>
              <CustomerNotes customerId={customer.id} notes={noteRows} canEdit={canEdit} idPrefix="side" limit={3} />
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}
