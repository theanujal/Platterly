"use client";

import { useRouter } from "next/navigation";
import { QuotationForm, type QuotationFormValues } from "../../_components/quotation-form";
import { updateQuotationAction } from "../../actions";

interface EditQuotationClientProps {
  quotationId: string;
  initialValues: QuotationFormValues;
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
  header: React.ReactNode;
  headerActions?: React.ReactNode;
  beforeContent?: React.ReactNode;
}

export function EditQuotationClient({
  quotationId,
  initialValues,
  customers,
  eventTypes,
  menus,
  canBypassDateRestriction,
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
      initialValues={initialValues}
      submitLabel="Save changes"
      onSubmit={(formData) => updateQuotationAction(quotationId, formData)}
      onSuccess={() => router.refresh()}
    />
  );
}
