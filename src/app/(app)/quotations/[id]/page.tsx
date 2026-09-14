import { notFound } from "next/navigation";
import { requireActiveOrganization, requirePermission } from "@/lib/auth/require-session";
import { getQuotation, getOrIssueQuotationLink } from "@/modules/quotations/quotation";
import { listCustomers } from "@/modules/customers/customer";
import { listEventTypes } from "@/modules/events/event-type";
import { listMenus } from "@/modules/menus/menu";
import { listMenuItems } from "@/modules/menus/item";
import { prisma } from "@/lib/db";
import { CopyButton } from "@/components/ui/copy-button";
import { EditQuotationClient } from "./_components/edit-quotation-client";
import { QuotationStatusActions } from "./_components/quotation-status-actions";
import type { QuotationFormValues } from "../_components/quotation-form";
import type { QuotationStatus } from "@/generated/prisma/enums";

const STATUS_LABEL: Record<QuotationStatus, string> = {
  DRAFT: "Draft",
  SENT: "Sent",
  VIEWED: "Viewed",
  CHANGES_REQUESTED: "Changes Requested",
  ACCEPTED: "Accepted",
  REJECTED: "Rejected",
  EXPIRED: "Expired",
};

function toDateInputValue(date: Date | null) {
  return date ? date.toISOString().slice(0, 10) : "";
}

export default async function QuotationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { organizationId } = await requireActiveOrganization();
  await requirePermission({ quotations: ["edit"] }, organizationId);
  const [quotation, customers, eventTypes, menus, menuItems, addOns] = await Promise.all([
    getQuotation(organizationId, id),
    listCustomers(organizationId),
    listEventTypes(organizationId),
    listMenus(organizationId),
    listMenuItems(organizationId, { isActive: true }),
    prisma.addOn.findMany({ where: { organizationId, isActive: true }, orderBy: { name: "asc" } }),
  ]);
  if (!quotation) notFound();

  const shareableLink = quotation.status !== "DRAFT" ? await getOrIssueQuotationLink(organizationId, id) : null;

  const initialValues: QuotationFormValues = {
    customerId: quotation.customerId,
    eventTypeId: quotation.eventTypeId ?? "",
    eventStartDate: toDateInputValue(quotation.eventStartDate),
    eventEndDate: toDateInputValue(quotation.eventEndDate),
    venue: quotation.venue ?? "",
    eventAddress: quotation.eventAddress ?? "",
    validUntil: toDateInputValue(quotation.validUntil),
    terms: quotation.terms ?? "",
    notes: quotation.notes ?? "",
    discount: quotation.discount.toString(),
    taxes: quotation.taxes.toString(),
    additionalCharges: quotation.additionalCharges.toString(),
    deliveryCharges: quotation.deliveryCharges.toString(),
    items: quotation.items.map((item) => ({
      key: item.id,
      itemType: item.itemType,
      catalogId: item.menuId ?? item.menuItemId ?? item.addOnId ?? "",
      name: item.name,
      unitPrice: Number(item.unitPrice),
      quantity: item.quantity,
    })),
  };

  return (
    <div className="flex flex-col gap-6 p-6 md:p-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold">Quotation for {quotation.customer.name}</h1>
          <p className="text-sm text-muted-foreground">{STATUS_LABEL[quotation.status]}</p>
        </div>
        <QuotationStatusActions quotationId={quotation.id} status={quotation.status} hasOrder={Boolean(quotation.order)} />
      </div>

      {shareableLink && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted/30 p-3">
          <span className="text-sm text-muted-foreground">Customer approval link:</span>
          <a href={shareableLink} target="_blank" rel="noopener" className="text-sm font-medium text-primary hover:underline">
            {shareableLink}
          </a>
          <CopyButton value={shareableLink} />
        </div>
      )}

      {quotation.customerMessage && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm">
          <span className="font-medium">Customer message: </span>
          {quotation.customerMessage}
        </div>
      )}

      <EditQuotationClient
        quotationId={quotation.id}
        initialValues={initialValues}
        customers={customers.map((c) => ({ id: c.id, name: c.name, phone: c.phone }))}
        eventTypes={eventTypes.filter((t) => t.isActive || t.id === quotation.eventTypeId).map((t) => ({ id: t.id, name: t.name }))}
        menus={menus.filter((m) => m.isActive).map((m) => ({ id: m.id, name: m.name, price: Number(m.pricePerPlate) }))}
        menuItems={menuItems.map((i) => ({ id: i.id, name: i.name, price: Number(i.price) }))}
        addOns={addOns.map((a) => ({ id: a.id, name: a.name, price: Number(a.price) }))}
      />
    </div>
  );
}
