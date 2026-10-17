"use client";

import { useRouter } from "next/navigation";
import { OrderForm } from "../../_components/order-form";
import { createOrderAction, createOrderAndNotifyAction } from "../../actions";

interface NewOrderClientProps {
  customers: { id: string; name: string; phone: string; email: string | null }[];
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
  header: React.ReactNode;
  /** The viewer may see prices (Sensitive data: orderPrices). See OrderForm. */
  showPrices: boolean;
}

export function NewOrderClient({ customers, eventTypes, menus, header, showPrices }: NewOrderClientProps) {
  const router = useRouter();

  return (
    <OrderForm
      header={header}
      customers={customers}
      eventTypes={eventTypes}
      menus={menus}
      showPrices={showPrices}
      submitLabel="Save Order"
      onSubmit={createOrderAction}
      onSubmitAndNotify={createOrderAndNotifyAction}
      onSuccess={() => router.push("/orders")}
    />
  );
}
