import { notFound } from "next/navigation";
import { requireActiveOrganization, requirePermission, hasPermission } from "@/lib/auth/require-session";
import { getQuotation, getOrIssueQuotationLink } from "@/modules/quotations/quotation";
import { listCustomers } from "@/modules/customers/customer";
import { listEventTypes } from "@/modules/events/event-type";
import { listMenus } from "@/modules/menus/menu";
import { Badge } from "@/components/ui/badge";
import { CopyButton } from "@/components/ui/copy-button";
import { PageBreadcrumb } from "@/components/ui/breadcrumb";
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

const STATUS_VARIANT: Record<QuotationStatus, "neutral" | "info" | "warning" | "success" | "danger"> = {
  DRAFT: "neutral",
  SENT: "info",
  VIEWED: "info",
  CHANGES_REQUESTED: "warning",
  ACCEPTED: "success",
  REJECTED: "danger",
  EXPIRED: "neutral",
};

function toDateInputValue(date: Date | null) {
  return date ? date.toISOString().slice(0, 10) : "";
}

export default async function QuotationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { organizationId } = await requireActiveOrganization();
  await requirePermission({ quotations: ["edit"] }, organizationId);
  const [quotation, customers, eventTypes, menus, canBypassDateRestriction] = await Promise.all([
    getQuotation(organizationId, id),
    listCustomers(organizationId),
    listEventTypes(organizationId),
    listMenus(organizationId),
    hasPermission({ orders: ["bypass_date_restriction"] }, organizationId),
  ]);
  if (!quotation) notFound();

  const shareableLink = quotation.status !== "DRAFT" ? await getOrIssueQuotationLink(organizationId, id) : null;

  const initialValues: QuotationFormValues = {
    customerId: quotation.customerId,
    eventTypeId: quotation.eventTypeId ?? "",
    menuPreference: quotation.menuPreference ?? "",
    orderKind: quotation.orderKind,
    eventStartDate: toDateInputValue(quotation.eventStartDate),
    eventEndDate: toDateInputValue(quotation.eventEndDate),
    venue: quotation.venue ?? "",
    eventAddress: quotation.eventAddress ?? "",
    adultCount: quotation.adultCount?.toString() ?? "",
    childBelow5Count: quotation.childBelow5Count?.toString() ?? "",
    child5To10Count: quotation.child5To10Count?.toString() ?? "",
    totalParticipants: quotation.totalParticipants?.toString() ?? "",
    pricingMethod: quotation.pricingMethod,
    individualChildBelow5Rate: quotation.individualChildBelow5Rate?.toString() ?? "",
    individualChildBelow5PricingType: quotation.individualChildBelow5PricingType ?? "FIXED",
    individualChild5To10Rate: quotation.individualChild5To10Rate?.toString() ?? "",
    individualChild5To10PricingType: quotation.individualChild5To10PricingType ?? "FIXED",
    individualPricingEnabled: quotation.individualPricingEnabled,
    validUntil: toDateInputValue(quotation.validUntil),
    terms: quotation.terms ?? "",
    notes: quotation.notes ?? "",
    discount: quotation.discount.toString(),
    taxes: quotation.taxes.toString(),
    additionalCharges: quotation.additionalCharges.toString(),
    deliveryCharges: quotation.deliveryCharges.toString(),
    mealPlanEntries: quotation.mealPlanEntries.map((entry) => ({
      date: toDateInputValue(entry.date),
      mealType: entry.mealType,
      price: entry.price?.toString() ?? "",
      menuId: entry.menuId ?? "",
      items: entry.items.map((item) => ({
        key: item.id,
        itemType: item.itemType === "ADD_ON" ? ("ADD_ON" as const) : ("MENU_ITEM" as const),
        catalogId: (item.itemType === "ADD_ON" ? item.addOnId : item.menuItemId) ?? "",
        name: item.name,
        unitPrice: Number(item.unitPrice),
        // Extras and per-plate add-ons were saved with a per-guest quantity.
        perGuest: item.itemType === "ADD_ON" ? item.quantity > 1 : item.isExtra,
      })),
    })),
  };

  return (
    <div className="flex flex-col gap-6 p-6 md:p-8">
      <EditQuotationClient
        quotationId={quotation.id}
        initialValues={initialValues}
        header={
          <div className="flex flex-col gap-4">
            <PageBreadcrumb items={[{ label: "Quotations", href: "/quotations" }, { label: "Quotation" }]} />
            <div>
              <h1 className="text-2xl font-semibold">Quotation for {quotation.customer.name}</h1>
              <div className="mt-1 flex items-center gap-2">
                <Badge variant={STATUS_VARIANT[quotation.status]}>{STATUS_LABEL[quotation.status]}</Badge>
              </div>
            </div>
          </div>
        }
        headerActions={<QuotationStatusActions quotationId={quotation.id} status={quotation.status} hasOrder={Boolean(quotation.order)} />}
        beforeContent={
          <>
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
          </>
        }
        customers={customers.map((c) => ({ id: c.id, name: c.name, phone: c.phone }))}
        eventTypes={eventTypes.filter((t) => t.isActive || t.id === quotation.eventTypeId).map((t) => ({ id: t.id, name: t.name }))}
        menus={menus
          .filter((m) => m.isActive)
          .map((m) => ({
            id: m.id,
            name: m.name,
            menuType: m.menuType,
            price: Number(m.pricePerPlate),
            childUnder5Chargeable: m.childUnder5Chargeable,
            childUnder5Price: m.childUnder5Price !== null ? Number(m.childUnder5Price) : null,
            child5To10PricingType: m.child5To10PricingType,
            child5To10PriceValue: m.child5To10PriceValue !== null ? Number(m.child5To10PriceValue) : null,
          }))}
        canBypassDateRestriction={canBypassDateRestriction}
      />
    </div>
  );
}
