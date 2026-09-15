"use client";

import { useRouter } from "next/navigation";
import { OrderForm, type OrderFormValues } from "../../_components/order-form";
import { updateOrderAction, updateOrderAndNotifyAction } from "../../actions";

interface EditOrderClientProps {
  orderId: string;
  initialValues: OrderFormValues;
  customers: { id: string; name: string; phone: string }[];
  eventTypes: { id: string; name: string }[];
  menus: { id: string; name: string; price: number }[];
  menuItemsByMenu: Record<string, { id: string; name: string; price: number }[]>;
  menuItems: { id: string; name: string; price: number }[];
  addOns: { id: string; name: string; price: number }[];
}

export function EditOrderClient({ orderId, initialValues, customers, eventTypes, menus, menuItemsByMenu, menuItems, addOns }: EditOrderClientProps) {
  const router = useRouter();

  return (
    <OrderForm
      customers={customers}
      eventTypes={eventTypes}
      menus={menus}
      menuItemsByMenu={menuItemsByMenu}
      menuItems={menuItems}
      addOns={addOns}
      initialValues={initialValues}
      showStatus
      submitLabel="Save changes"
      onSubmit={(formData) => updateOrderAction(orderId, formData)}
      onSubmitAndNotify={(formData) => updateOrderAndNotifyAction(orderId, formData)}
      onSuccess={() => router.refresh()}
    />
  );
}
