"use client";

import { useRouter } from "next/navigation";
import { QuotationForm, type QuotationFormValues } from "../../_components/quotation-form";
import { updateQuotationAction } from "../../actions";

interface EditQuotationClientProps {
  quotationId: string;
  initialValues: QuotationFormValues;
  customers: { id: string; name: string; phone: string }[];
  eventTypes: { id: string; name: string }[];
  menus: { id: string; name: string; price: number }[];
  menuItems: { id: string; name: string; price: number }[];
  addOns: { id: string; name: string; price: number }[];
  canBypassDateRestriction: boolean;
}

export function EditQuotationClient({ quotationId, initialValues, customers, eventTypes, menus, menuItems, addOns, canBypassDateRestriction }: EditQuotationClientProps) {
  const router = useRouter();

  return (
    <QuotationForm
      customers={customers}
      eventTypes={eventTypes}
      menus={menus}
      menuItems={menuItems}
      addOns={addOns}
      canBypassDateRestriction={canBypassDateRestriction}
      initialValues={initialValues}
      submitLabel="Save changes"
      onSubmit={(formData) => updateQuotationAction(quotationId, formData)}
      onSuccess={() => router.refresh()}
    />
  );
}
