import type { Metadata } from "next";
import Link from "next/link";
import { ClipboardList } from "lucide-react";
import { requireActiveOrganization, requirePermission } from "@/lib/auth/require-session";
import { listEnquiries } from "@/modules/enquiries/enquiry";
import { listEventTypes } from "@/modules/events/event-type";
import { listMenus } from "@/modules/menus/menu";
import { Badge } from "@/components/ui/badge";
import { TableCell } from "@/components/ui/table";
import { CatalogBrowser, type CatalogEntry } from "@/components/catalog/catalog-browser";
import { AddLeadDialog } from "./_components/add-lead-dialog";
import { EnquiryRowActions } from "./_components/enquiry-row-actions";
import type { EnquiryFormValues } from "./_components/enquiry-form";
import { EnquiryStatusFilter } from "./_components/enquiry-status-filter";
import type { EnquiryStatus } from "@/generated/prisma/enums";

export const metadata: Metadata = {
  title: "Enquiries — Platterly",
  robots: { index: false, follow: false },
};

const STATUS_LABEL: Record<EnquiryStatus, string> = {
  NEW: "New",
  CONTACTED: "Contacted",
  QUOTATION_SENT: "Quotation Sent",
  FOLLOW_UP: "Follow-up",
  CONVERTED: "Converted",
  LOST: "Lost",
};

const STATUS_VARIANT: Record<EnquiryStatus, "default" | "secondary" | "outline" | "destructive"> = {
  NEW: "secondary",
  CONTACTED: "outline",
  QUOTATION_SENT: "default",
  FOLLOW_UP: "outline",
  CONVERTED: "default",
  LOST: "destructive",
};

interface EnquiriesPageProps {
  searchParams: Promise<{ status?: string }>;
}

export default async function EnquiriesPage({ searchParams }: EnquiriesPageProps) {
  const { organizationId } = await requireActiveOrganization();
  await requirePermission({ enquiries: ["view"] }, organizationId);
  const { status } = await searchParams;
  const validStatus = status && status in STATUS_LABEL ? (status as EnquiryStatus) : undefined;

  const [enquiries, eventTypes, menus] = await Promise.all([
    listEnquiries(organizationId, { status: validStatus }),
    listEventTypes(organizationId),
    listMenus(organizationId),
  ]);

  const eventTypeOptions = eventTypes.filter((t) => t.isActive).map((t) => ({ id: t.id, name: t.name }));
  const menuOptions = menus.filter((m) => m.isActive).map((m) => ({ id: m.id, name: m.name }));

  const entries: CatalogEntry[] = enquiries.map((enquiry) => {
    const initialValues: EnquiryFormValues = {
      name: enquiry.name,
      phone: enquiry.phone,
      leadSource: enquiry.leadSource,
      status: enquiry.status,
      eventTypeId: enquiry.eventTypeId ?? "",
      eventDate: enquiry.eventDate ? enquiry.eventDate.toISOString().slice(0, 10) : "",
      guestCount: enquiry.guestCount?.toString() ?? "",
      venue: enquiry.venue ?? "",
      requirements: enquiry.requirements ?? "",
      budget: enquiry.budget?.toString() ?? "",
      preferredMenuId: enquiry.preferredMenuId ?? "",
      notes: enquiry.notes ?? "",
    };

    return {
      id: enquiry.id,
      searchText: `${enquiry.name} ${enquiry.phone} ${enquiry.venue ?? ""}`,
      card: (
        <div className="flex flex-col gap-1.5 p-4">
          <div className="flex items-start justify-between gap-2">
            <span className="flex items-center gap-1.5 font-medium">
              <ClipboardList className="size-4 text-muted-foreground" />
              {enquiry.name}
            </span>
            <EnquiryRowActions
              enquiryId={enquiry.id}
              name={enquiry.name}
              initialValues={initialValues}
              eventTypes={eventTypeOptions}
              menus={menuOptions}
              customerId={enquiry.customer?.id ?? null}
            />
          </div>
          <span className="text-sm text-muted-foreground">{enquiry.phone}</span>
          {enquiry.eventType && <span className="text-xs text-muted-foreground">{enquiry.eventType.name}</span>}
          <Badge variant={STATUS_VARIANT[enquiry.status]} className="w-fit">
            {STATUS_LABEL[enquiry.status]}
          </Badge>
        </div>
      ),
      listRow: (
        <>
          <TableCell className="font-medium">{enquiry.name}</TableCell>
          <TableCell>{enquiry.phone}</TableCell>
          <TableCell className="text-muted-foreground">{enquiry.eventType?.name ?? "—"}</TableCell>
          <TableCell>
            <Badge variant={STATUS_VARIANT[enquiry.status]}>{STATUS_LABEL[enquiry.status]}</Badge>
          </TableCell>
          <TableCell>
            <EnquiryRowActions
              enquiryId={enquiry.id}
              name={enquiry.name}
              initialValues={initialValues}
              eventTypes={eventTypeOptions}
              menus={menuOptions}
              customerId={enquiry.customer?.id ?? null}
            />
          </TableCell>
        </>
      ),
    };
  });

  return (
    <div className="flex flex-col gap-4 p-6 md:p-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Enquiries</h1>
          <p className="text-sm text-muted-foreground">Leads and enquiries — the early stage of the customer journey.</p>
        </div>
        <AddLeadDialog />
      </div>

      <div className="flex items-center justify-between gap-2">
        <EnquiryStatusFilter />
        <Link href="/customers" className="text-xs text-muted-foreground hover:text-foreground hover:underline">
          View Customers →
        </Link>
      </div>

      <CatalogBrowser
        entries={entries}
        addTile={<AddLeadDialog variant="tile" />}
        columns={["Name", "Phone", "Event Type", "Status", "Actions"]}
        searchPlaceholder="Search enquiries…"
        emptyLabel="No enquiries yet."
      />
    </div>
  );
}
