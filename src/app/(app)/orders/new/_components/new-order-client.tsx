"use client";

import { useRouter } from "next/navigation";
import { OrderForm } from "../../_components/order-form";
import { createOrderAction, createOrderAndNotifyAction } from "../../actions";

interface NewOrderClientProps {
  customers: { id: string; name: string; phone: string }[];
  eventTypes: { id: string; name: string }[];
  menus: {
    id: string;
    name: string;
    price: number;
    childUnder5Chargeable: boolean;
    childUnder5Price: number | null;
    child5To10PricingType: "PERCENTAGE" | "FIXED";
    child5To10PriceValue: number | null;
  }[];
  canBypassDateRestriction: boolean;
}

export function NewOrderClient({ customers, eventTypes, menus, canBypassDateRestriction }: NewOrderClientProps) {
  const router = useRouter();

  return (
    <OrderForm
      customers={customers}
      eventTypes={eventTypes}
      menus={menus}
      canBypassDateRestriction={canBypassDateRestriction}
      submitLabel="Create Order"
      onSubmit={createOrderAction}
      onSubmitAndNotify={createOrderAndNotifyAction}
      onSuccess={() => router.push("/orders")}
    />
  );
}
