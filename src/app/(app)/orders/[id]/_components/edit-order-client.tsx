"use client";

import { useRouter } from "next/navigation";
import { OrderForm, type OrderFormValues } from "../../_components/order-form";
import { updateOrderAction, updateOrderAndNotifyAction } from "../../actions";

interface EditOrderClientProps {
  orderId: string;
  initialValues: OrderFormValues;
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
  /** See OrderForm's own doc comment — non-zero only for an Order converted from a Quotation. */
  carriedOverItemsSubtotal?: number;
  canBypassDateRestriction: boolean;
}

export function EditOrderClient({ orderId, initialValues, customers, eventTypes, menus, carriedOverItemsSubtotal, canBypassDateRestriction }: EditOrderClientProps) {
  const router = useRouter();

  return (
    <OrderForm
      customers={customers}
      eventTypes={eventTypes}
      menus={menus}
      carriedOverItemsSubtotal={carriedOverItemsSubtotal}
      canBypassDateRestriction={canBypassDateRestriction}
      initialValues={initialValues}
      showStatus
      submitLabel="Save changes"
      onSubmit={(formData) => updateOrderAction(orderId, formData)}
      onSubmitAndNotify={(formData) => updateOrderAndNotifyAction(orderId, formData)}
      onSuccess={() => router.refresh()}
    />
  );
}
