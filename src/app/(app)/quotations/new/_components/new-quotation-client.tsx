"use client";

import { useRouter } from "next/navigation";
import { QuotationForm } from "../../_components/quotation-form";
import { createQuotationAction } from "../../actions";

interface NewQuotationClientProps {
  customers: { id: string; name: string; phone: string }[];
  eventTypes: { id: string; name: string }[];
  menus: { id: string; name: string; price: number }[];
  menuItems: { id: string; name: string; price: number }[];
  addOns: { id: string; name: string; price: number }[];
  canBypassDateRestriction: boolean;
}

export function NewQuotationClient({ customers, eventTypes, menus, menuItems, addOns, canBypassDateRestriction }: NewQuotationClientProps) {
  const router = useRouter();

  return (
    <QuotationForm
      customers={customers}
      eventTypes={eventTypes}
      menus={menus}
      menuItems={menuItems}
      addOns={addOns}
      canBypassDateRestriction={canBypassDateRestriction}
      submitLabel="Create Quotation"
      onSubmit={createQuotationAction}
      onSuccess={() => router.push("/quotations")}
    />
  );
}
