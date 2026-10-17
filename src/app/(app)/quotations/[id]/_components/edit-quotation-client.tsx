"use client";

import { useRouter } from "next/navigation";
import { QuotationForm, type QuotationFormValues } from "../../_components/quotation-form";
import { updateQuotationAction } from "../../actions";
import type { QuotationStatus } from "@/generated/prisma/enums";

interface EditQuotationClientProps {
  quotationId: string;
  initialValues: QuotationFormValues;
  status: QuotationStatus;
  customerMessage: string | null;
  customers: { id: string; name: string; phone: string }[];
  eventTypes: { id: string; name: string }[];
  menus: {
    id: string;
    name: string;
    menuType: "VEGETARIAN" | "NON_VEGETARIAN";
    price: number;
    childUnder5Chargeable: boolean;
    childUnder5Price: number | null;
    child5To10PricingType: "PERCENTAGE" | "FIXED";
    child5To10PriceValue: number | null;
  }[];
  canBypassDateRestriction: boolean;
  /** Whether the viewer may see prices (Sensitive data: orderPrices). */
  showPrices: boolean;
  header: React.ReactNode;
  headerActions?: React.ReactNode;
  beforeContent?: React.ReactNode;
}

export function EditQuotationClient({
  quotationId,
  initialValues,
  status,
  customerMessage,
  customers,
  eventTypes,
  menus,
  canBypassDateRestriction,
  showPrices,
  header,
  headerActions,
  beforeContent,
}: EditQuotationClientProps) {
  const router = useRouter();

  return (
    <QuotationForm
      header={header}
      headerActions={headerActions}
      beforeContent={beforeContent}
      customers={customers}
      eventTypes={eventTypes}
      menus={menus}
      canBypassDateRestriction={canBypassDateRestriction}
      showPrices={showPrices}
      initialValues={initialValues}
      status={status}
      quotationId={quotationId}
      customerMessage={customerMessage}
      submitLabel="Save changes"
      onSubmit={(formData) => updateQuotationAction(quotationId, formData)}
      onSuccess={() => router.refresh()}
    />
  );
}
