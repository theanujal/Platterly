"use client";

import { useRouter } from "next/navigation";
import { QuotationForm } from "../../_components/quotation-form";
import { createQuotationAction } from "../../actions";

interface NewQuotationClientProps {
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
}

export function NewQuotationClient({ customers, eventTypes, menus, canBypassDateRestriction, header }: NewQuotationClientProps) {
  const router = useRouter();

  return (
    <QuotationForm
      header={header}
      customers={customers}
      eventTypes={eventTypes}
      menus={menus}
      canBypassDateRestriction={canBypassDateRestriction}
      submitLabel="Create Quotation"
      onSubmit={createQuotationAction}
      onSuccess={() => router.push("/quotations")}
    />
  );
}
