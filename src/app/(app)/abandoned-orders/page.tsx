import { createElement } from "react";
import type { Metadata } from "next";
import {
  Phone,
  Mail,
  MapPin,
  CalendarDays,
  Users,
  Dome,
  Leaf,
  Drumstick,
  CheckCircle2,
  Hourglass,
  Ban,
  type LucideIcon,
  type LucideProps,
} from "lucide-react";
import { cn } from "cn";
import { requireActiveOrganization, requirePermission } from "@/lib/auth/require-session";
import { prisma } from "@/lib/db";
import { canonicalUrl } from "@/lib/seo/canonical";
import { formatPhoneDisplay, whatsappDigits } from "@/lib/phone";
import { listAbandonedOrders } from "@/modules/menu-approvals/storefront-draft";
import { stepLabel, DRAFT_EXPIRY_DAYS } from "@/modules/menu-approvals/storefront-draft-constants";
import { formatEventWhen, formatEventDates } from "@/modules/orders/order-card";
import { MEAL_TYPE_LABEL } from "@/modules/menu-approvals/approval-snapshot";
import { getEventTypeIcon } from "@/lib/event-type-icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TableCell } from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import { CopyButton } from "@/components/ui/copy-button";
import { WhatsAppIcon } from "@/components/icons/whatsapp-icon";
import { PageBreadcrumb } from "@/components/ui/breadcrumb";
import { CatalogBrowser, type CatalogEntry, type CatalogFilterOption, type CatalogSortOption } from "@/components/catalog/catalog-browser";

// WhatsApp's own brand green (not a design-system token — same one-off
// exception apps make for a recognizable "Chat on WhatsApp" CTA, AJ 2026-09-28).
const WHATSAPP_TINT = "bg-[#25D366]/15 text-[#128C4A] hover:bg-[#25D366]/25";

// Badge pads its leading edge tighter when it sees this attribute on an icon child (same convention as order-card.tsx).
const INLINE_START_ICON = { "data-icon": "inline-start" } as LucideProps;

type FunnelState = "ACTIVE" | "ABANDONED" | "EXPIRED";
const FUNNEL_STATE_ICON: Record<FunnelState, LucideIcon> = { ACTIVE: Hourglass, ABANDONED: Users, EXPIRED: Ban };
const FUNNEL_STATE_LABEL: Record<FunnelState, string> = { ACTIVE: "In progress", ABANDONED: "Abandoned", EXPIRED: "Link expired" };
const FUNNEL_STATE_VARIANT = { ACTIVE: "info", ABANDONED: "warning", EXPIRED: "neutral" } as const;

function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

// One tinted circle + caption/value pair, per AJ's reference (2026-09-28) — each field gets its own established tone rather than a flat muted icon.
function StatCell({
  icon: Icon,
  tone,
  caption,
  value,
  nowrap,
}: {
  icon: LucideIcon;
  tone: string;
  caption: string;
  value: React.ReactNode;
  /** The date needs its full value on one line — AJ, 2026-09-28 (it was clipping). */
  nowrap?: boolean;
}) {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <div className={cn("flex size-10 shrink-0 items-center justify-center rounded-full", tone)}>
        <Icon className="size-4.5" />
      </div>
      <div className="flex min-w-0 flex-col">
        <span className="text-xs text-muted-foreground">{caption}</span>
        <span className={cn("text-sm font-semibold", nowrap ? "whitespace-nowrap" : "truncate")}>{value}</span>
      </div>
    </div>
  );
}

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
// remarketing is Chunk 21). Abandoned = idle 30+ minutes. Once a customer
// finishes on their own, submitDraft() already creates the real Order and
// flips the draft to COMPLETED, which drops it out of this list (nothing
// extra needed for "move it to Orders"). Idle DRAFT_EXPIRY_DAYS+ (AJ,
// 2026-09-28): the record stays — nothing is auto-deleted — but the resume
// link stops working and the follow-up actions disappear.
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
    const status: FunnelState = draft.isExpired ? "EXPIRED" : draft.isAbandoned ? "ABANDONED" : "ACTIVE";
    const StatusIcon = FUNNEL_STATE_ICON[status];
    const statusBadge = (
      <Badge variant={FUNNEL_STATE_VARIANT[status]}>
        <StatusIcon data-icon="inline-start" />
        {FUNNEL_STATE_LABEL[status]}
      </Badge>
    );
    const consentBadge = (
      <Badge variant={customer.marketingConsent ? "success" : "neutral"}>
        {customer.marketingConsent && <CheckCircle2 data-icon="inline-start" />}
        {customer.marketingConsent ? "Offers OK" : "Order updates only"}
      </Badge>
    );
    const isVeg = draft.menuPreference === "VEGETARIAN";
    const menuPreferenceLabel = isVeg ? "Vegetarian" : "Non-Vegetarian";
    const eventWhen = formatEventWhen(new Date(draft.eventDate), new Date(draft.eventDate), now);
    const eventDateLabel = formatEventDates(new Date(draft.eventDate), new Date(draft.eventDate));
    // Same action styling as the Customers card/list (AJ, 2026-09-30): a tinted WhatsApp button
    // plus an icon-only Copy link on the card, ghost icon buttons in the list. Once expired
    // there's nothing left to follow up on — the resume link itself no longer works.
    const expiredNote = <p className="text-sm text-muted-foreground">This link expired after {DRAFT_EXPIRY_DAYS} days of inactivity.</p>;
    const actions = draft.isExpired ? (
      <div className="text-center">{expiredNote}</div>
    ) : (
      <div className="flex items-center gap-2">
        <Button render={<a href={whatsappHref} target="_blank" rel="noopener noreferrer" />} nativeButton={false} size="md" className={`flex-1 ${WHATSAPP_TINT}`}>
          <WhatsAppIcon className="size-4" /> Send on WhatsApp
        </Button>
        <CopyButton value={resumeUrl} label="Copy link" size="md" iconOnly className="size-[38px]" />
      </div>
    );
    const listActions = draft.isExpired ? (
      <span className="text-xs whitespace-nowrap text-muted-foreground">Link expired</span>
    ) : (
      <div className="flex items-center justify-end gap-1">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Send resume link to ${customer.name} on WhatsApp`}
          className="text-[#128C4A]"
          render={<a href={whatsappHref} target="_blank" rel="noopener noreferrer" />}
          nativeButton={false}
        >
          <WhatsAppIcon className="size-4" />
        </Button>
        <CopyButton value={resumeUrl} label="Copy link" iconOnly className="border-transparent" />
      </div>
    );

    return {
      id: draft.id,
      searchText: `${customer.name} ${customer.phone} ${customer.email ?? ""} ${draft.eventTypeName ?? ""}`,
      filterValues: { state: status },
      sortValues: { recent: draft.lastActivityAt.getTime(), name: customer.name },
      // Entity Card (design system §08, Proposed — first built here 2026-09-27,
      // reshaped 2026-09-28 against AJ's own reference screenshot): an
      // initials avatar (shared primary tint, like the Order Card's avatar —
      // never a per-customer color) with name/phone/venue, a status badge +
      // recency top-right, tag badges, a 3-cell stat row (mirrors the Order
      // Card's §09 stats), and a 2-cell footer pairing the funnel step with
      // the menu preference (AJ's "Special Notes" doesn't exist as real data
      // yet — see storefront-draft.ts — so that slot was repurposed rather
      // than faked).
      card: (
        <div className="flex h-full flex-col gap-4 p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                {initials(customer.name)}
              </div>
              <span className="truncate text-base font-semibold">{customer.name}</span>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1">
              {statusBadge}
              <span className="text-xs text-muted-foreground">{timeAgo(draft.lastActivityAt)}</span>
            </div>
          </div>

          {/* Phone/email/venue get the card's full width (AJ, 2026-09-28) — squeezed next to the avatar and status column, the email had no room and kept truncating to a couple of characters. */}
          <div className="flex min-w-0 flex-col gap-1">
            <div className="flex min-w-0 items-center gap-x-2 text-sm text-muted-foreground">
              <a href={`tel:${customer.phone}`} className="flex shrink-0 items-center gap-1.5 hover:text-foreground hover:underline">
                <Phone className="size-3.5 shrink-0" />
                {formatPhoneDisplay(customer.phone)}
              </a>
              {customer.email && (
                <>
                  <span className="h-3.5 w-px shrink-0 bg-border" aria-hidden="true" />
                  <a href={`mailto:${customer.email}`} className="flex min-w-0 flex-1 items-center gap-1.5 hover:text-foreground hover:underline">
                    <Mail className="size-3.5 shrink-0" />
                    <span className="min-w-0 truncate">{customer.email}</span>
                  </a>
                </>
              )}
            </div>
            {/* Only set once the visitor reaches the Venue & Delivery step — hidden otherwise, never invented. */}
            {draft.venueName && (
              <span className="flex min-w-0 items-center gap-1.5 text-sm text-muted-foreground">
                <MapPin className="size-3.5 shrink-0" />
                <span className="truncate">{draft.venueName}</span>
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {consentBadge}
            {draft.eventTypeName && (
              <Badge variant="outline">
                {createElement(getEventTypeIcon(draft.eventTypeIcon), INLINE_START_ICON)}
                {draft.eventTypeName}
              </Badge>
            )}
          </div>

          {/* Vertical dividers between cells, like the Order Card's stat row — no border-t above; the only horizontal rule on the card sits above the footer actions. Event Date gets extra width (like the Order Card's own stat row) since "26 Sept 2026" was clipping in an equal 1/3 share. */}
          <div className="grid grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)] items-center gap-x-3 divide-x divide-border">
            <div className="pr-3">
              <StatCell icon={CalendarDays} tone="bg-primary/10 text-primary" caption="Event Date" value={eventDateLabel} nowrap />
            </div>
            <div className="px-3">
              <StatCell icon={Users} tone="bg-info/10 text-info" caption="Guests" value={draft.guestCount} />
            </div>
            <div className="pl-3">
              <StatCell icon={Dome} tone="bg-tone-violet/10 text-tone-violet" caption="Meal" value={MEAL_TYPE_LABEL[draft.eventMealType]} />
            </div>
          </div>

          <div className="grid grid-cols-2 items-center gap-x-3 divide-x divide-border">
            <div className="pr-3">
              <StatCell icon={MapPin} tone="bg-primary/10 text-primary" caption="Stopped at" value={stepLabel(draft.currentStep)} />
            </div>
            <div className="pl-3">
              <StatCell
                icon={isVeg ? Leaf : Drumstick}
                tone={isVeg ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"}
                caption="Menu Preference"
                value={menuPreferenceLabel}
              />
            </div>
          </div>

          <div className="mt-auto border-t border-border pt-4">{actions}</div>
        </div>
      ),
      // Rich list (design system §09) — a Customer cell (avatar, name, phone)
      // and an Event cell (date, event type below) merged the same way
      // Orders' list merges cells, instead of separate Name/Phone columns.
      listRow: (
        <>
          <TableCell className="px-3 py-3">
            <div className="flex items-center gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                {initials(customer.name)}
              </div>
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="max-w-44 truncate font-semibold">{customer.name}</span>
                <a href={`tel:${customer.phone}`} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground hover:underline">
                  <Phone className="size-3.5 shrink-0" />
                  {formatPhoneDisplay(customer.phone)}
                </a>
                {customer.email && (
                  <a href={`mailto:${customer.email}`} className="flex max-w-44 min-w-0 items-center gap-1 text-xs text-muted-foreground hover:text-foreground hover:underline">
                    <Mail className="size-3.5 shrink-0" />
                    <span className="truncate">{customer.email}</span>
                  </a>
                )}
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
          <TableCell className="px-3 py-3">
            <div className="flex flex-col gap-0.5">
              <span className="text-sm whitespace-nowrap text-muted-foreground">{stepLabel(draft.currentStep)}</span>
              <span className="text-xs whitespace-nowrap text-muted-foreground">{timeAgo(draft.lastActivityAt)}</span>
            </div>
          </TableCell>
          <TableCell className="px-3 py-3">
            <div className="flex flex-col items-start gap-1">
              {statusBadge}
              {consentBadge}
            </div>
          </TableCell>
          <TableCell className="px-3 py-3">{listActions}</TableCell>
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
        { value: "EXPIRED", label: "Link expired" },
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
          People who started an order on your public menu link but didn&apos;t submit it. They&apos;re already saved as Leads — reach out and help them finish. After {DRAFT_EXPIRY_DAYS} days of inactivity their resume link expires, though the record stays here.
        </p>
      </div>
      <Separator />

      <CatalogBrowser
        entries={entries}
        addTile={null}
        columns={["Customer", "Event", "Guests", "Stopped at", "Status", ""]}
        searchPlaceholder="Search abandoned orders…"
        emptyLabel="No abandoned orders — everyone who started an order has finished it."
        filterOptions={filterOptions}
        sortOptions={sortOptions}
        defaultView="list"
        richList
        // The card now carries a 3-cell stat row plus a 2-cell footer (AJ's
        // reference, 2026-09-28) and needs more room than the default grid
        // gives it — same reasoning as Orders' own override
        // (CatalogBrowser's gridColumnsClassName doc).
        gridColumnsClassName="grid-cols-[repeat(auto-fill,minmax(min(26.5rem,100%),1fr))]"
        pageSize={16}
      />
    </div>
  );
}
