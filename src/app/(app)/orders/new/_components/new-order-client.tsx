"use client";

import { useRouter } from "next/navigation";
import { OrderForm } from "../../_components/order-form";
import { createOrderAction, createOrderAndNotifyAction } from "../../actions";

interface NewOrderClientProps {
  customers: { id: string; name: string; phone: string }[];
  eventTypes: { id: string; name: string }[];
  menus: { id: string; name: string; price: number }[];
  menuItems: { id: string; name: string; price: number }[];
  addOns: { id: string; name: string; price: number }[];
}

export function NewOrderClient({ customers, eventTypes, menus, menuItems, addOns }: NewOrderClientProps) {
  const router = useRouter();

  return (
    <OrderForm
      customers={customers}
      eventTypes={eventTypes}
      menus={menus}
      menuItems={menuItems}
      addOns={addOns}
      submitLabel="Create Order"
      onSubmit={createOrderAction}
      onSubmitAndNotify={createOrderAndNotifyAction}
      onSuccess={() => router.push("/orders")}
    />
  );
}
